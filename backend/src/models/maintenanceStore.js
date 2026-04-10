const { getPool } = require('../config/database');

function getExecutor(executor) {
    return executor || getPool();
}

function mapRecordRow(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        recordId: row.record_id,
        rootRecordId: row.root_record_id,
        previousRecordId: row.previous_record_id,
        supersededByRecordId: row.superseded_by_record_id,
        aircraftRegNo: row.aircraft_reg_no,
        aircraftType: row.aircraft_type,
        jobCardNo: row.job_card_no,
        revision: Number(row.revision),
        ataCode: row.ata_code,
        workType: row.work_type,
        locationCode: row.location_code,
        performerUserId: row.performer_user_id,
        performerEmployeeNo: row.performer_employee_no,
        performerName: row.performer_name,
        requiredTechnicianSignatures: Number(row.required_technician_signatures || 0),
        requiredReviewerSignatures: Number(row.required_reviewer_signatures || 0),
        technicianSignatureCount: Number(row.technician_signature_count || 0),
        reviewerSignatureCount: Number(row.reviewer_signature_count || 0),
        isRII: Boolean(row.is_rii),
        occurrenceTime: row.occurrence_time,
        status: row.status,
        chainRecordId: row.chain_record_id,
        chainTxHash: row.chain_tx_hash,
        chainBlockNumber: row.chain_block_number == null ? null : Number(row.chain_block_number),
        hashes: {
            formHash: row.form_hash,
            faultHash: row.fault_hash,
            partsHash: row.parts_hash,
            measurementsHash: row.measurements_hash,
            replacementsHash: row.replacements_hash,
            attachmentManifestHash: row.attachment_manifest_hash,
        },
        rejectionReason: row.rejection_reason,
        rejectedAt: row.rejected_at,
        resubmittedAt: row.resubmitted_at,
        submittedAt: row.submitted_at,
        releasedAt: row.released_at,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSignatureRow(row) {
    return {
        id: row.id,
        signerRole: row.signer_role,
        action: row.action,
        signerUserId: row.signer_user_id,
        signerEmployeeNo: row.signer_employee_no,
        signerName: row.signer_name,
        signerAddress: row.signer_address,
        signedDigest: row.signed_digest,
        signatureHash: row.signature_hash,
        signatureAlgorithm: row.signature_algorithm,
        signaturePayloadPath: row.signature_payload_path,
        chainTxHash: row.chain_tx_hash,
        signedAt: row.signed_at,
        createdAt: row.created_at,
    };
}

function mapAttachmentRow(row) {
    return {
        id: row.id,
        attachmentId: row.attachment_id,
        attachmentType: row.attachment_type,
        categoryCode: row.category_code,
        fileName: row.file_name,
        originalFileName: row.original_file_name,
        mimeType: row.mime_type,
        fileExtension: row.file_extension,
        fileSize: Number(row.file_size),
        contentHash: row.content_hash,
        thumbnailHash: row.thumbnail_hash,
        storageDisk: row.storage_disk,
        storagePath: row.storage_path,
        previewPath: row.preview_path,
        transcodedPath: row.transcoded_path,
        uploadStatus: row.upload_status,
        uploadedBy: row.uploaded_by,
        uploadedAt: row.uploaded_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSpecifiedSignerRow(row) {
    return {
        id: row.id,
        signerRole: row.signer_role,
        signerUserId: row.signer_user_id,
        signerEmployeeNo: row.signer_employee_no,
        signerName: row.signer_name,
        isRequired: Boolean(row.is_required),
        status: row.status,
        signedSignatureId: row.signed_signature_id,
        signedAt: row.signed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRecordSummaryRow(row) {
    return {
        recordId: row.record_id,
        rootRecordId: row.root_record_id,
        previousRecordId: row.previous_record_id,
        aircraftRegNo: row.aircraft_reg_no,
        aircraftType: row.aircraft_type,
        jobCardNo: row.job_card_no,
        revision: Number(row.revision),
        ataCode: row.ata_code,
        workType: row.work_type,
        locationCode: row.location_code,
        performerEmployeeNo: row.performer_employee_no,
        performerName: row.performer_name,
        requiredTechnicianSignatures: Number(row.required_technician_signatures || 0),
        requiredReviewerSignatures: Number(row.required_reviewer_signatures || 0),
        technicianSignatureCount: Number(row.technician_signature_count || 0),
        reviewerSignatureCount: Number(row.reviewer_signature_count || 0),
        isRII: Boolean(row.is_rii),
        status: row.status,
        specifiedSignerCount: Number(row.specified_signer_count || 0),
        pendingSpecifiedSignerCount: Number(row.pending_specified_signer_count || 0),
        rejectionReason: row.rejection_reason,
        submittedAt: row.submitted_at,
        rejectedAt: row.rejected_at,
        releasedAt: row.released_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function buildRecordSummaryWhereClause(filters = {}) {
    const clauses = [];
    const params = [];

    const keyword = String(filters.keyword || '').trim();
    const aircraftRegNo = String(filters.aircraftRegNo || '').trim();
    const performerEmployeeNo = String(filters.performerEmployeeNo || '').trim();
    const ataCode = String(filters.ataCode || '').trim();

    if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        clauses.push(`mr.status IN (${filters.statuses.map(() => '?').join(', ')})`);
        params.push(...filters.statuses);
    } else if (String(filters.status || '').trim()) {
        clauses.push('mr.status = ?');
        params.push(String(filters.status).trim());
    } else if (!filters.includeDrafts) {
        clauses.push("mr.status NOT IN ('draft', 'finalized')");
    }

    if (aircraftRegNo) {
        clauses.push('mr.aircraft_reg_no LIKE ?');
        params.push(`%${aircraftRegNo}%`);
    }

    if (performerEmployeeNo) {
        clauses.push('mr.performer_employee_no LIKE ?');
        params.push(`%${performerEmployeeNo}%`);
    }

    if (ataCode) {
        clauses.push('mr.ata_code LIKE ?');
        params.push(`%${ataCode}%`);
    }

    if (keyword) {
        clauses.push(`(
            mr.record_id LIKE ?
            OR mr.root_record_id LIKE ?
            OR mr.job_card_no LIKE ?
            OR mr.work_type LIKE ?
            OR mr.performer_employee_no LIKE ?
        )`);
        params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    }

    return {
        whereSql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
        params,
    };
}

async function getRecordRowByRecordId(recordId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT *
         FROM maintenance_records
         WHERE record_id = ?
         LIMIT 1`,
        [recordId]
    );

    return mapRecordRow(rows[0] || null);
}

async function getRecordDetailByRecordId(recordId, executor) {
    const db = getExecutor(executor);
    const record = await getRecordRowByRecordId(recordId, db);
    if (!record) {
        return null;
    }

    const [[payloadRows], [partRows], [measurementRows], [replacementRows], [signatureRows], [specifiedSignerRows], [manifestRows], [attachmentRows], [revisionRows]] = await Promise.all([
        db.execute(
            `SELECT *
             FROM maintenance_record_payloads
             WHERE record_id = ?
             LIMIT 1`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_record_parts
             WHERE record_id = ?
             ORDER BY sort_order ASC, id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_record_measurements
             WHERE record_id = ?
             ORDER BY sort_order ASC, id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_record_replacements
             WHERE record_id = ?
             ORDER BY sort_order ASC, id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_record_signatures
             WHERE record_id = ?
             ORDER BY signed_at ASC, id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_record_specified_signers
             WHERE record_id = ?
             ORDER BY id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_attachment_manifests
             WHERE record_id = ?
             LIMIT 1`,
            [record.id]
        ),
        db.execute(
            `SELECT *
             FROM maintenance_attachments
             WHERE record_id = ?
             ORDER BY id ASC`,
            [record.id]
        ),
        db.execute(
            `SELECT record_id, revision, status, created_at, rejected_at, released_at, superseded_by_record_id
             FROM maintenance_records
             WHERE root_record_id = ?
             ORDER BY revision ASC, id ASC`,
            [record.rootRecordId]
        ),
    ]);

    const manifestRow = manifestRows[0] || null;
    const payloadRow = payloadRows[0] || null;

    return {
        ...record,
        payload: payloadRow
            ? {
                workDescription: payloadRow.work_description,
                referenceDocument: payloadRow.reference_document,
                faultCode: payloadRow.fault_code,
                faultDescription: payloadRow.fault_description,
                rawFormJson: payloadRow.raw_form_json,
                normalizedFormJson: payloadRow.normalized_form_json,
                createdAt: payloadRow.created_at,
                updatedAt: payloadRow.updated_at,
            }
            : null,
        parts: partRows.map((row) => ({
            id: row.id,
            partRole: row.part_role,
            partNumber: row.part_number,
            serialNumber: row.serial_number,
            partStatus: row.part_status,
            sourceDescription: row.source_description,
            replacementReason: row.replacement_reason,
            sortOrder: Number(row.sort_order || 0),
            createdAt: row.created_at,
        })),
        measurements: measurementRows.map((row) => ({
            id: row.id,
            testItemName: row.test_item_name,
            measuredValues: row.measured_values,
            isPass: Boolean(row.is_pass),
            sortOrder: Number(row.sort_order || 0),
            createdAt: row.created_at,
        })),
        replacements: replacementRows.map((row) => ({
            id: row.id,
            removedPartNo: row.removed_part_no,
            removedSerialNo: row.removed_serial_no,
            removedStatus: row.removed_status,
            installedPartNo: row.installed_part_no,
            installedSerialNo: row.installed_serial_no,
            installedSource: row.installed_source,
            replacementReason: row.replacement_reason,
            sortOrder: Number(row.sort_order || 0),
            createdAt: row.created_at,
        })),
        signatures: signatureRows.map(mapSignatureRow),
        specifiedSigners: specifiedSignerRows.map(mapSpecifiedSignerRow),
        manifest: manifestRow
            ? {
                id: manifestRow.id,
                manifestHash: manifestRow.manifest_hash,
                attachmentCount: Number(manifestRow.attachment_count || 0),
                documentCount: Number(manifestRow.document_count || 0),
                imageCount: Number(manifestRow.image_count || 0),
                videoCount: Number(manifestRow.video_count || 0),
                otherCount: Number(manifestRow.other_count || 0),
                totalSize: Number(manifestRow.total_size || 0),
                manifestJson: manifestRow.manifest_json,
                createdBy: manifestRow.created_by,
                createdAt: manifestRow.created_at,
                updatedAt: manifestRow.updated_at,
            }
            : null,
        attachments: attachmentRows.map(mapAttachmentRow),
        revisions: revisionRows.map((row) => ({
            recordId: row.record_id,
            revision: Number(row.revision),
            status: row.status,
            createdAt: row.created_at,
            rejectedAt: row.rejected_at,
            releasedAt: row.released_at,
            supersededByRecordId: row.superseded_by_record_id,
        })),
    };
}

async function insertRecordGraph(data, executor) {
    const db = getExecutor(executor);

    const [result] = await db.execute(
        `INSERT INTO maintenance_records (
            record_id,
            root_record_id,
            previous_record_id,
            superseded_by_record_id,
            aircraft_reg_no,
            aircraft_type,
            job_card_no,
            revision,
            ata_code,
            work_type,
            location_code,
            performer_user_id,
            performer_employee_no,
            performer_name,
            required_technician_signatures,
            required_reviewer_signatures,
            technician_signature_count,
            reviewer_signature_count,
            is_rii,
            occurrence_time,
            status,
            chain_record_id,
            chain_tx_hash,
            chain_block_number,
            form_hash,
            fault_hash,
            parts_hash,
            measurements_hash,
            replacements_hash,
            attachment_manifest_hash,
            rejection_reason,
            rejected_at,
            resubmitted_at,
            submitted_at,
            released_at,
            created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.recordId,
            data.rootRecordId,
            data.previousRecordId,
            data.supersededByRecordId || null,
            data.aircraftRegNo,
            data.aircraftType,
            data.jobCardNo,
            data.revision,
            data.ataCode,
            data.workType,
            data.locationCode || null,
            data.performerUserId || null,
            data.performerEmployeeNo,
            data.performerName || null,
            data.requiredTechnicianSignatures,
            data.requiredReviewerSignatures,
            data.technicianSignatureCount,
            data.reviewerSignatureCount,
            data.isRII ? 1 : 0,
            data.occurrenceTime || null,
            data.status,
            data.chainRecordId,
            data.chainTxHash || null,
            data.chainBlockNumber || null,
            data.hashes.formHash,
            data.hashes.faultHash,
            data.hashes.partsHash,
            data.hashes.measurementsHash,
            data.hashes.replacementsHash,
            data.hashes.attachmentManifestHash,
            data.rejectionReason || null,
            data.rejectedAt || null,
            data.resubmittedAt || null,
            data.submittedAt || null,
            data.releasedAt || null,
            data.createdBy || null,
        ]
    );

    const maintenanceRecordDbId = result.insertId;

    await db.execute(
        `INSERT INTO maintenance_record_payloads (
            record_id,
            work_description,
            reference_document,
            fault_code,
            fault_description,
            raw_form_json,
            normalized_form_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            maintenanceRecordDbId,
            data.payload.workDescription,
            data.payload.referenceDocument || null,
            data.payload.faultCode || null,
            data.payload.faultDescription || null,
            JSON.stringify(data.payload.rawFormJson || {}),
            data.payload.normalizedFormJson == null ? null : JSON.stringify(data.payload.normalizedFormJson),
        ]
    );

    for (const part of data.parts) {
        await db.execute(
            `INSERT INTO maintenance_record_parts (
                record_id,
                part_role,
                part_number,
                serial_number,
                part_status,
                source_description,
                replacement_reason,
                sort_order
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                maintenanceRecordDbId,
                part.partRole,
                part.partNumber,
                part.serialNumber || null,
                part.partStatus || null,
                part.sourceDescription || null,
                part.replacementReason || null,
                part.sortOrder,
            ]
        );
    }

    for (const measurement of data.measurements) {
        await db.execute(
            `INSERT INTO maintenance_record_measurements (
                record_id,
                test_item_name,
                measured_values,
                is_pass,
                sort_order
             ) VALUES (?, ?, ?, ?, ?)`,
            [
                maintenanceRecordDbId,
                measurement.testItemName,
                measurement.measuredValues || null,
                measurement.isPass ? 1 : 0,
                measurement.sortOrder,
            ]
        );
    }

    for (const replacement of data.replacements) {
        await db.execute(
            `INSERT INTO maintenance_record_replacements (
                record_id,
                removed_part_no,
                removed_serial_no,
                removed_status,
                installed_part_no,
                installed_serial_no,
                installed_source,
                replacement_reason,
                sort_order
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                maintenanceRecordDbId,
                replacement.removedPartNo || null,
                replacement.removedSerialNo || null,
                replacement.removedStatus || null,
                replacement.installedPartNo || null,
                replacement.installedSerialNo || null,
                replacement.installedSource || null,
                replacement.replacementReason || null,
                replacement.sortOrder,
            ]
        );
    }

    for (const specifiedSigner of data.specifiedSigners || []) {
        await db.execute(
            `INSERT INTO maintenance_record_specified_signers (
                record_id,
                signer_role,
                signer_user_id,
                signer_employee_no,
                signer_name,
                is_required,
                status,
                signed_signature_id,
                signed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                maintenanceRecordDbId,
                specifiedSigner.signerRole,
                specifiedSigner.signerUserId || null,
                specifiedSigner.signerEmployeeNo,
                specifiedSigner.signerName || null,
                specifiedSigner.isRequired ? 1 : 0,
                specifiedSigner.status || 'pending',
                specifiedSigner.signedSignatureId || null,
                specifiedSigner.signedAt || null,
            ]
        );
    }

    const [manifestResult] = await db.execute(
        `INSERT INTO maintenance_attachment_manifests (
            record_id,
            manifest_hash,
            attachment_count,
            document_count,
            image_count,
            video_count,
            other_count,
            total_size,
            manifest_json,
            created_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            maintenanceRecordDbId,
            data.manifest.manifestHash,
            data.manifest.attachmentCount,
            data.manifest.documentCount,
            data.manifest.imageCount,
            data.manifest.videoCount,
            data.manifest.otherCount,
            data.manifest.totalSize,
            JSON.stringify(data.manifest.manifestJson),
            data.createdBy || null,
        ]
    );

    const manifestDbId = manifestResult.insertId;
    for (const attachment of data.attachments) {
        await db.execute(
            `INSERT INTO maintenance_attachments (
                record_id,
                manifest_id,
                attachment_id,
                attachment_type,
                category_code,
                file_name,
                original_file_name,
                mime_type,
                file_extension,
                file_size,
                content_hash,
                thumbnail_hash,
                storage_disk,
                storage_path,
                preview_path,
                transcoded_path,
                upload_status,
                uploaded_by,
                uploaded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                maintenanceRecordDbId,
                manifestDbId,
                attachment.attachmentId,
                attachment.attachmentType,
                attachment.categoryCode || null,
                attachment.fileName,
                attachment.originalFileName || null,
                attachment.mimeType,
                attachment.fileExtension || null,
                attachment.fileSize,
                attachment.contentHash,
                attachment.thumbnailHash || null,
                attachment.storageDisk,
                attachment.storagePath,
                attachment.previewPath || null,
                attachment.transcodedPath || null,
                attachment.uploadStatus,
                attachment.uploadedBy || null,
                attachment.uploadedAt,
            ]
        );
    }

    return {
        maintenanceRecordDbId,
        manifestDbId,
    };
}

async function insertSignature(recordDbId, signature, executor) {
    const db = getExecutor(executor);
    const [result] = await db.execute(
        `INSERT INTO maintenance_record_signatures (
            record_id,
            signer_role,
            action,
            signer_user_id,
            signer_employee_no,
            signer_name,
            signer_address,
            signed_digest,
            signature_hash,
            signature_algorithm,
            signature_payload_path,
            chain_tx_hash,
            signed_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            recordDbId,
            signature.signerRole,
            signature.action,
            signature.signerUserId || null,
            signature.signerEmployeeNo,
            signature.signerName || null,
            signature.signerAddress,
            signature.signedDigest,
            signature.signatureHash,
            signature.signatureAlgorithm || 'EIP-191',
            signature.signaturePayloadPath || null,
            signature.chainTxHash || null,
            signature.signedAt,
        ]
    );

    return result.insertId;
}

async function markSpecifiedSignerSigned(recordDbId, signerRole, signerEmployeeNo, signatureId, signedAt, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_record_specified_signers
         SET status = 'signed',
             signed_signature_id = ?,
             signed_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE record_id = ?
           AND signer_role = ?
           AND signer_employee_no = ?`,
        [
            signatureId,
            signedAt || null,
            recordDbId,
            signerRole,
            signerEmployeeNo,
        ]
    );
}

async function updateRecordAfterSignature(recordId, update, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_records
         SET status = ?,
             technician_signature_count = ?,
             reviewer_signature_count = ?,
             chain_tx_hash = ?,
             chain_block_number = ?,
             rejection_reason = ?,
             rejected_at = ?,
             released_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE record_id = ?`,
        [
            update.status,
            update.technicianSignatureCount,
            update.reviewerSignatureCount,
            update.chainTxHash || null,
            update.chainBlockNumber || null,
            update.rejectionReason || null,
            update.rejectedAt || null,
            update.releasedAt || null,
            recordId,
        ]
    );
}

async function markRecordAsResubmitted(recordId, supersededByRecordId, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_records
         SET superseded_by_record_id = ?,
             resubmitted_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE record_id = ?`,
        [supersededByRecordId, recordId]
    );
}

async function listRevisionsByRootRecordId(rootRecordId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT record_id, revision, status, created_at, rejected_at, released_at, superseded_by_record_id
         FROM maintenance_records
         WHERE root_record_id = ?
         ORDER BY revision ASC, id ASC`,
        [rootRecordId]
    );

    return rows.map((row) => ({
        recordId: row.record_id,
        revision: Number(row.revision),
        status: row.status,
        createdAt: row.created_at,
        rejectedAt: row.rejected_at,
        releasedAt: row.released_at,
        supersededByRecordId: row.superseded_by_record_id,
    }));
}

async function listRecordSummaries(filters = {}, executor) {
    const db = getExecutor(executor);
    const page = Math.max(Number(filters.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(filters.pageSize) || 10, 1), 100);
    const offset = (page - 1) * pageSize;

    const { whereSql, params } = buildRecordSummaryWhereClause(filters);

    const [countRows] = await db.execute(
        `SELECT COUNT(*) AS total
         FROM maintenance_records mr
         ${whereSql}`,
        params
    );

    const [rows] = await db.execute(
        `SELECT
            mr.record_id,
            mr.root_record_id,
            mr.previous_record_id,
            mr.aircraft_reg_no,
            mr.aircraft_type,
            mr.job_card_no,
            mr.revision,
            mr.ata_code,
            mr.work_type,
            mr.location_code,
            mr.performer_employee_no,
            mr.performer_name,
            mr.required_technician_signatures,
            mr.required_reviewer_signatures,
            mr.technician_signature_count,
            mr.reviewer_signature_count,
            mr.is_rii,
            mr.status,
            mr.rejection_reason,
            mr.submitted_at,
            mr.rejected_at,
            mr.released_at,
            mr.created_at,
            mr.updated_at,
            COUNT(ms.id) AS specified_signer_count,
            COALESCE(SUM(CASE WHEN ms.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending_specified_signer_count
         FROM maintenance_records mr
         LEFT JOIN maintenance_record_specified_signers ms ON ms.record_id = mr.id
         ${whereSql}
         GROUP BY mr.id
         ORDER BY mr.updated_at DESC, mr.id DESC
         LIMIT ${pageSize} OFFSET ${offset}`,
        params
    );

    return {
        page,
        pageSize,
        total: Number(countRows[0]?.total || 0),
        rows: rows.map(mapRecordSummaryRow),
    };
}

async function insertDraftRecord(data, executor) {
    const db = getExecutor(executor);
    const [result] = await db.execute(
        `INSERT INTO maintenance_records (
            job_card_no, aircraft_reg_no, aircraft_type, performer_user_id, performer_employee_no, performer_name,
            status, created_by, draft_saved_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, CURRENT_TIMESTAMP)`,
        [
            data.jobCardNo,
            data.aircraftRegNo || null,
            data.aircraftType || null,
            data.performerUserId,
            data.performerEmployeeNo,
            data.performerName || null,
            data.createdBy,
        ]
    );

    const draftId = result.insertId;

    await db.execute(
        `INSERT INTO maintenance_record_payloads (record_id) VALUES (?)`,
        [draftId]
    );

    return draftId;
}

async function getDraftById(draftId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT * FROM maintenance_records WHERE id = ? AND status IN ('draft', 'finalized') LIMIT 1`,
        [draftId]
    );
    return mapRecordRow(rows[0] || null);
}

async function listDraftsByUserId(userId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT mr.*,
            (SELECT COUNT(*) FROM maintenance_attachments ma WHERE ma.record_id = mr.id) AS attachment_count
         FROM maintenance_records mr
         WHERE mr.performer_user_id = ? AND mr.status IN ('draft', 'finalized')
         ORDER BY mr.updated_at DESC`,
        [userId]
    );

    return rows.map((row) => ({
        ...mapRecordRow(row),
        attachmentCount: Number(row.attachment_count || 0),
    }));
}

async function updateDraftFields(draftId, fields, executor) {
    const db = getExecutor(executor);
    const sets = [];
    const params = [];

    const fieldMapping = {
        aircraftRegNo: 'aircraft_reg_no',
        aircraftType: 'aircraft_type',
        ataCode: 'ata_code',
        workType: 'work_type',
        locationCode: 'location_code',
        requiredTechnicianSignatures: 'required_technician_signatures',
        requiredReviewerSignatures: 'required_reviewer_signatures',
        isRII: 'is_rii',
        occurrenceTime: 'occurrence_time',
    };

    for (const [jsKey, dbCol] of Object.entries(fieldMapping)) {
        if (fields[jsKey] !== undefined) {
            sets.push(`${dbCol} = ?`);
            params.push(fields[jsKey]);
        }
    }

    sets.push('draft_saved_at = CURRENT_TIMESTAMP');

    if (sets.length > 0) {
        params.push(draftId);
        await db.execute(
            `UPDATE maintenance_records SET ${sets.join(', ')} WHERE id = ?`,
            params
        );
    }
}

async function updateDraftPayload(draftId, payload, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_record_payloads
         SET work_description = ?,
             reference_document = ?,
             fault_code = ?,
             fault_description = ?,
             raw_form_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE record_id = ?`,
        [
            payload.workDescription || null,
            payload.referenceDocument || null,
            payload.faultCode || null,
            payload.faultDescription || null,
            payload.rawFormJson ? JSON.stringify(payload.rawFormJson) : null,
            draftId,
        ]
    );
}

async function replaceDraftSubTable(draftId, tableName, rows, buildParams, executor) {
    const db = getExecutor(executor);
    await db.execute(`DELETE FROM ${tableName} WHERE record_id = ?`, [draftId]);
    for (const row of rows) {
        const { columns, values } = buildParams(draftId, row);
        await db.execute(
            `INSERT INTO ${tableName} (record_id, ${columns.join(', ')}) VALUES (?, ${columns.map(() => '?').join(', ')})`,
            [draftId, ...values]
        );
    }
}

async function replaceDraftParts(draftId, parts, executor) {
    return replaceDraftSubTable(draftId, 'maintenance_record_parts', parts, (_id, p) => ({
        columns: ['part_role', 'part_number', 'serial_number', 'part_status', 'source_description', 'replacement_reason', 'sort_order'],
        values: [p.partRole, p.partNumber, p.serialNumber || null, p.partStatus || null, p.sourceDescription || null, p.replacementReason || null, p.sortOrder || 0],
    }), executor);
}

async function replaceDraftMeasurements(draftId, measurements, executor) {
    return replaceDraftSubTable(draftId, 'maintenance_record_measurements', measurements, (_id, m) => ({
        columns: ['test_item_name', 'measured_values', 'is_pass', 'sort_order'],
        values: [m.testItemName, m.measuredValues || null, m.isPass ? 1 : 0, m.sortOrder || 0],
    }), executor);
}

async function replaceDraftReplacements(draftId, replacements, executor) {
    return replaceDraftSubTable(draftId, 'maintenance_record_replacements', replacements, (_id, r) => ({
        columns: ['removed_part_no', 'removed_serial_no', 'removed_status', 'installed_part_no', 'installed_serial_no', 'installed_source', 'replacement_reason', 'sort_order'],
        values: [r.removedPartNo || null, r.removedSerialNo || null, r.removedStatus || null, r.installedPartNo || null, r.installedSerialNo || null, r.installedSource || null, r.replacementReason || null, r.sortOrder || 0],
    }), executor);
}

async function replaceDraftSpecifiedSigners(draftId, signers, executor) {
    return replaceDraftSubTable(draftId, 'maintenance_record_specified_signers', signers, (_id, s) => ({
        columns: ['signer_role', 'signer_user_id', 'signer_employee_no', 'signer_name', 'is_required', 'status'],
        values: [s.signerRole, s.signerUserId || null, s.signerEmployeeNo, s.signerName || null, s.isRequired ? 1 : 0, s.status || 'pending'],
    }), executor);
}

async function revertDraftToEditing(draftId, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_records
         SET status = 'draft',
             record_id = NULL,
             root_record_id = NULL,
             form_hash = NULL,
             fault_hash = NULL,
             parts_hash = NULL,
             measurements_hash = NULL,
             replacements_hash = NULL,
             attachment_manifest_hash = NULL,
             finalized_at = NULL,
             draft_saved_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [draftId]
    );
}

async function finalizeDraft(draftId, data, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_records
         SET status = 'finalized',
             record_id = ?,
             root_record_id = ?,
             form_hash = ?,
             fault_hash = ?,
             parts_hash = ?,
             measurements_hash = ?,
             replacements_hash = ?,
             attachment_manifest_hash = ?,
             finalized_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            data.recordId,
            data.rootRecordId,
            data.hashes.formHash,
            data.hashes.faultHash,
            data.hashes.partsHash,
            data.hashes.measurementsHash,
            data.hashes.replacementsHash,
            data.hashes.attachmentManifestHash,
            draftId,
        ]
    );
}

async function submitDraft(draftId, data, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `UPDATE maintenance_records
         SET status = ?,
             chain_record_id = ?,
             chain_tx_hash = ?,
             chain_block_number = ?,
             technician_signature_count = ?,
             reviewer_signature_count = ?,
             submitted_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
            data.status,
            data.chainRecordId,
            data.chainTxHash || null,
            data.chainBlockNumber || null,
            data.technicianSignatureCount || 0,
            data.reviewerSignatureCount || 0,
            draftId,
        ]
    );
}

