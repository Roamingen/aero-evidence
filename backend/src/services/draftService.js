const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ethers } = require('ethers');

const { getPool } = require('../config/database');
const maintenanceStore = require('../models/maintenanceStore');
const maintenanceService = require('./maintenanceService');
const maintenanceChainService = require('./maintenanceChainService');
const { hashJson } = require('../../scripts/chain_helpers');
const {
    computeFileHash,
    detectAttachmentType,
    ensureDraftAttachmentDir,
    sanitizeFileName,
    STORAGE_ATTACHMENTS_DIR,
} = require('../middlewares/uploadMiddleware');

const {
    buildActionDigest,
    buildFormPayload,
    buildFaultPayload,
    createSubmitInput,
    ensureSignatureMatchesAddress,
    generateJobCardNo,
    generateRecordId,
    normalizeManifest,
    normalizeParts,
    normalizeMeasurements,
    normalizeReplacements,
    requireCurrentUser,
    resolveSpecifiedSigners,
    validateSpecifiedSignerCoverage,
} = maintenanceService.__internal;

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeOptionalString(value) {
    const normalized = normalizeString(value);
    return normalized || null;
}

async function ensureDraftOwnership(draftId, currentUser) {
    const draft = await maintenanceStore.getDraftById(draftId);
    if (!draft) {
        throw createError('草稿不存在', 404);
    }
    if (draft.performerUserId !== currentUser.id) {
        throw createError('无权操作此草稿', 403);
    }
    return draft;
}

async function createDraft(currentAddress) {
    const currentUser = await requireCurrentUser(currentAddress);
    const jobCardNo = generateJobCardNo();

    const draftId = await maintenanceStore.insertDraftRecord({
        jobCardNo,
        performerUserId: currentUser.id,
        performerEmployeeNo: currentUser.employeeNo,
        performerName: currentUser.name,
        createdBy: currentUser.id,
    });

    return {
        draftId,
        jobCardNo,
        status: 'draft',
        performerEmployeeNo: currentUser.employeeNo,
        createdAt: new Date().toISOString(),
    };
}

async function listDrafts(currentAddress) {
    const currentUser = await requireCurrentUser(currentAddress);
    return maintenanceStore.listDraftsByUserId(currentUser.id);
}

async function getDraft(currentAddress, draftId) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    const detail = await maintenanceStore.getRecordDetailByRecordId(draft.recordId || `__draft_${draftId}`);
    if (detail) {
        return detail;
    }

    const attachments = await maintenanceStore.listAttachmentsByDraftId(draftId);
    return { ...draft, attachments };
}

async function saveDraft(currentAddress, draftId, body) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'draft' && draft.status !== 'finalized') {
        throw createError('只能编辑草稿或已定稿的记录', 400);
    }

    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();

        if (draft.status === 'finalized') {
            await maintenanceStore.revertDraftToEditing(draftId, connection);
        }

        const fields = {};
        if (body.aircraftRegNo !== undefined) fields.aircraftRegNo = normalizeOptionalString(body.aircraftRegNo);
        if (body.aircraftType !== undefined) fields.aircraftType = normalizeOptionalString(body.aircraftType);
        if (body.ataCode !== undefined) fields.ataCode = normalizeOptionalString(body.ataCode);
        if (body.workType !== undefined) fields.workType = normalizeOptionalString(body.workType);
        if (body.locationCode !== undefined) fields.locationCode = normalizeOptionalString(body.locationCode);
        if (body.requiredTechnicianSignatures !== undefined) fields.requiredTechnicianSignatures = Math.max(1, Number(body.requiredTechnicianSignatures) || 1);
        if (body.requiredReviewerSignatures !== undefined) fields.requiredReviewerSignatures = Math.max(0, Number(body.requiredReviewerSignatures) || 0);
        if (body.isRII !== undefined) fields.isRII = Boolean(body.isRII);
        if (body.occurrenceTime !== undefined) fields.occurrenceTime = body.occurrenceTime ? new Date(body.occurrenceTime) : null;

        await maintenanceStore.updateDraftFields(draftId, fields, connection);

        if (body.payload) {
            await maintenanceStore.updateDraftPayload(draftId, {
                workDescription: body.payload.workDescription,
                referenceDocument: body.payload.referenceDocument,
                faultCode: body.payload.faultCode,
                faultDescription: body.payload.faultDescription,
                rawFormJson: body.payload.rawFormJson || body.payload,
            }, connection);
        }

        if (Array.isArray(body.parts)) {
            const parts = normalizeParts(body.parts);
            await maintenanceStore.replaceDraftParts(draftId, parts, connection);
        }

        if (Array.isArray(body.measurements)) {
            const measurements = normalizeMeasurements(body.measurements);
            await maintenanceStore.replaceDraftMeasurements(draftId, measurements, connection);
        }

        if (Array.isArray(body.replacements)) {
            const replacements = normalizeReplacements(body.replacements);
            await maintenanceStore.replaceDraftReplacements(draftId, replacements, connection);
        }

        if (Array.isArray(body.specifiedSigners)) {
            const signers = await resolveSpecifiedSigners(body.specifiedSigners, []);
            await maintenanceStore.replaceDraftSpecifiedSigners(draftId, signers, connection);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return { draftId, updatedAt: new Date().toISOString() };
}

