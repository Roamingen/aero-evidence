const mysql = require('mysql2/promise');
const env = require('./env');

let pool;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: env.db.host,
            port: env.db.port,
            database: env.db.name,
            user: env.db.user,
            password: env.db.password,
            waitForConnections: true,
            connectionLimit: env.db.connectionLimit,
            namedPlaceholders: true,
        });
    }

    return pool;
}

async function testConnection() {
    const connection = await getPool().getConnection();
    try {
        await connection.ping();
    } finally {
        connection.release();
    }
}

module.exports = {
    getPool,
    testConnection,
};
