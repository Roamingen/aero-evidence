const crypto = require('crypto');

const { getPool } = require('../config/database');

function hashCode(code) {
    return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

function buildActivationCode(length = 8) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let value = '';
    while (value.length < length) {
        const index = crypto.randomInt(0, alphabet.length);
        value += alphabet[index];
    }
    return value;
}

async function issueCode(userId, options = {}) {
    const code = String(options.code || buildActivationCode()).trim().toUpperCase();
    const codeHash = hashCode(code);
    const codeLast4 = code.slice(-4);

    await getPool().execute(
        `UPDATE activation_codes
         SET consumed_at = CURRENT_TIMESTAMP
         WHERE user_id = ?
           AND consumed_at IS NULL`,
        [userId]
    );

    await getPool().execute(
        `INSERT INTO activation_codes (
            user_id,
            code_hash,
            code_last4,
            expires_at,
            max_attempts,
            delivery_channel,
            issued_by
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            codeHash,
            codeLast4,
            new Date(options.expiresAt),
            options.maxAttempts || 5,
            options.deliveryChannel || 'manual',
            options.issuedBy || null,
        ]
    );

    return {
        code,
        codeLast4,
        expiresAt: new Date(options.expiresAt).toISOString(),
    };
}

async function getLatestActiveCodeByUserId(userId) {
    const [rows] = await getPool().execute(
        `SELECT id, user_id, code_hash, code_last4, expires_at, consumed_at, attempt_count, max_attempts, created_at
         FROM activation_codes
         WHERE user_id = ?
           AND consumed_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
        [userId]
    );

    const row = rows[0];
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        userId: row.user_id,
        codeHash: row.code_hash,
        codeLast4: row.code_last4,
        expiresAt: new Date(row.expires_at).toISOString(),
        consumedAt: row.consumed_at,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        createdAt: row.created_at,
    };
}

async function incrementAttempt(codeId) {
    await getPool().execute(
        `UPDATE activation_codes
         SET attempt_count = attempt_count + 1
         WHERE id = ?`,
        [codeId]
    );
}

async function consumeCode(codeId) {
    await getPool().execute(
        `UPDATE activation_codes
         SET consumed_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND consumed_at IS NULL`,
        [codeId]
    );
}

async function getActivationCodeByUserId(userId) {
    const [rows] = await getPool().execute(
        `SELECT id, user_id, code_hash, code_last4, expires_at, consumed_at, attempt_count, max_attempts, created_at
         FROM activation_codes
         WHERE user_id = ?
           AND consumed_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
        [userId]
    );

    const row = rows[0];
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        userId: row.user_id,
        codeHash: row.code_hash,
        codeLast4: row.code_last4,
        expiresAt: new Date(row.expires_at).toISOString(),
        consumedAt: row.consumed_at,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        createdAt: row.created_at,
    };
}

async function listAllActiveCodesByStatus() {
    const [rows] = await getPool().execute(
        `SELECT ac.id, ac.user_id, ac.code_last4, ac.expires_at, ac.consumed_at, ac.created_at,
                u.employee_no, u.name, u.status
         FROM activation_codes ac
         INNER JOIN users u ON u.id = ac.user_id
         WHERE ac.consumed_at IS NULL
         ORDER BY ac.created_at DESC`
    );

    return rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        employeeNo: row.employee_no,
        userName: row.name,
        codeLast4: row.code_last4,
        expiresAt: new Date(row.expires_at).toISOString(),
        userStatus: row.status,
        createdAt: row.created_at,
    }));
}

async function revokeActivationCode(codeId) {
    await getPool().execute(
        `UPDATE activation_codes
         SET consumed_at = CURRENT_TIMESTAMP
         WHERE id = ?
           AND consumed_at IS NULL`,
        [codeId]
    );
}

module.exports = {
    hashCode,
    issueCode,
    getLatestActiveCodeByUserId,
    getActivationCodeByUserId,
    incrementAttempt,
    consumeCode,
    listAllActiveCodesByStatus,
    revokeActivationCode,
};