async function deleteDraft(currentAddress, draftId) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'draft' && draft.status !== 'finalized') {
        throw createError('只能删除草稿或已定稿的记录', 400);
    }

    const attachments = await maintenanceStore.listAttachmentsByDraftId(draftId);
    for (const attachment of attachments) {
        const fullPath = path.resolve(STORAGE_ATTACHMENTS_DIR, '..', attachment.storagePath);
        try {
            fs.unlinkSync(fullPath);
        } catch (_err) { /* file may not exist */ }
    }

    const draftDir = path.join(STORAGE_ATTACHMENTS_DIR, String(draftId));
    try {
        fs.rmSync(draftDir, { recursive: true, force: true });
    } catch (_err) { /* ignore */ }

    await maintenanceStore.deleteDraftAndChildren(draftId);
}

async function uploadAttachments(currentAddress, draftId, files) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'draft') {
        throw createError('只能在草稿状态下上传附件', 400);
    }

    if (!files || files.length === 0) {
        throw createError('没有上传任何文件', 400);
    }

    const draftDir = ensureDraftAttachmentDir(draftId);
    const results = [];

    for (const file of files) {
        const attachmentId = crypto.randomUUID();
        const contentHash = await computeFileHash(file.path);
        const ext = path.extname(file.originalname);
        const safeName = sanitizeFileName(path.basename(file.originalname, ext));
        const finalFileName = `${attachmentId}_${safeName}${ext}`;
        const finalPath = path.join(draftDir, finalFileName);
        const storagePath = `attachments/${draftId}/${finalFileName}`;

        fs.renameSync(file.path, finalPath);

        const attachmentType = detectAttachmentType(file.mimetype);

        await maintenanceStore.insertDraftAttachment(draftId, {
            attachmentId,
            attachmentType,
            fileName: finalFileName,
            originalFileName: file.originalname,
            mimeType: file.mimetype,
            fileExtension: ext || null,
            fileSize: file.size,
            contentHash,
            storagePath,
            uploadedBy: currentUser.id,
        });

        results.push({
            attachmentId,
            fileName: file.originalname,
            mimeType: file.mimetype,
            fileSize: file.size,
            contentHash,
            attachmentType,
        });
    }

    return { attachments: results };
}

async function deleteAttachment(currentAddress, draftId, attachmentId) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'draft') {
        throw createError('只能在草稿状态下删除附件', 400);
    }

    const attachment = await maintenanceStore.getAttachmentByDraftAndId(draftId, attachmentId);
    if (!attachment) {
        throw createError('附件不存在', 404);
    }

    const fullPath = path.resolve(STORAGE_ATTACHMENTS_DIR, '..', attachment.storagePath);
    try {
        fs.unlinkSync(fullPath);
    } catch (_err) { /* ignore */ }

    await maintenanceStore.deleteAttachmentByDraftAndId(draftId, attachmentId);
}