async function insertDraftAttachment(draftId, attachment, executor) {
    const db = getExecutor(executor);
    const [result] = await db.execute(
        `INSERT INTO maintenance_attachments (
            record_id, attachment_id, attachment_type, category_code,
            file_name, original_file_name, mime_type, file_extension,
            file_size, content_hash, storage_disk, storage_path,
            upload_status, uploaded_by, uploaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, 'ready', ?, CURRENT_TIMESTAMP)`,
        [
            draftId,
            attachment.attachmentId,
            attachment.attachmentType,
            attachment.categoryCode || null,
            attachment.fileName,
            attachment.originalFileName || null,
            attachment.mimeType,
            attachment.fileExtension || null,
            attachment.fileSize,
            attachment.contentHash,
            attachment.storagePath,
            attachment.uploadedBy || null,
        ]
    );
    return result.insertId;
}

async function getAttachmentByDraftAndId(draftId, attachmentId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT * FROM maintenance_attachments WHERE record_id = ? AND attachment_id = ? LIMIT 1`,
        [draftId, attachmentId]
    );
    return rows[0] ? mapAttachmentRow(rows[0]) : null;
}

async function deleteAttachmentByDraftAndId(draftId, attachmentId, executor) {
    const db = getExecutor(executor);
    await db.execute(
        `DELETE FROM maintenance_attachments WHERE record_id = ? AND attachment_id = ?`,
        [draftId, attachmentId]
    );
}

async function listAttachmentsByDraftId(draftId, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT * FROM maintenance_attachments WHERE record_id = ? ORDER BY uploaded_at ASC`,
        [draftId]
    );
    return rows.map(mapAttachmentRow);
}

