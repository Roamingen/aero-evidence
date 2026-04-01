const { ethers } = require('ethers');
const { hashJson, loadDeploymentInfo, loadArtifact, createProvider } = require('../../scripts/chain_helpers');
const maintenanceStore = require('../models/maintenanceStore');
const userStore = require('../models/userStore');
const { getPool } = require('../config/database');

// ─── Reverse enum mappings (from AviationMaintenanceV2.sol) ───

const STATUS_BY_ENUM = ['draft', 'submitted', 'peer_checked', 'rii_approved', 'released', 'rejected', 'revoked'];
const SIGNER_ROLE_BY_ENUM = ['technician', 'reviewer', 'rii_inspector', 'release_authority', 'system_node'];
const SIGNATURE_ACTION_BY_ENUM = ['submit', 'technician_sign', 'reviewer_sign', 'rii_approve', 'release', 'reject', 'revoke'];

const HASH_LABELS = {
    formHash: '表单数据',
    faultHash: '故障信息',
    partsHash: '部件信息',
    measurementsHash: '测量数据',
    replacementsHash: '更换记录',
    attachmentManifestHash: '附件清单',
};

const ROLE_LABELS = {
    technician: '技术员',
    reviewer: '审核员',
    rii_inspector: 'RII 检查员',
    release_authority: '放行人员',
    system_node: '系统节点',
};

const ACTION_LABELS = {
    submit: '提交',
    technician_sign: '技术签名',
    reviewer_sign: '审核签名',
    rii_approve: 'RII 批准',
    release: '放行',
    reject: '驳回',
    revoke: '撤回',
};

// ─── Helpers ───

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function getReadOnlyContract() {
    const deploymentInfo = loadDeploymentInfo();
    if (!deploymentInfo || !deploymentInfo.address) {
        throw createError('未找到合约部署信息，无法连接区块链', 503);
    }
    const artifact = loadArtifact();
    const provider = createProvider();
    return new ethers.Contract(deploymentInfo.address, artifact.abi, provider);
}

// Strip extra DB fields so hash input matches original submission

function stripParts(parts) {
    return (parts || []).map((p) => ({
        partRole: p.partRole,
        partNumber: p.partNumber,
        serialNumber: p.serialNumber,
        partStatus: p.partStatus,
        sourceDescription: p.sourceDescription,
        replacementReason: p.replacementReason,
        sortOrder: p.sortOrder,
    }));
}

function stripMeasurements(measurements) {
    return (measurements || []).map((m) => ({
        testItemName: m.testItemName,
        measuredValues: m.measuredValues,
        isPass: m.isPass,
        sortOrder: m.sortOrder,
    }));
}

function stripReplacements(replacements) {
    return (replacements || []).map((r) => ({
        removedPartNo: r.removedPartNo,
        removedSerialNo: r.removedSerialNo,
        removedStatus: r.removedStatus,
        installedPartNo: r.installedPartNo,
        installedSerialNo: r.installedSerialNo,
        installedSource: r.installedSource,
        replacementReason: r.replacementReason,
        sortOrder: r.sortOrder,
    }));
}

// ─── Core verification ───