async function finalizeDraft(currentAddress, draftId) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'draft') {
        throw createError('只能定稿草稿状态的记录', 400);
    }

    if (!normalizeString(draft.aircraftRegNo)) throw createError('飞机注册号不能为空', 400);
    if (!normalizeString(draft.aircraftType)) throw createError('机型不能为空', 400);
    if (!normalizeString(draft.ataCode)) throw createError('ATA章节不能为空', 400);
    if (!normalizeString(draft.workType)) throw createError('工作类型不能为空', 400);

    const pool = getPool();
    const [payloadRows] = await pool.execute(
        `SELECT * FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1`,
        [draftId]
    );
    const payload = payloadRows[0];
    if (!payload || !normalizeString(payload.work_description)) {
        throw createError('工作描述不能为空', 400);
    }

    const [partsRows] = await pool.execute(
        `SELECT * FROM maintenance_record_parts WHERE record_id = ? ORDER BY sort_order`,
        [draftId]
    );
    const [measurementRows] = await pool.execute(
        `SELECT * FROM maintenance_record_measurements WHERE record_id = ? ORDER BY sort_order`,
        [draftId]
    );
    const [replacementRows] = await pool.execute(
        `SELECT * FROM maintenance_record_replacements WHERE record_id = ? ORDER BY sort_order`,
        [draftId]
    );

    const attachments = await maintenanceStore.listAttachmentsByDraftId(draftId);

    const recordId = generateRecordId(draft.jobCardNo, draft.revision || 1);
    const rootRecordId = recordId;

    const formPayload = {
        aircraftRegNo: draft.aircraftRegNo,
        aircraftType: draft.aircraftType,
        jobCardNo: draft.jobCardNo,
        revision: draft.revision || 1,
        ataCode: draft.ataCode,
        workType: draft.workType,
        locationCode: draft.locationCode,
        performerEmployeeNo: draft.performerEmployeeNo,
        performerName: draft.performerName,
        occurrenceTime: draft.occurrenceTime ? new Date(draft.occurrenceTime).toISOString() : null,
        workDescription: payload.work_description,
        referenceDocument: payload.reference_document,
        rawFormJson: payload.raw_form_json || {},
        normalizedFormJson: payload.normalized_form_json || null,
    };

    const faultPayload = {
        faultCode: payload.fault_code,
        faultDescription: payload.fault_description,
    };

    const parts = partsRows.map((p) => ({
        partRole: p.part_role,
        partNumber: p.part_number,
        serialNumber: p.serial_number,
        partStatus: p.part_status,
        sourceDescription: p.source_description,
        replacementReason: p.replacement_reason,
        sortOrder: p.sort_order,
    }));

    const measurements = measurementRows.map((m) => ({
        testItemName: m.test_item_name,
        measuredValues: m.measured_values,
        isPass: Boolean(m.is_pass),
        sortOrder: m.sort_order,
    }));

    const replacements = replacementRows.map((r) => ({
        removedPartNo: r.removed_part_no,
        removedSerialNo: r.removed_serial_no,
        removedStatus: r.removed_status,
        installedPartNo: r.installed_part_no,
        installedSerialNo: r.installed_serial_no,
        installedSource: r.installed_source,
        replacementReason: r.replacement_reason,
        sortOrder: r.sort_order,
    }));

    const manifestJson = {
        version: 1,
        generatedAt: new Date().toISOString(),
        attachments: attachments.map((a) => ({
            attachmentId: a.attachmentId,
            attachmentType: a.attachmentType,
            categoryCode: a.categoryCode,
            fileName: a.fileName,
            originalFileName: a.originalFileName,
            mimeType: a.mimeType,
            fileExtension: a.fileExtension,
            fileSize: a.fileSize,
            contentHash: a.contentHash,
            thumbnailHash: a.thumbnailHash,
            storageDisk: a.storageDisk,
            storagePath: a.storagePath,
            previewPath: a.previewPath,
            transcodedPath: a.transcodedPath,
            uploadStatus: a.uploadStatus,
            uploadedAt: a.uploadedAt ? new Date(a.uploadedAt).toISOString() : new Date().toISOString(),
        })),
    };

    const manifestHash = hashJson(manifestJson);
    const formHash = hashJson(formPayload);
    const faultHash = hashJson(faultPayload);
    const partsHash = hashJson(parts);
    const measurementsHash = hashJson(measurements);
    const replacementsHash = hashJson(replacements);

    const hashes = {
        formHash,
        faultHash,
        partsHash,
        measurementsHash,
        replacementsHash,
        attachmentManifestHash: manifestHash,
    };

    const signedDigest = buildActionDigest(recordId, 'submit', hashes, currentUser.employeeNo);

    const manifestData = {
        manifestHash,
        attachmentCount: attachments.length,
        documentCount: attachments.filter((a) => a.attachmentType === 'document').length,
        imageCount: attachments.filter((a) => a.attachmentType === 'image').length,
        videoCount: attachments.filter((a) => a.attachmentType === 'video').length,
        otherCount: attachments.filter((a) => a.attachmentType === 'other').length,
        totalSize: attachments.reduce((sum, a) => sum + a.fileSize, 0),
        manifestJson,
    };

    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();
        await maintenanceStore.finalizeDraft(draftId, { recordId, rootRecordId, hashes }, connection);
        await maintenanceStore.upsertDraftManifest(draftId, manifestData, connection);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return {
        recordId,
        rootRecordId,
        signedDigest,
        hashes,
        preview: {
            recordId,
            jobCardNo: draft.jobCardNo,
            performerEmployeeNo: draft.performerEmployeeNo,
            performerName: draft.performerName,
            signerEmployeeNo: currentUser.employeeNo,
            hashes,
            manifestSummary: {
                attachmentCount: manifestData.attachmentCount,
                documentCount: manifestData.documentCount,
                imageCount: manifestData.imageCount,
                videoCount: manifestData.videoCount,
                otherCount: manifestData.otherCount,
                totalSize: manifestData.totalSize,
            },
            signedDigest,
        },
    };
}

