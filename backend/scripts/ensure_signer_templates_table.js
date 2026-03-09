const { getPool } = require('../src/config/database');

const CREATE_TABLE_SQL = `
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
)
`;

async function main() {
    const pool = getPool();
    await pool.query(CREATE_TABLE_SQL);
    console.log('maintenance_signer_templates is ready');
    await pool.end();
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});