async function deleteDraftAndChildren(draftId, executor) {
    const db = getExecutor(executor);
    await db.execute('DELETE FROM maintenance_attachment_upload_jobs WHERE attachment_id IN (SELECT id FROM maintenance_attachments WHERE record_id = ?)', [draftId]);
    await db.execute('DELETE FROM maintenance_attachments WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_attachment_manifests WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_record_specified_signers WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_record_replacements WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_record_measurements WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_record_parts WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_record_payloads WHERE record_id = ?', [draftId]);
    await db.execute('DELETE FROM maintenance_records WHERE id = ?', [draftId]);
}

async function upsertDraftManifest(draftId, manifestData, executor) {
    const db = getExecutor(executor);
    const [existing] = await db.execute(
        `SELECT id FROM maintenance_attachment_manifests WHERE record_id = ? LIMIT 1`,
        [draftId]
    );

    if (existing.length > 0) {
        await db.execute(
            `UPDATE maintenance_attachment_manifests
             SET manifest_hash = ?, attachment_count = ?, document_count = ?,
                 image_count = ?, video_count = ?, other_count = ?,
                 total_size = ?, manifest_json = ?, updated_at = CURRENT_TIMESTAMP
             WHERE record_id = ?`,
            [
                manifestData.manifestHash,
                manifestData.attachmentCount,
                manifestData.documentCount,
                manifestData.imageCount,
                manifestData.videoCount,
                manifestData.otherCount,
                manifestData.totalSize,
                JSON.stringify(manifestData.manifestJson),
                draftId,
            ]
        );
        return existing[0].id;
    }

    const [result] = await db.execute(
        `INSERT INTO maintenance_attachment_manifests (
            record_id, manifest_hash, attachment_count, document_count,
            image_count, video_count, other_count, total_size, manifest_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            draftId,
            manifestData.manifestHash,
            manifestData.attachmentCount,
            manifestData.documentCount,
            manifestData.imageCount,
            manifestData.videoCount,
            manifestData.otherCount,
            manifestData.totalSize,
            JSON.stringify(manifestData.manifestJson),
        ]
    );
    return result.insertId;
}

// ─── Signing Workbench queries ──────────────────────────────────────

const WORKBENCH_SELECT = `
    mr.id AS _db_id,
    mr.record_id,
    mr.root_record_id,
    mr.previous_record_id,
    mr.aircraft_reg_no,
    mr.aircraft_type,
    mr.job_card_no,
    mr.revision,
    mr.ata_code,
    mr.work_type,
    mr.location_code,
    mr.performer_employee_no,
    mr.performer_name,
    mr.required_technician_signatures,
    mr.required_reviewer_signatures,
    mr.technician_signature_count,
    mr.reviewer_signature_count,
    mr.is_rii,
    mr.status,
    mr.rejection_reason,
    mr.submitted_at,
    mr.rejected_at,
    mr.released_at,
    mr.created_at,
    mr.updated_at`;

function mapWorkbenchRow(row) {
    return mapRecordSummaryRow({
        ...row,
        specified_signer_count: 0,
        pending_specified_signer_count: 0,
    });
}

async function listPendingForTechnician(employeeNo, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT ${WORKBENCH_SELECT}
         FROM maintenance_records mr
         INNER JOIN maintenance_record_specified_signers ms
             ON ms.record_id = mr.id
             AND ms.signer_role = 'technician'
             AND ms.signer_employee_no = ?
             AND ms.status = 'pending'
         WHERE mr.status IN ('submitted', 'peer_checked')
         ORDER BY mr.updated_at DESC
         LIMIT 50`,
        [employeeNo]
    );
    return rows.map(mapWorkbenchRow);
}

