const { ethers } = require('ethers');
const { getPool } = require('../config/database');
const {
    createProvider,
    loadArtifact,
    loadDeploymentInfo,
} = require('../../scripts/chain_helpers');

function createError(message, statusCode = 500) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

/**
 * 获取区块链统计数据
 */
async function getBlockchainStatistics() {
    try {
        const provider = createProvider();
        const blockNumber = await provider.getBlockNumber();

        // 获取上链记录总数
        const [chainRecords] = await getPool().execute(
            `SELECT COUNT(*) as count FROM maintenance_records WHERE chain_record_id IS NOT NULL`
        );
        const onChainRecordCount = chainRecords[0]?.count || 0;

        return {
            blockHeight: blockNumber,
            onChainRecords: onChainRecordCount,
            totalRecords: await getTotalRecordCount(),
        };
    } catch (error) {
        // 如果区块链连接失败，返回近似值
        console.error('Failed to get blockchain statistics:', error.message);
        return {
            blockHeight: 0,
            onChainRecords: await getTotalOnChainRecordCount(),
            totalRecords: await getTotalRecordCount(),
        };
    }
}

/**
 * 获取总记录数
 */
async function getTotalRecordCount() {
    const [rows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records`
    );
    return rows[0]?.count || 0;
}

/**
 * 获取链上记录总数
 */
async function getTotalOnChainRecordCount() {
    const [rows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records WHERE chain_record_id IS NOT NULL`
    );
    return rows[0]?.count || 0;
}

/**
 * 获取30天趋势数据
 */
async function getTrendData() {
    const days = 30;
    const data = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        // 获取该天的上链记录数
        const [recordRows] = await getPool().execute(
            `SELECT COUNT(*) as count FROM maintenance_records
             WHERE chain_record_id IS NOT NULL
             AND submitted_at >= ? AND submitted_at < ?`,
            [startOfDay, endOfDay]
        );
        const recordCount = recordRows[0]?.count || 0;

        // 获取该天生成的区块数（由于没有blocks表，使用记录数作为代理）
        // 实际应该查询链上的block数据，这里简化处理
        const blockCount = recordCount > 0 ? Math.ceil(recordCount / 3) : 0;

        const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
        data.push({
            date: dateStr,
            records: recordCount,
            blocks: blockCount,
        });
    }

    return data;
}

/**
 * 获取最近活动日志
 */
async function getActivityLog() {
    const [rows] = await getPool().execute(
        `SELECT
            mr.record_id,
            mr.performer_name,
            mr.status,
            mr.submitted_at,
            mr.aircraft_reg_no
        FROM maintenance_records mr
        WHERE mr.submitted_at IS NOT NULL
        ORDER BY mr.submitted_at DESC
        LIMIT 8`
    );

    return rows.map(row => {
        // 根据status判断动作描述
        let action = '提交了检修记录';
        let icon = '📝';

        if (row.status === 'released') {
            action = '放行了记录';
            icon = '🚀';
        } else if (row.status === 'peer_checked') {
            action = '审核通过了记录';
            icon = '✓';
        } else if (row.status === 'rii_approved') {
            action = '审核通过了记录';
            icon = '✓';
        } else if (row.status === 'rejected') {
            action = '驳回了记录';
            icon = '✕';
        } else if (row.status === 'submitted') {
            action = '提交了检修记录';
            icon = '📝';
        }

        return {
            icon,
            action,
            performer: row.performer_name || '系统用户',
            aircraftNo: row.aircraft_reg_no || '-',
            recordId: row.record_id,
            timestamp: row.submitted_at,
        };
    });
}

/**
 * 获取用户统计
 */
async function getUserStats() {
    const [totalRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM users`
    );
    const totalUsers = totalRows[0]?.count || 0;

    const [activeRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM users WHERE status = 'active'`
    );
    const activeUsers = activeRows[0]?.count || 0;

    const [rolesRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM roles`
    );
    const totalRoles = rolesRows[0]?.count || 0;

    const [pendingRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM users WHERE status = 'pending_activation'`
    );
    const pendingActivation = pendingRows[0]?.count || 0;

    return {
        totalUsers,
        activeUsers,
        totalRoles,
        pendingActivation,
    };
}

/**
 * 获取系统统计
 */
