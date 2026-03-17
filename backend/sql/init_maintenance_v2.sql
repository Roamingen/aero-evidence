-- DEV ONLY: maintenance V2 schema for chain-down record body, signatures and attachment metadata.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS maintenance_attachment_upload_jobs;

DROP TABLE IF EXISTS maintenance_attachments;

DROP TABLE IF EXISTS maintenance_attachment_manifests;

DROP TABLE IF EXISTS maintenance_record_specified_signers;

DROP TABLE IF EXISTS maintenance_signer_templates;

DROP TABLE IF EXISTS maintenance_record_signatures;

DROP TABLE IF EXISTS maintenance_record_replacements;

DROP TABLE IF EXISTS maintenance_record_measurements;

DROP TABLE IF EXISTS maintenance_record_parts;

DROP TABLE IF EXISTS maintenance_record_payloads;

DROP TABLE IF EXISTS maintenance_records;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS maintenance_records (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id CHAR(66) DEFAULT NULL UNIQUE,
    root_record_id CHAR(66) DEFAULT NULL,
    previous_record_id CHAR(66) DEFAULT NULL,
    superseded_by_record_id CHAR(66) DEFAULT NULL,
    aircraft_reg_no VARCHAR(30) DEFAULT NULL,
    aircraft_type VARCHAR(50) DEFAULT NULL,
    job_card_no VARCHAR(50) NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    ata_code VARCHAR(30) DEFAULT NULL,
    work_type VARCHAR(50) DEFAULT NULL,
    location_code VARCHAR(100) DEFAULT NULL,
    performer_user_id BIGINT DEFAULT NULL,
    performer_employee_no VARCHAR(50) DEFAULT NULL,
    performer_name VARCHAR(100) DEFAULT NULL,
    required_technician_signatures INT NOT NULL DEFAULT 1,
    required_reviewer_signatures INT NOT NULL DEFAULT 0,
    technician_signature_count INT NOT NULL DEFAULT 0,
    reviewer_signature_count INT NOT NULL DEFAULT 0,
    is_rii BOOLEAN NOT NULL DEFAULT FALSE,
    occurrence_time DATETIME DEFAULT NULL,
    status ENUM(
        'draft',
        'finalized',
        'submitted',
        'peer_checked',
        'rii_approved',
        'released',
        'rejected',
        'revoked'
    ) NOT NULL DEFAULT 'draft',
    chain_record_id CHAR(66) DEFAULT NULL,
    chain_tx_hash CHAR(66) DEFAULT NULL,
    chain_block_number BIGINT DEFAULT NULL,
    form_hash CHAR(66) DEFAULT NULL,
    fault_hash CHAR(66) DEFAULT NULL,
    parts_hash CHAR(66) DEFAULT NULL,
    measurements_hash CHAR(66) DEFAULT NULL,
    replacements_hash CHAR(66) DEFAULT NULL,
    attachment_manifest_hash CHAR(66) DEFAULT NULL,
    rejection_reason TEXT DEFAULT NULL,
    rejected_at DATETIME DEFAULT NULL,
    resubmitted_at DATETIME DEFAULT NULL,
    submitted_at DATETIME DEFAULT NULL,
    finalized_at DATETIME DEFAULT NULL,
    draft_saved_at DATETIME DEFAULT NULL,
    released_at DATETIME DEFAULT NULL,
    created_by BIGINT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_maintenance_records_root_revision (root_record_id, revision),
    KEY idx_maintenance_records_aircraft_reg_no (aircraft_reg_no),
    KEY idx_maintenance_records_job_card_no (job_card_no),
    KEY idx_maintenance_records_root_record_id (root_record_id),
    KEY idx_maintenance_records_previous_record_id (previous_record_id),
    KEY idx_maintenance_records_performer_employee_no (performer_employee_no),
    KEY idx_maintenance_records_status (status),
    CONSTRAINT fk_maintenance_records_performer_user FOREIGN KEY (performer_user_id) REFERENCES users (id),
    CONSTRAINT fk_maintenance_records_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_payloads (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    work_description TEXT DEFAULT NULL,
    reference_document TEXT DEFAULT NULL,
    fault_code VARCHAR(50) DEFAULT NULL,
    fault_description TEXT DEFAULT NULL,
    raw_form_json JSON DEFAULT NULL,
    normalized_form_json JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_maintenance_record_payloads_record_id (record_id),
    CONSTRAINT fk_maintenance_record_payloads_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_parts (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    part_role ENUM(
        'used',
        'removed',
        'installed'
    ) NOT NULL,
    part_number VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100) DEFAULT NULL,
    part_status VARCHAR(100) DEFAULT NULL,
    source_description VARCHAR(255) DEFAULT NULL,
    replacement_reason VARCHAR(255) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_maintenance_record_parts_record_id (record_id),
    CONSTRAINT fk_maintenance_record_parts_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_measurements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    test_item_name VARCHAR(255) NOT NULL,
    measured_values TEXT DEFAULT NULL,
    is_pass BOOLEAN NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_maintenance_record_measurements_record_id (record_id),
    CONSTRAINT fk_maintenance_record_measurements_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_replacements (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    removed_part_no VARCHAR(100) DEFAULT NULL,
    removed_serial_no VARCHAR(100) DEFAULT NULL,
    removed_status VARCHAR(100) DEFAULT NULL,
    installed_part_no VARCHAR(100) DEFAULT NULL,
    installed_serial_no VARCHAR(100) DEFAULT NULL,
    installed_source VARCHAR(255) DEFAULT NULL,
    replacement_reason VARCHAR(255) DEFAULT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_maintenance_record_replacements_record_id (record_id),
    CONSTRAINT fk_maintenance_record_replacements_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_signatures (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    signer_role ENUM(
        'technician',
        'reviewer',
        'rii_inspector',
        'release_authority',
        'system_node'
    ) NOT NULL,
    action ENUM(
        'submit',
        'technician_sign',
        'reviewer_sign',
        'rii_approve',
        'release',
        'reject',
        'revoke'
    ) NOT NULL,
    signer_user_id BIGINT DEFAULT NULL,
    signer_employee_no VARCHAR(50) NOT NULL,
    signer_name VARCHAR(100) DEFAULT NULL,
    signer_address VARCHAR(42) NOT NULL,
    signed_digest CHAR(66) NOT NULL,
    signature_hash CHAR(66) NOT NULL,
    signature_algorithm VARCHAR(50) NOT NULL DEFAULT 'EIP-191',
    signature_payload_path VARCHAR(255) DEFAULT NULL,
    chain_tx_hash CHAR(66) DEFAULT NULL,
    signed_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_maintenance_record_signatures_record_id (record_id),
    KEY idx_maintenance_record_signatures_signer_role (signer_role),
    KEY idx_maintenance_record_signatures_action (action),
    UNIQUE KEY uk_maintenance_record_signatures_action_signer (
        record_id,
        action,
        signer_address
    ),
    CONSTRAINT fk_maintenance_record_signatures_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id),
    CONSTRAINT fk_maintenance_record_signatures_signer_user FOREIGN KEY (signer_user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS maintenance_record_specified_signers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    signer_role ENUM(
        'technician',
        'reviewer',
        'rii_inspector',
        'release_authority'
    ) NOT NULL,
    signer_user_id BIGINT DEFAULT NULL,
    signer_employee_no VARCHAR(50) NOT NULL,
    signer_name VARCHAR(100) DEFAULT NULL,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    sequence_no INT NOT NULL DEFAULT 0,
    status ENUM(
        'pending',
        'signed',
        'cancelled'
    ) NOT NULL DEFAULT 'pending',
    signed_signature_id BIGINT DEFAULT NULL,
    signed_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_maintenance_record_specified_signers_role_employee (
        record_id,
        signer_role,
        signer_employee_no
    ),
    KEY idx_maintenance_record_specified_signers_record_id (record_id),
    KEY idx_maintenance_record_specified_signers_signer_role (signer_role),
    KEY idx_maintenance_record_specified_signers_employee_no (signer_employee_no),
    CONSTRAINT fk_maintenance_record_specified_signers_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id),
    CONSTRAINT fk_maintenance_record_specified_signers_user FOREIGN KEY (signer_user_id) REFERENCES users (id),
    CONSTRAINT fk_maintenance_record_specified_signers_signature FOREIGN KEY (signed_signature_id) REFERENCES maintenance_record_signatures (id)
);

CREATE TABLE IF NOT EXISTS maintenance_signer_templates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    template_code VARCHAR(80) NOT NULL UNIQUE,
    template_name VARCHAR(120) NOT NULL,
    work_type VARCHAR(80) DEFAULT NULL,
    ata_code VARCHAR(30) DEFAULT NULL,
    aircraft_type VARCHAR(50) DEFAULT NULL,
    default_signers_json JSON NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT DEFAULT NULL,
    updated_by BIGINT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_maintenance_signer_templates_template_code (template_code),
    KEY idx_maintenance_signer_templates_work_type (work_type),
    CONSTRAINT fk_maintenance_signer_templates_created_by FOREIGN KEY (created_by) REFERENCES users (id),
    CONSTRAINT fk_maintenance_signer_templates_updated_by FOREIGN KEY (updated_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS maintenance_attachment_manifests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    manifest_hash CHAR(66) NOT NULL,
    attachment_count INT NOT NULL DEFAULT 0,
    document_count INT NOT NULL DEFAULT 0,
    image_count INT NOT NULL DEFAULT 0,
    video_count INT NOT NULL DEFAULT 0,
    other_count INT NOT NULL DEFAULT 0,
    total_size BIGINT NOT NULL DEFAULT 0,
    manifest_json JSON NOT NULL,
    created_by BIGINT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_maintenance_attachment_manifests_record_id (record_id),
    CONSTRAINT fk_maintenance_attachment_manifests_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id),
    CONSTRAINT fk_maintenance_attachment_manifests_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS maintenance_attachments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    record_id BIGINT NOT NULL,
    manifest_id BIGINT DEFAULT NULL,
    attachment_id VARCHAR(64) NOT NULL,
    attachment_type ENUM(
        'document',
        'image',
        'video',
        'other'
    ) NOT NULL,
    category_code VARCHAR(50) DEFAULT NULL,
    file_name VARCHAR(255) NOT NULL,
    original_file_name VARCHAR(255) DEFAULT NULL,
    mime_type VARCHAR(120) NOT NULL,
    file_extension VARCHAR(20) DEFAULT NULL,
    file_size BIGINT NOT NULL,
    content_hash CHAR(66) NOT NULL,
    thumbnail_hash CHAR(66) DEFAULT NULL,
    storage_disk ENUM(
        'local',
        'nas',
        'minio',
        's3',
        'other'
    ) NOT NULL DEFAULT 'local',
    storage_path VARCHAR(500) NOT NULL,
    preview_path VARCHAR(500) DEFAULT NULL,
    transcoded_path VARCHAR(500) DEFAULT NULL,
    upload_status ENUM(
        'pending',
        'ready',
        'quarantined',
        'deleted'
    ) NOT NULL DEFAULT 'ready',
    uploaded_by BIGINT DEFAULT NULL,
    uploaded_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_maintenance_attachments_record_attachment (record_id, attachment_id),
    KEY idx_maintenance_attachments_record_id (record_id),
    KEY idx_maintenance_attachments_type (attachment_type),
    CONSTRAINT fk_maintenance_attachments_record FOREIGN KEY (record_id) REFERENCES maintenance_records (id),
    CONSTRAINT fk_maintenance_attachments_manifest FOREIGN KEY (manifest_id) REFERENCES maintenance_attachment_manifests (id),
    CONSTRAINT fk_maintenance_attachments_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS maintenance_attachment_upload_jobs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    attachment_id BIGINT NOT NULL,
    job_type ENUM(
        'virus_scan',
        'thumbnail',
        'transcode',
        'rehash'
    ) NOT NULL,
    job_status ENUM(
        'pending',
        'running',
        'success',
        'failed'
    ) NOT NULL DEFAULT 'pending',
    error_message TEXT DEFAULT NULL,
    started_at DATETIME DEFAULT NULL,
    finished_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_maintenance_attachment_upload_jobs_attachment_id (attachment_id),
    CONSTRAINT fk_maintenance_attachment_upload_jobs_attachment FOREIGN KEY (attachment_id) REFERENCES maintenance_attachments (id)
);