async function submitDraft(currentAddress, draftId, body) {
    const currentUser = await requireCurrentUser(currentAddress);
    const draft = await ensureDraftOwnership(draftId, currentUser);

    if (draft.status !== 'finalized') {
        throw createError('只能提交已定稿的记录', 400);
    }

    if (!draft.recordId) {
        throw createError('记录未完成定稿，缺少 recordId', 400);
    }

    const hashes = draft.hashes || {
        formHash: draft.formHash,
        faultHash: draft.faultHash,
        partsHash: draft.partsHash,
        measurementsHash: draft.measurementsHash,
        replacementsHash: draft.replacementsHash,
        attachmentManifestHash: draft.attachmentManifestHash,
    };

    const expectedDigest = buildActionDigest(draft.recordId, 'submit', hashes, currentUser.employeeNo);
    if (body.signedDigest !== expectedDigest) {
        throw createError('signedDigest 与服务端计算结果不一致', 400);
    }
    ensureSignatureMatchesAddress(body.signedDigest, body.signature, currentUser.address);

    const pool = getPool();
    const [payloadRows] = await pool.execute(
        `SELECT * FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1`,
        [draftId]
    );
    const payload = payloadRows[0];

    const [partsRows] = await pool.execute(`SELECT * FROM maintenance_record_parts WHERE record_id = ? ORDER BY sort_order`, [draftId]);
    const [measurementRows] = await pool.execute(`SELECT * FROM maintenance_record_measurements WHERE record_id = ? ORDER BY sort_order`, [draftId]);
    const [replacementRows] = await pool.execute(`SELECT * FROM maintenance_record_replacements WHERE record_id = ? ORDER BY sort_order`, [draftId]);
    const attachments = await maintenanceStore.listAttachmentsByDraftId(draftId);

    const [manifestRows] = await pool.execute(
        `SELECT * FROM maintenance_attachment_manifests WHERE record_id = ? LIMIT 1`,
        [draftId]
    );
    const manifest = manifestRows[0];

    const submitInput = {
        recordId: draft.recordId,
        aircraftRegNo: draft.aircraftRegNo,
        aircraftType: draft.aircraftType,
        jobCardNo: draft.jobCardNo,
        revision: draft.revision || 1,
        ataCode: draft.ataCode,
        workType: draft.workType,
        locationCode: draft.locationCode || '',
        performerEmployeeNo: draft.performerEmployeeNo,
        requiredTechnicianSignatures: draft.requiredTechnicianSignatures,
        requiredReviewerSignatures: draft.requiredReviewerSignatures,
        isRII: draft.isRII,
        occurrenceTime: Math.floor((draft.occurrenceTime ? new Date(draft.occurrenceTime).getTime() : Date.now()) / 1000),
        digest: hashes,
        attachmentSummary: {
            manifestHash: manifest ? manifest.manifest_hash : hashes.attachmentManifestHash,
            attachmentCount: manifest ? manifest.attachment_count : attachments.length,
            documentCount: manifest ? manifest.document_count : 0,
            imageCount: manifest ? manifest.image_count : 0,
            videoCount: manifest ? manifest.video_count : 0,
            totalSize: manifest ? Number(manifest.total_size) : 0,
        },
    };

    const chainResult = await maintenanceChainService.submitRecord(
        submitInput,
        currentUser.employeeNo,
        body.signedDigest,
        body.signature
    );

    const connection = await getPool().getConnection();
    try {
        await connection.beginTransaction();

        await maintenanceStore.submitDraft(draftId, {
            status: chainResult.chainRecord.status,
            chainRecordId: draft.recordId,
            chainTxHash: chainResult.txHash,
            chainBlockNumber: chainResult.blockNumber,
            technicianSignatureCount: chainResult.chainRecord.technicianSignatureCount,
            reviewerSignatureCount: chainResult.chainRecord.reviewerSignatureCount,
        }, connection);

        await maintenanceStore.insertSignature(
            draftId,
            {
                signerRole: 'technician',
                action: 'submit',
                signerUserId: currentUser.id,
                signerEmployeeNo: currentUser.employeeNo,
                signerName: currentUser.name,
                signerAddress: currentUser.address,
                signedDigest: body.signedDigest,
                signatureHash: ethers.keccak256(body.signature),
                signatureAlgorithm: 'EIP-191',
                signaturePayloadPath: null,
                chainTxHash: chainResult.txHash,
                signedAt: new Date(),
            },
            connection
        );

        await maintenanceStore.markSpecifiedSignerSigned(
            draftId,
            'technician',
            currentUser.employeeNo,
            null,
            new Date(),
            connection
        );

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }

    return maintenanceStore.getDraftById(draftId);
}

module.exports = {
    createDraft,
    listDrafts,
    getDraft,
    saveDraft,
    deleteDraft,
    uploadAttachments,
    deleteAttachment,
    finalizeDraft,
    submitDraft,
};
