const { ethers } = require('ethers');

const { getPool } = require('../src/config/database');
const maintenanceService = require('../src/services/maintenanceService');
const { hashJson } = require('./chain_helpers');

const DEMO_USERS = [
    {
        employeeNo: 'E1001',
        name: '张提交',
        department: '机务一部',
        roleCodes: ['engineer_submitter'],
        privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
    {
        employeeNo: 'E2001',
        name: '李审核',
        department: '适航放行组',
        roleCodes: ['engineer_approver'],
        privateKey: '0x59c6995e998f97a5a0044966f094538e4c1f65c01dc5f2cb6f0b5c6f7f0b6f52',
    },
    {
        employeeNo: 'E2002',
        name: '周放行',
        department: '适航放行组',
        roleCodes: ['engineer_approver'],
        privateKey: '0x5de4111afa1a4b94908f831031f1415f4524f7b8d70d820ee7da8db36805b97d',
    },
    {
        employeeNo: 'A9001',
        name: '王管理员',
        department: '信息管理室',
        roleCodes: ['admin'],
        privateKey: '0x7c852118294266a7013c9a7bd2073b55f4d5a6d52d58a3b16130ad13fe7a7c09',
    },
];

async function ensureDemoUsers(connection) {
    for (const demoUser of DEMO_USERS) {
        const wallet = new ethers.Wallet(demoUser.privateKey);
        const [userRows] = await connection.execute(
            'SELECT id FROM users WHERE employee_no = ? LIMIT 1',
            [demoUser.employeeNo]
        );

        let userId;
        if (userRows.length === 0) {
            const [result] = await connection.execute(
                `INSERT INTO users (employee_no, address, name, department, status, address_bound_at)
                 VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
                [demoUser.employeeNo, wallet.address.toLowerCase(), demoUser.name, demoUser.department]
            );
            userId = result.insertId;
        } else {
            userId = userRows[0].id;
            await connection.execute(
                `UPDATE users
                 SET address = ?,
                     name = ?,
                     department = ?,
                     status = 'active',
                     address_bound_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [wallet.address.toLowerCase(), demoUser.name, demoUser.department, userId]
            );
        }

        await connection.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
        for (const roleCode of demoUser.roleCodes) {
            await connection.execute(
                `INSERT INTO user_roles (user_id, role_id)
                 SELECT ?, id
                 FROM roles
                 WHERE code = ?`,
                [userId, roleCode]
            );
        }
    }
}

async function clearMaintenanceData(connection) {
    const tables = [
        'maintenance_attachment_upload_jobs',
        'maintenance_attachments',
        'maintenance_attachment_manifests',
        'maintenance_record_specified_signers',
        'maintenance_record_signatures',
        'maintenance_record_replacements',
        'maintenance_record_measurements',
        'maintenance_record_parts',
        'maintenance_record_payloads',
        'maintenance_records',
    ];

    await connection.execute('SET FOREIGN_KEY_CHECKS = 0');
    try {
        for (const tableName of tables) {
            await connection.execute(`DELETE FROM ${tableName}`);
        }
    } finally {
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');
    }
}

function buildDigest(recordId, action, hashes, signerEmployeeNo) {
    return hashJson({
        recordId,
        action,
        formHash: hashes.formHash,
        attachmentManifestHash: hashes.attachmentManifestHash,
        signerEmployeeNo,
    });
}

function buildManifest(tag, index) {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        attachments: [
            {
                attachmentId: `${tag}-DOC-${index}`,
                attachmentType: 'document',
                categoryCode: 'maintenance',
                fileName: `${tag.toLowerCase()}-${index}.pdf`,
                originalFileName: `${tag.toLowerCase()}-${index}.pdf`,
                mimeType: 'application/pdf',
                fileExtension: '.pdf',
                fileSize: 128000 + index,
                contentHash: ethers.id(`${tag}:${index}:content`),
                storageDisk: 'local',
                storagePath: `seed/${tag.toLowerCase()}/${index}.pdf`,
                previewPath: `seed/${tag.toLowerCase()}/${index}.png`,
                transcodedPath: null,
                uploadStatus: 'ready',
                uploadedAt: new Date().toISOString(),
            },
        ],
    };
}

