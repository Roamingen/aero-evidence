const { getPool } = require('../config/database');

function normalizeAddress(address) {
    return String(address || '').toLowerCase();
}

async function saveChallenge(challenge) {
    const normalizedAddress = normalizeAddress(challenge.address);

    await getPool().execute(
        `UPDATE auth_challenges
         SET used_at = CURRENT_TIMESTAMP
         WHERE address = ?
           AND challenge_type = ?
           AND used_at IS NULL`,
        [normalizedAddress, challenge.challengeType]
    );

    await getPool().execute(
        `INSERT INTO auth_challenges (user_id, challenge_type, address, nonce, message, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            challenge.userId || null,
            challenge.challengeType,
            normalizedAddress,
            challenge.nonce,
            challenge.message,
            new Date(challenge.expiresAt),
        ]
    );

    return challenge;
}

async function getChallenge(address, challengeType) {
    const normalizedAddress = normalizeAddress(address);
    const [rows] = await getPool().execute(
        `SELECT id, user_id, challenge_type, address, nonce, message, expires_at, used_at, created_at
         FROM auth_challenges
         WHERE address = ?
           AND challenge_type = ?
           AND used_at IS NULL
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedAddress, challengeType]
    );

    const row = rows[0];
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        userId: row.user_id,
        challengeType: row.challenge_type,
        address: row.address,
        nonce: row.nonce,
        message: row.message,
        expiresAt: new Date(row.expires_at).toISOString(),
        usedAt: row.used_at,
        createdAt: row.created_at,
    };
}

async function consumeChallenge(challengeId) {
    await getPool().execute(
        `UPDATE auth_challenges
         SET used_at = CURRENT_TIMESTAMP
         WHERE id = ? AND used_at IS NULL`,
        [challengeId]
    );
}

module.exports = {
    saveChallenge,
    getChallenge,
    consumeChallenge,
};
