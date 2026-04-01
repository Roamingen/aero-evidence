/**
 * 调试验证哈希不匹配问题
 * 用法: node scripts/debug_verify.js <recordId>
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { hashJson, canonicalJson, loadDeploymentInfo, loadArtifact, createProvider } = require('./chain_helpers');
const { ethers } = require('ethers');

async function main() {
    const recordId = process.argv[2];
    if (!recordId) {
        console.error('用法: node scripts/debug_verify.js <recordId>');
        process.exit(1);
    }

    const maintenanceStore = require('../src/models/maintenanceStore');
    const { getPool } = require('../src/config/database');

    // ── 1. 从链上读取 digest ──
    const deploymentInfo = loadDeploymentInfo();
    const artifact = loadArtifact();
    const provider = createProvider();
    const contract = new ethers.Contract(deploymentInfo.address, artifact.abi, provider);
    const chainRecord = await contract.getRecord(recordId);

    const chainDigest = {
        formHash: chainRecord.digest.formHash,
        faultHash: chainRecord.digest.faultHash,
    };
    console.log('\n=== 链上 digest ===');
    console.log(JSON.stringify(chainDigest, null, 2));

    // ── 2. 从 DB 读取记录 ──
    const record = await maintenanceStore.getRecordDetailByRecordId(recordId);
    if (!record) { console.error('DB 中找不到记录'); process.exit(1); }

    console.log('\n=== record.id =', record.id);

    // ── 3. 直接查 payload 原始行 ──
    const pool = getPool();
    const [rawPayloadRows] = await pool.execute(
        'SELECT * FROM maintenance_record_payloads WHERE record_id = ? LIMIT 1',
        [record.id]
    );
    const rawPayload = rawPayloadRows[0] || null;
    console.log('\n=== DB payload 原始行 ===');
    console.log(JSON.stringify(rawPayload, null, 2));

    if (!rawPayload) {
        console.error('payload 行不存在！record.id =', record.id);
        process.exit(1);
    }

    // ── 4. 按 finalizeDraft 逻辑重建 formPayload / faultPayload ──
    const recomputedFormPayload = {
        aircraftRegNo: record.aircraftRegNo,
        aircraftType: record.aircraftType,
        jobCardNo: record.jobCardNo,
        revision: record.revision,
        ataCode: record.ataCode,
        workType: record.workType,
        locationCode: record.locationCode,
        performerEmployeeNo: record.performerEmployeeNo,
        performerName: record.performerName,
        occurrenceTime: record.occurrenceTime ? new Date(record.occurrenceTime).toISOString() : null,
        workDescription: rawPayload.work_description,
        referenceDocument: rawPayload.reference_document,
        rawFormJson: rawPayload.raw_form_json || {},
        normalizedFormJson: rawPayload.normalized_form_json || null,
    };

    const recomputedFaultPayload = {
        faultCode: rawPayload.fault_code,
        faultDescription: rawPayload.fault_description,
    };

    console.log('\n=== recomputedFormPayload ===');
    console.log(JSON.stringify(recomputedFormPayload, null, 2));
    console.log('\n=== canonicalJson(formPayload) ===');
    console.log(canonicalJson(recomputedFormPayload));
    console.log('\n=== recomputedFaultPayload ===');
    console.log(JSON.stringify(recomputedFaultPayload, null, 2));
    console.log('\n=== canonicalJson(faultPayload) ===');
    console.log(canonicalJson(recomputedFaultPayload));

    // ── 5. 对比哈希 ──
    const recomputed = {
        formHash: hashJson(recomputedFormPayload),
        faultHash: hashJson(recomputedFaultPayload),
    };

    console.log('\n=== 哈希对比 ===');
    for (const key of ['formHash', 'faultHash']) {
        const match = chainDigest[key] === recomputed[key];
        console.log(`${key}: ${match ? '✅ 匹配' : '❌ 不匹配'}`);
        if (!match) {
            console.log(`  链上:   ${chainDigest[key]}`);
            console.log(`  重算:   ${recomputed[key]}`);
        }
    }

    process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
