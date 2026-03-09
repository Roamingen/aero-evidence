const { getPool } = require('../config/database');

function normalizeTemplateCode(templateCode) {
    return String(templateCode || '').trim();
}

function parseDefaultSigners(value) {
    if (value == null) {
        return [];
    }
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return [];
        }
    }
    return value;
}

function mapTemplateRow(row) {
    return {
        id: row.id,
        templateCode: row.template_code,
        templateName: row.template_name,
        workType: row.work_type,
        ataCode: row.ata_code,
        aircraftType: row.aircraft_type,
        defaultSigners: parseDefaultSigners(row.default_signers_json),
        isActive: Boolean(row.is_active),
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

async function listTemplates() {
    const [rows] = await getPool().execute(
        `SELECT *
         FROM maintenance_signer_templates
         ORDER BY is_active DESC, updated_at DESC, id DESC`
    );

    return rows.map(mapTemplateRow);
}

async function getTemplateByCode(templateCode) {
    const normalizedTemplateCode = normalizeTemplateCode(templateCode);
    if (!normalizedTemplateCode) {
        return null;
    }

    const [rows] = await getPool().execute(
        `SELECT *
         FROM maintenance_signer_templates
         WHERE template_code = ?
         LIMIT 1`,
        [normalizedTemplateCode]
    );

    return rows[0] ? mapTemplateRow(rows[0]) : null;
}

async function upsertTemplate(template, actorUserId = null) {
    const normalizedTemplateCode = normalizeTemplateCode(template.templateCode);
    const existingTemplate = await getTemplateByCode(normalizedTemplateCode);

    if (!existingTemplate) {
        await getPool().execute(
            `INSERT INTO maintenance_signer_templates (
                template_code,
                template_name,
                work_type,
                ata_code,
                aircraft_type,
                default_signers_json,
                is_active,
                created_by,
                updated_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                normalizedTemplateCode,
                template.templateName,
                template.workType || null,
                template.ataCode || null,
                template.aircraftType || null,
                JSON.stringify(template.defaultSigners || []),
                template.isActive ? 1 : 0,
                actorUserId,
                actorUserId,
            ]
        );
    } else {
        await getPool().execute(
            `UPDATE maintenance_signer_templates
             SET template_name = ?,
                 work_type = ?,
                 ata_code = ?,
                 aircraft_type = ?,
                 default_signers_json = ?,
                 is_active = ?,
                 updated_by = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE template_code = ?`,
            [
                template.templateName,
                template.workType || null,
                template.ataCode || null,
                template.aircraftType || null,
                JSON.stringify(template.defaultSigners || []),
                template.isActive ? 1 : 0,
                actorUserId,
                normalizedTemplateCode,
            ]
        );
    }

    return getTemplateByCode(normalizedTemplateCode);
}

module.exports = {
    getTemplateByCode,
    listTemplates,
    upsertTemplate,
};