async function listPendingForDesignatedReviewer(employeeNo, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT ${WORKBENCH_SELECT}
         FROM maintenance_records mr
         INNER JOIN maintenance_record_specified_signers ms
             ON ms.record_id = mr.id
             AND ms.signer_role = 'reviewer'
             AND ms.signer_employee_no = ?
             AND ms.status = 'pending'
         WHERE mr.status = 'submitted'
           AND mr.reviewer_signature_count < mr.required_reviewer_signatures
         ORDER BY mr.updated_at DESC
         LIMIT 50`,
        [employeeNo]
    );
    return rows.map(mapWorkbenchRow);
}

async function listPendingForReviewerPool(employeeNo, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT ${WORKBENCH_SELECT}
         FROM maintenance_records mr
         WHERE mr.status = 'submitted'
           AND mr.reviewer_signature_count < mr.required_reviewer_signatures
           AND mr.id NOT IN (
               SELECT ms.record_id FROM maintenance_record_specified_signers ms
               WHERE ms.signer_role = 'reviewer'
           )
           AND mr.id NOT IN (
               SELECT sig.record_id FROM maintenance_record_signatures sig
               WHERE sig.signer_employee_no = ? AND sig.action = 'reviewer_sign'
           )
         ORDER BY mr.updated_at DESC
         LIMIT 50`,
        [employeeNo]
    );
    return rows.map(mapWorkbenchRow);
}

