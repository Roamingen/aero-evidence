require('dotenv').config();
const { getPool } = require('../src/config/database');

async function main() {
    const pool = getPool();
    const [records] = await pool.execute(
        "SELECT id, record_id FROM maintenance_records WHERE status NOT IN ('draft','finalized') LIMIT 1"
    );
    const rec = records[0];
    const [payloadRows] = await pool.execute(
        'SELECT * FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1',
        [rec.id]
    );
    const row = payloadRows[0];
    console.log('payload row keys:', Object.keys(row));
    console.log('payload row:', row);
    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