async function verifyRecord(recordId) {
    if (!/^0x[a-fA-F0-9]{64}$/.test(recordId)) {
        throw createError('recordId 必须是 0x 开头的 64 位十六进制字符串', 400);
    }

    // 1. Read from blockchain
    let chainRecord, chainSignatures;
    try {
        const contract = getReadOnlyContract();
        [chainRecord, chainSignatures] = await Promise.all([
            contract.getRecord(recordId),
            contract.getSignatures(recordId),
        ]);
    } catch (error) {
        if (error.message && error.message.includes('Record not found')) {
            const dbRecord = await maintenanceStore.getRecordDetailByRecordId(recordId);
            return {
                found: false,
                existsInDatabase: Boolean(dbRecord),
                error: 'record_not_found_on_chain',
                message: dbRecord
                    ? '该记录存在于数据库但尚未上链'
                    : '该记录在链上和数据库中均不存在',
            };
        }
        throw error;
    }

    // 2. Read from MySQL
    const record = await maintenanceStore.getRecordDetailByRecordId(recordId);
    if (!record) {
        return {
            found: false,
            existsOnChain: true,
            error: 'record_not_found_in_database',
            message: '该记录存在于链上但数据库中无对应数据（可能已被删除）',
        };
    }

    // 3. Extract on-chain digest
    const chainDigest = {
        formHash: chainRecord.digest.formHash,
        faultHash: chainRecord.digest.faultHash,
        partsHash: chainRecord.digest.partsHash,
        measurementsHash: chainRecord.digest.measurementsHash,
        replacementsHash: chainRecord.digest.replacementsHash,
        attachmentManifestHash: chainRecord.digest.attachmentManifestHash,
    };

    // 4. Recompute hashes from MySQL data
    // Fetch raw payload row directly to match exactly what was hashed at finalize/submit time
    const pool = getPool();
    const [rawPayloadRows] = await pool.execute(
        'SELECT * FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1',
        [record.id]
    );
    const rawPayload = rawPayloadRows[0] || {};

    // Reconstruct formPayload exactly as draftService.finalizeDraft does
    // For occurrenceTime: prefer rawFormJson value to preserve original millisecond precision
    // (MySQL datetime truncates to seconds, causing hash mismatch)
    const rawFormJsonParsed = typeof rawPayload.raw_form_json === 'string'
        ? JSON.parse(rawPayload.raw_form_json)
        : (rawPayload.raw_form_json || {});
    const occurrenceTime = rawFormJsonParsed.occurrenceTime
        || (record.occurrenceTime ? new Date(record.occurrenceTime).toISOString() : null);

    const recomputedFormPayload = {
        aircraftRegNo: record.aircraftRegNo,
        aircraftType: record.aircraftType,
        jobCardNo: record.jobCardNo,
        revision: record.revision,
        ataCode: record.ataCode,
        workType: record.workType,
        locationCode: record.locationCode,
        performerEmployeeNo: record.performerEmployeeNo,
        performerName: record.performerName,
        occurrenceTime,
        workDescription: rawPayload.work_description,
        referenceDocument: rawPayload.reference_document,
        rawFormJson: rawFormJsonParsed,
        normalizedFormJson: rawPayload.normalized_form_json || null,
    };


    const recomputedFaultPayload = {
        faultCode: rawPayload.fault_code,
        faultDescription: rawPayload.fault_description,
    };

    const manifestJson = record.manifest
        ? (typeof record.manifest.manifestJson === 'string'
            ? JSON.parse(record.manifest.manifestJson)
            : record.manifest.manifestJson)
        : {};

    const recomputed = {
        formHash: hashJson(recomputedFormPayload),
        faultHash: hashJson(recomputedFaultPayload),
        partsHash: hashJson(stripParts(record.parts)),
        measurementsHash: hashJson(stripMeasurements(record.measurements)),
        replacementsHash: hashJson(stripReplacements(record.replacements)),
        attachmentManifestHash: hashJson(manifestJson),
    };

    // 5. Compare
    const hashComparisons = Object.keys(HASH_LABELS).map((name) => ({
        name,
        label: HASH_LABELS[name],
        onChain: chainDigest[name],
        recomputed: recomputed[name],
        match: chainDigest[name] === recomputed[name],
    }));

    const tamperedFields = hashComparisons.filter((h) => !h.match).map((h) => h.name);

    // 6. Batch-lookup signer addresses in users table
    const signerAddresses = [...new Set(chainSignatures.map((sig) => sig.signer.toLowerCase()))];
    let boundAddressMap = {};
    if (signerAddresses.length > 0) {
        const placeholders = signerAddresses.map(() => '?').join(', ');
        const [userRows] = await pool.execute(
            `SELECT address, employee_no, name FROM users WHERE address IN (${placeholders})`,
            signerAddresses
        );
        for (const row of userRows) {
            boundAddressMap[row.address.toLowerCase()] = { employeeNo: row.employee_no, name: row.name };
        }
    }

    // 7. Map on-chain signatures
    const signatureChain = chainSignatures.map((sig) => {
        const addrLower = sig.signer.toLowerCase();
        const boundUser = boundAddressMap[addrLower] || null;
        return {
            signerRole: SIGNER_ROLE_BY_ENUM[Number(sig.signerRole)] || `unknown(${sig.signerRole})`,
            signerRoleLabel: ROLE_LABELS[SIGNER_ROLE_BY_ENUM[Number(sig.signerRole)]] || '未知角色',
            action: SIGNATURE_ACTION_BY_ENUM[Number(sig.action)] || `unknown(${sig.action})`,
            actionLabel: ACTION_LABELS[SIGNATURE_ACTION_BY_ENUM[Number(sig.action)]] || '未知动作',
            signerAddress: sig.signer,
            signerEmployeeNo: sig.signerEmployeeNo,
            signedDigest: sig.signedDigest,
            signatureHash: sig.signatureHash,
            signedAt: new Date(Number(sig.signedAt) * 1000).toISOString(),
            addressBound: boundUser !== null,
            boundEmployeeNo: boundUser?.employeeNo || null,
            boundName: boundUser?.name || null,
        };
    });

    // 7. Return result
    return {
        found: true,
        verified: tamperedFields.length === 0,
        recordSummary: {
            recordId,
            aircraftRegNo: record.aircraftRegNo,
            aircraftType: record.aircraftType,
            jobCardNo: record.jobCardNo,
            revision: record.revision,
            ataCode: record.ataCode,
            workType: record.workType,
            locationCode: record.locationCode,
            performerEmployeeNo: record.performerEmployeeNo,
            performerName: record.performerName,
            status: record.status,
            chainStatus: STATUS_BY_ENUM[Number(chainRecord.core.status)],
            submittedAt: record.submittedAt,
            releasedAt: record.releasedAt,
        },
        hashComparisons,
        tamperedFields,
        signatureChain,
        signatureCount: signatureChain.length,
        verifiedAt: new Date().toISOString(),
    };
}