async function listPendingForRelease(employeeNo, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT ${WORKBENCH_SELECT}
         FROM maintenance_records mr
         WHERE mr.status IN ('submitted', 'peer_checked', 'rii_approved')
           AND mr.technician_signature_count >= mr.required_technician_signatures
           AND mr.reviewer_signature_count >= mr.required_reviewer_signatures
           AND mr.id NOT IN (
               SELECT sig.record_id FROM maintenance_record_signatures sig
               WHERE sig.signer_employee_no = ? AND sig.action = 'release'
           )
         ORDER BY mr.updated_at DESC
         LIMIT 50`,
        [employeeNo]
    );
    return rows.map(mapWorkbenchRow);
}

async function listPendingForRii(employeeNo, executor) {
    const db = getExecutor(executor);
    const [rows] = await db.execute(
        `SELECT ${WORKBENCH_SELECT}
         FROM maintenance_records mr
         INNER JOIN maintenance_record_specified_signers ms
             ON ms.record_id = mr.id
             AND ms.signer_role = 'rii_inspector'
             AND ms.signer_employee_no = ?
             AND ms.status = 'pending'
         WHERE mr.status = 'peer_checked'
           AND mr.is_rii = TRUE
         ORDER BY mr.updated_at DESC
         LIMIT 50`,
        [employeeNo]
    );
    return rows.map(mapWorkbenchRow);
}

module.exports = {
    getRecordRowByRecordId,
    getRecordDetailByRecordId,
    insertRecordGraph,
    insertSignature,
    markSpecifiedSignerSigned,
    updateRecordAfterSignature,
    markRecordAsResubmitted,
    listRevisionsByRootRecordId,
    listRecordSummaries,
    insertDraftRecord,
    getDraftById,
    listDraftsByUserId,
    updateDraftFields,
    updateDraftPayload,
    replaceDraftParts,
    replaceDraftMeasurements,
    replaceDraftReplacements,
    replaceDraftSpecifiedSigners,
    revertDraftToEditing,
    finalizeDraft,
    submitDraft,
    insertDraftAttachment,
    getAttachmentByDraftAndId,
    deleteAttachmentByDraftAndId,
    listAttachmentsByDraftId,
    deleteDraftAndChildren,
    upsertDraftManifest,
    listPendingForTechnician,
    listPendingForDesignatedReviewer,
    listPendingForReviewerPool,
    listPendingForRelease,
    listPendingForRii,
};