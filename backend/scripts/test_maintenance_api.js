const { Wallet, ethers } = require('ethers');

const env = require('../src/config/env');
const maintenanceService = require('../src/services/maintenanceService');
const { hashJson } = require('./chain_helpers');

const baseUrl = 'http://127.0.0.1:3000';

async function request(method, path, body, headers = {}) {
    const response = await fetch(baseUrl + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        json = { raw: text };
    }

    if (!response.ok) {
        throw new Error(`${path} -> ${response.status} ${JSON.stringify(json)}`);
    }

    return json;
}

function buildFormPayload(record) {
    return {
        aircraftRegNo: record.aircraftRegNo,
        aircraftType: record.aircraftType,
        jobCardNo: record.jobCardNo,
        revision: record.revision,
        ataCode: record.ataCode,
        workType: record.workType,
        locationCode: record.locationCode,
        performerEmployeeNo: record.performerEmployeeNo,
        performerName: record.performerName,
        occurrenceTime: record.occurrenceTime,
        workDescription: record.payload.workDescription,
        referenceDocument: record.payload.referenceDocument,
        rawFormJson: record.payload.rawFormJson,
        normalizedFormJson: record.payload.normalizedFormJson,
    };
}

function buildManifest(manifest) {
    return {
        version: manifest.version || 1,
        generatedAt: manifest.generatedAt,
        attachments: manifest.attachments.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            attachmentType: attachment.attachmentType,
            categoryCode: attachment.categoryCode || null,
            fileName: attachment.fileName,
            originalFileName: attachment.originalFileName || null,
            mimeType: attachment.mimeType,
            fileExtension: attachment.fileExtension || null,
            fileSize: attachment.fileSize,
            contentHash: attachment.contentHash,
            thumbnailHash: attachment.thumbnailHash || null,
            storageDisk: attachment.storageDisk || 'local',
            storagePath: attachment.storagePath,
            previewPath: attachment.previewPath || null,
            transcodedPath: attachment.transcodedPath || null,
            uploadStatus: attachment.uploadStatus || 'ready',
            uploadedAt: attachment.uploadedAt,
        })),
    };
}

function normalizeParts(parts) {
    return parts.map((part, index) => ({
        partRole: part.partRole,
        partNumber: part.partNumber,
        serialNumber: part.serialNumber || null,
        partStatus: part.partStatus || null,
        sourceDescription: part.sourceDescription || null,
        replacementReason: part.replacementReason || null,
        sortOrder: part.sortOrder ?? index,
    }));
}

function normalizeMeasurements(measurements) {
    return measurements.map((measurement, index) => ({
        testItemName: measurement.testItemName,
        measuredValues: measurement.measuredValues || null,
        isPass: Boolean(measurement.isPass),
        sortOrder: measurement.sortOrder ?? index,
    }));
}

function normalizeReplacements(replacements) {
    return replacements.map((replacement, index) => ({
        removedPartNo: replacement.removedPartNo || null,
        removedSerialNo: replacement.removedSerialNo || null,
        removedStatus: replacement.removedStatus || null,
        installedPartNo: replacement.installedPartNo || null,
        installedSerialNo: replacement.installedSerialNo || null,
        installedSource: replacement.installedSource || null,
        replacementReason: replacement.replacementReason || null,
        sortOrder: replacement.sortOrder ?? index,
    }));
}

function buildHashes(record) {
    return {
        formHash: hashJson(buildFormPayload(record)),
        faultHash: hashJson({
            faultCode: record.payload.faultCode,
            faultDescription: record.payload.faultDescription,
        }),
        partsHash: hashJson(normalizeParts(record.parts)),
        measurementsHash: hashJson(normalizeMeasurements(record.measurements)),
        replacementsHash: hashJson(normalizeReplacements(record.replacements)),
        attachmentManifestHash: hashJson(buildManifest(record.manifest)),
    };
}

function buildActionDigest(recordId, action, hashes, signerEmployeeNo) {
    return hashJson({
        recordId,
        action,
        formHash: hashes.formHash,
        attachmentManifestHash: hashes.attachmentManifestHash,
        signerEmployeeNo,
    });
}