// ─── Tamper demo (admin only) ───

async function tamperRecord(recordId, adminAddress) {
    const admin = await userStore.findByAddress(adminAddress.toLowerCase());
    if (!admin) throw createError('当前地址未绑定账户', 401);
    if (!admin.permissions.includes('user.manage')) throw createError('需要管理员权限', 403);

    if (!/^0x[a-fA-F0-9]{64}$/.test(recordId)) {
        throw createError('recordId 格式不正确', 400);
    }

    const record = await maintenanceStore.getRecordDetailByRecordId(recordId);
    if (!record) throw createError('记录不存在', 404);
    if (!record.chainRecordId) throw createError('该记录尚未上链，无法进行篡改演示', 400);

    const pool = getPool();
    const [payloadRows] = await pool.execute(
        'SELECT work_description FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1',
        [record.id]
    );
    if (!payloadRows[0]) throw createError('记录 payload 不存在', 404);
    const originalValue = payloadRows[0].work_description || '';

    if (originalValue.startsWith('[TAMPERED')) {
        throw createError('该记录已被篡改，请先恢复后再操作', 400);
    }

    const tamperedValue = `[TAMPERED @ ${new Date().toISOString()}] ${originalValue}`;

    await pool.execute(
        'UPDATE maintenance_record_payloads SET work_description = ? WHERE record_id = ?',
        [tamperedValue, record.id]
    );

    return {
        success: true,
        recordId,
        tamperedField: 'workDescription',
        originalValue: originalValue || '',
        tamperedValue,
        affectedHash: 'formHash',
        message: '已篡改 workDescription 字段。重新验证将检测到 formHash 不一致。',
    };
}

async function restoreTamper(recordId, adminAddress) {
    const admin = await userStore.findByAddress(adminAddress.toLowerCase());
    if (!admin) throw createError('当前地址未绑定账户', 401);
    if (!admin.permissions.includes('user.manage')) throw createError('需要管理员权限', 403);

    if (!/^0x[a-fA-F0-9]{64}$/.test(recordId)) {
        throw createError('recordId 格式不正确', 400);
    }

    const record = await maintenanceStore.getRecordDetailByRecordId(recordId);
    if (!record) throw createError('记录不存在', 404);

    const pool = getPool();
    const [payloadRows] = await pool.execute(
        'SELECT work_description FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1',
        [record.id]
    );
    if (!payloadRows[0]) throw createError('记录 payload 不存在', 404);
    const currentValue = payloadRows[0].work_description || '';

    if (!currentValue.startsWith('[TAMPERED')) {
        throw createError('该记录未被篡改，无需恢复', 400);
    }

    const restoredValue = currentValue.replace(/^\[TAMPERED @ [^\]]*\]\s*/, '');

    await pool.execute(
        'UPDATE maintenance_record_payloads SET work_description = ? WHERE record_id = ?',
        [restoredValue, record.id]
    );

    return {
        success: true,
        recordId,
        restoredField: 'workDescription',
        previousValue: currentValue,
        restoredValue,
        message: '已恢复 workDescription 字段。重新验证应显示验证通过。',
    };
}

module.exports = {
    verifyRecord,
    tamperRecord,
    restoreTamper,
};