async function getSystemStats() {
    // 总记录数
    const [totalRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records`
    );
    const totalRecords = totalRows[0]?.count || 0;

    // 本月记录数
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [monthRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records
         WHERE submitted_at >= ?`,
        [monthStart]
    );
    const recordsThisMonth = monthRows[0]?.count || 0;

    // 链上确认率：已提交记录中已上链的比例（排除草稿/finalized）
    const [chainRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records WHERE chain_record_id IS NOT NULL`
    );
    const chainConfirmedCount = Number(chainRows[0]?.count || 0);
    const [submittedRows] = await getPool().execute(
        `SELECT COUNT(*) as count FROM maintenance_records WHERE status NOT IN ('draft', 'finalized')`
    );
    const submittedCount = Number(submittedRows[0]?.count || 0);
    const chainConfirmationRate = submittedCount > 0
        ? ((chainConfirmedCount / submittedCount) * 100).toFixed(1)
        : 100;

    // 平均批准时间（从提交到放行的平均时间）
    const [timeRows] = await getPool().execute(
        `SELECT AVG(TIMESTAMPDIFF(MINUTE, submitted_at, released_at)) as avg_minutes
         FROM maintenance_records
         WHERE released_at IS NOT NULL AND submitted_at IS NOT NULL`
    );
    const avgMinutes = timeRows[0]?.avg_minutes || 0;
    const hours = Math.round(avgMinutes / 60 * 10) / 10;

    return {
        totalRecords,
        recordsThisMonth,
        chainConfirmationRate: Number(chainConfirmationRate),
        averageApprovalTime: `${hours}h`,
    };
}

/**
 * 获取浏览器数据（最新区块、交易、记录）
 */
async function getBrowserData() {
    // 获取最新的上链记录
    const [recordRows] = await getPool().execute(
        `SELECT
            record_id,
            aircraft_reg_no,
            performer_name,
            status,
            chain_tx_hash,
            chain_block_number,
            submitted_at
        FROM maintenance_records
        WHERE chain_record_id IS NOT NULL
        ORDER BY submitted_at DESC
        LIMIT 10`
    );

    const records = recordRows.map(row => ({
        id: row.record_id,
        type: 'record',
        title: `${row.aircraft_reg_no} - ${row.performer_name}`,
        status: row.status,
        txHash: row.chain_tx_hash,
        blockNumber: row.chain_block_number,
        timestamp: row.submitted_at,
    }));

    return records;
}

/**
 * 获取最新区块和交易数据（真实链上数据）
 */
async function getChainBrowserData() {
    try {
        const provider = createProvider();
        const latestBlockNumber = await provider.getBlockNumber();

        // 获取最新 5 个区块
        const blockNumbers = Array.from({ length: 5 }, (_, i) => latestBlockNumber - i).filter(n => n >= 0);
        const blocks = await Promise.all(blockNumbers.map(async (n) => {
            const block = await provider.getBlock(n);
            return block ? {
                blockNo: block.number,
                hash: block.hash ? block.hash.slice(0, 10) + '...' + block.hash.slice(-6) : '-',
                transactions: block.transactions?.length ?? 0,
                timestamp: new Date(Number(block.timestamp) * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            } : null;
        }));

        // 获取最新交易：从 DB 取最近的 chain_tx_hash
        const [txRows] = await getPool().execute(
            `SELECT chain_tx_hash, status, submitted_at, aircraft_reg_no
             FROM maintenance_records
             WHERE chain_tx_hash IS NOT NULL
             ORDER BY submitted_at DESC LIMIT 5`
        );
        const transactions = txRows.map(row => ({
            hash: row.chain_tx_hash
                ? row.chain_tx_hash.slice(0, 10) + '...' + row.chain_tx_hash.slice(-6)
                : '-',
            fullHash: row.chain_tx_hash,
            type: 'MaintenanceRecord',
            status: '已确认',
            aircraftNo: row.aircraft_reg_no || '-',
            timestamp: new Date(row.submitted_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        }));

        return {
            blocks: blocks.filter(Boolean),
            transactions,
        };
    } catch (error) {
        console.error('Failed to get chain browser data:', error.message);
        return { blocks: [], transactions: [] };
    }
}

module.exports = {
    getBlockchainStatistics,
    getTrendData,
    getActivityLog,
    getUserStats,
    getSystemStats,
    getBrowserData,
    getChainBrowserData,
};
