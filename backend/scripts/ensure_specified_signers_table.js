const { getPool } = require('../src/config/database');

const CREATE_TABLE_SQL = `
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
)
`;

async function main() {
    const pool = getPool();
    await pool.query(CREATE_TABLE_SQL);
    console.log('maintenance_record_specified_signers is ready');
    await pool.end();
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});