function buildPayload(index, overrides = {}) {
    return {
        aircraftRegNo: overrides.aircraftRegNo || `B-32${10 + index}`,
        aircraftType: overrides.aircraftType || 'A320',
        ataCode: overrides.ataCode || `2${index}-1${index}`,
        workType: overrides.workType || '例行检查',
        locationCode: overrides.locationCode || `HGH-H${index}`,
        requiredTechnicianSignatures: overrides.requiredTechnicianSignatures ?? 1,
        requiredReviewerSignatures: overrides.requiredReviewerSignatures ?? 1,
        isRII: Boolean(overrides.isRII),
        occurrenceTime: new Date(Date.now() - index * 3600 * 1000).toISOString(),
        payload: {
            workDescription: overrides.workDescription || `自动注入测试记录 ${index}`,
            referenceDocument: overrides.referenceDocument || `AMM 20-${index} Demo`,
            faultCode: overrides.faultCode || `DEMO-${index}`,
            faultDescription: overrides.faultDescription || `本地链自动注入的演示故障 ${index}`,
        },
        parts: overrides.parts || [],
        measurements: overrides.measurements || [],
        replacements: overrides.replacements || [],
        manifest: overrides.manifest || buildManifest(overrides.workType || 'CHECK', index),
        specifiedSigners: overrides.specifiedSigners || [],
    };
}

async function submitDemoRecord(submitterUser, payload) {
    const submitterWallet = new ethers.Wallet(submitterUser.privateKey);
    const prepared = await maintenanceService.prepareSubmitRecord(submitterWallet.address, payload);
    const signature = await submitterWallet.signMessage(ethers.getBytes(prepared.signedDigest));
    return maintenanceService.submitRecord(submitterWallet.address, {
        ...prepared.requestBody,
        signedDigest: prepared.signedDigest,
        signature,
    });
}

async function appendDemoAction(actorUser, record, signerRole, action, extras = {}) {
    const actorWallet = new ethers.Wallet(actorUser.privateKey);
    const signedDigest = buildDigest(record.recordId, action, record.hashes, actorUser.employeeNo);
    const signature = await actorWallet.signMessage(ethers.getBytes(signedDigest));
    return maintenanceService.appendSignature(actorWallet.address, record.recordId, {
        signerRole,
        action,
        signedDigest,
        signature,
        ...extras,
    });
}

async function seedDemoRecords() {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await ensureDemoUsers(connection);
        await clearMaintenanceData(connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    const submitter = DEMO_USERS.find((item) => item.employeeNo === 'E1001');
    const approverOne = DEMO_USERS.find((item) => item.employeeNo === 'E2001');
    const approverTwo = DEMO_USERS.find((item) => item.employeeNo === 'E2002');

    const submittedRecord = await submitDemoRecord(submitter, buildPayload(1, {
        workType: '故障初检',
        specifiedSigners: [
            { signerRole: 'reviewer', employeeNo: approverOne.employeeNo, isRequired: true, sequenceNo: 0 },
        ],
    }));

    const rejectedRecord = await submitDemoRecord(submitter, buildPayload(2, {
        workType: '驳回案例',
        specifiedSigners: [
            { signerRole: 'reviewer', employeeNo: approverOne.employeeNo, isRequired: true, sequenceNo: 0 },
        ],
    }));
    await appendDemoAction(approverOne, rejectedRecord, 'reviewer', 'reject', { rejectionReason: '测试驳回：需要补充拆检照片。' });

    const releasedRecord = await submitDemoRecord(submitter, buildPayload(3, {
        workType: '放行案例',
        specifiedSigners: [
            { signerRole: 'reviewer', employeeNo: approverOne.employeeNo, isRequired: true, sequenceNo: 0 },
            { signerRole: 'release_authority', employeeNo: approverTwo.employeeNo, isRequired: true, sequenceNo: 1 },
        ],
    }));
    const releasedReviewed = await appendDemoAction(approverOne, releasedRecord, 'reviewer', 'reviewer_sign');
    await appendDemoAction(approverTwo, releasedReviewed, 'release_authority', 'release');

    const riiApprovedRecord = await submitDemoRecord(submitter, buildPayload(4, {
        workType: 'RII 检查案例',
        isRII: true,
        specifiedSigners: [
            { signerRole: 'reviewer', employeeNo: approverOne.employeeNo, isRequired: true, sequenceNo: 0 },
            { signerRole: 'rii_inspector', employeeNo: approverTwo.employeeNo, isRequired: true, sequenceNo: 1 },
        ],
    }));
    const riiReviewed = await appendDemoAction(approverOne, riiApprovedRecord, 'reviewer', 'reviewer_sign');
    await appendDemoAction(approverTwo, riiReviewed, 'rii_inspector', 'rii_approve');

    console.log('Seeded demo maintenance records successfully.');
    console.log(JSON.stringify({
        demoUsers: DEMO_USERS.map((item) => ({
            employeeNo: item.employeeNo,
            name: item.name,
            roleCodes: item.roleCodes,
            privateKey: item.privateKey,
            address: new ethers.Wallet(item.privateKey).address,
        })),
        seededStatuses: ['submitted', 'rejected', 'released', 'rii_approved'],
    }, null, 2));

    await pool.end();
}

seedDemoRecords().catch((error) => {
    console.error('Seed demo maintenance records failed:');
    console.error(error.message || error);
    process.exitCode = 1;
});