async function main() {
    const wallet = Wallet.createRandom();
    const employeeNo = `E${Date.now().toString().slice(-8)}`;

    const preregister = await request(
        'POST',
        '/api/auth/admin/preregister',
        {
            employeeNo,
            name: '接口联调员',
            department: 'QA',
            roleCodes: ['engineer_submitter'],
        },
        {
            'x-admin-bootstrap-key': env.adminBootstrapKey,
        }
    );

    const activationChallenge = await request('POST', '/api/auth/activate/challenge', {
        employeeNo,
        activationCode: preregister.activationCode,
        address: wallet.address,
    });

    const activationSignature = await wallet.signMessage(activationChallenge.message);
    const activated = await request('POST', '/api/auth/activate/verify', {
        employeeNo,
        address: wallet.address,
        signature: activationSignature,
    });
    const token = activated.token;

    const occurrenceTime = new Date().toISOString();
    const uploadTime = new Date().toISOString();
    const manifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        attachments: [
            {
                attachmentId: `DOC-${employeeNo}`,
                attachmentType: 'document',
                fileName: 'job-card.pdf',
                mimeType: 'application/pdf',
                fileExtension: 'pdf',
                fileSize: 128000,
                contentHash: ethers.id(`doc-${employeeNo}`),
                storagePath: `2026/${employeeNo}/job-card.pdf`,
                uploadedAt: uploadTime,
            },
            {
                attachmentId: `IMG-${employeeNo}`,
                attachmentType: 'image',
                fileName: 'fault.jpg',
                mimeType: 'image/jpeg',
                fileExtension: 'jpg',
                fileSize: 256000,
                contentHash: ethers.id(`img-${employeeNo}`),
                storagePath: `2026/${employeeNo}/fault.jpg`,
                uploadedAt: uploadTime,
            },
        ],
    };

    const submitRecordId = ethers.id(`submit:${employeeNo}`);
    const submitBody = {
        recordId: submitRecordId,
        aircraftRegNo: 'B-4321',
        aircraftType: 'A320',
        jobCardNo: `JC-TEST-${employeeNo}`,
        ataCode: '32-11',
        workType: '功能检查',
        locationCode: 'HGH-H2',
        performerEmployeeNo: employeeNo,
        performerName: '接口联调员',
        requiredTechnicianSignatures: 1,
        requiredReviewerSignatures: 0,
        isRII: false,
        occurrenceTime,
        payload: {
            workDescription: '首次提交的检修记录',
            referenceDocument: 'AMM 32-11-00',
            faultCode: 'FLT-001',
            faultDescription: '首次提交用于联调',
            rawFormJson: { step: 'submit' },
            normalizedFormJson: { step: 'submit', normalized: true },
        },
        parts: [
            {
                partRole: 'used',
                partNumber: 'PART-001',
                serialNumber: 'SN-001',
                sortOrder: 0,
            },
        ],
        measurements: [
            {
                testItemName: 'pressure',
                measuredValues: '20psi',
                isPass: true,
                sortOrder: 0,
            },
        ],
        replacements: [
            {
                removedPartNo: 'OLD-001',
                installedPartNo: 'NEW-001',
                replacementReason: '联调替换',
                sortOrder: 0,
            },
        ],
        manifest,
    };

    const submitData = maintenanceService.__internal.buildRecordForPersistence({
        ...maintenanceService.__internal.buildBasePayload(
            submitBody,
            {
                id: 0,
                employeeNo,
                name: '接口联调员',
            }
        ),
        recordId: submitRecordId,
        rootRecordId: submitRecordId,
        previousRecordId: null,
        revision: 1,
    });

    const submitDigest = buildActionDigest(
        submitRecordId,
        'submit',
        submitData.hashes,
        employeeNo
    );
    const submitSignature = await wallet.signMessage(ethers.getBytes(submitDigest));
    const submitted = await request(
        'POST',
        '/api/maintenance/records',
        {
            ...submitBody,
            signedDigest: submitDigest,
            signature: submitSignature,
        },
        {
            Authorization: `Bearer ${token}`,
        }
    );

    const rejectDigest = buildActionDigest(
        submitRecordId,
        'reject',
        submitted.hashes,
        employeeNo
    );
    const rejectSignature = await wallet.signMessage(ethers.getBytes(rejectDigest));
    const rejected = await request(
        'POST',
        `/api/maintenance/records/${submitRecordId}/signatures`,
        {
            signerRole: 'reviewer',
            action: 'reject',
            rejectionReason: '资料描述需要补充',
            signedDigest: rejectDigest,
            signature: rejectSignature,
        },
        {
            Authorization: `Bearer ${token}`,
        }
    );

    const resubmitRecordId = ethers.id(`resubmit:${employeeNo}`);
    const resubmitBody = {
        nextRecordId: resubmitRecordId,
        aircraftRegNo: 'B-4321',
        aircraftType: 'A320',
        jobCardNo: `JC-TEST-${employeeNo}`,
        ataCode: '32-11',
        workType: '功能检查',
        locationCode: 'HGH-H2',
        performerEmployeeNo: employeeNo,
        performerName: '接口联调员',
        requiredTechnicianSignatures: 1,
        requiredReviewerSignatures: 0,
        isRII: false,
        occurrenceTime,
        payload: {
            workDescription: '驳回后补充说明并重新提交',
            referenceDocument: 'AMM 32-11-00 Rev.2',
            faultCode: 'FLT-001',
            faultDescription: '修正后的重提版本',
            rawFormJson: { step: 'resubmit' },
            normalizedFormJson: { step: 'resubmit', normalized: true },
        },
        parts: submitData.parts,
        measurements: [
            {
                testItemName: 'pressure',
                measuredValues: '21psi',
                isPass: true,
                sortOrder: 0,
            },
        ],
        replacements: [
            {
                removedPartNo: 'OLD-001',
                installedPartNo: 'NEW-001',
                replacementReason: '重提说明已修订',
                sortOrder: 0,
            },
        ],
        manifest,
    };

    const resubmitData = maintenanceService.__internal.buildRecordForPersistence({
        ...maintenanceService.__internal.buildBasePayload(
            resubmitBody,
            {
                id: 0,
                employeeNo,
                name: '接口联调员',
            },
            rejected
        ),
        recordId: resubmitRecordId,
        rootRecordId: rejected.rootRecordId,
        previousRecordId: rejected.recordId,
        revision: 2,
    });

    const resubmitDigest = buildActionDigest(
        resubmitRecordId,
        'submit',
        resubmitData.hashes,
        employeeNo
    );
    const resubmitSignature = await wallet.signMessage(
        ethers.getBytes(resubmitDigest)
    );
    const resubmitted = await request(
        'POST',
        `/api/maintenance/records/${submitRecordId}/resubmit`,
        {
            ...resubmitBody,
            signedDigest: resubmitDigest,
            signature: resubmitSignature,
        },
        {
            Authorization: `Bearer ${token}`,
        }
    );

    const revisions = await request(
        'GET',
        `/api/maintenance/records/${resubmitRecordId}/revisions`,
        null,
        {
            Authorization: `Bearer ${token}`,
        }
    );

    console.log(
        JSON.stringify(
            {
                employeeNo,
                walletAddress: wallet.address,
                submitted: {
                    recordId: submitted.recordId,
                    status: submitted.status,
                    rootRecordId: submitted.rootRecordId,
                    revision: submitted.revision,
                },
                rejected: {
                    recordId: rejected.recordId,
                    status: rejected.status,
                    rejectionReason: rejected.rejectionReason,
                },
                resubmitted: {
                    sourceRecordId: resubmitted.sourceRecordId,
                    newRecordId: resubmitted.newRecord.recordId,
                    rootRecordId: resubmitted.newRecord.rootRecordId,
                    previousRecordId: resubmitted.newRecord.previousRecordId,
                    revision: resubmitted.newRecord.revision,
                    status: resubmitted.newRecord.status,
                },
                revisions: revisions.revisions,
            },
            null,
            2
        )
    );
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});