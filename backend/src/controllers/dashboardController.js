const dashboardService = require('../services/dashboardService');

/**
 * 获取区块链统计数据
 */
async function getStatistics(req, res, next) {
    try {
        const data = await dashboardService.getBlockchainStatistics();
        res.status(200).json({
            blockHeight: data.blockHeight,
            onChainRecords: data.onChainRecords,
            totalRecords: data.totalRecords,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取30天趋势数据
 */
async function getTrend(req, res, next) {
    try {
        const data = await dashboardService.getTrendData();
        res.status(200).json({
            records: data.map(d => d.records),
            blocks: data.map(d => d.blocks),
            dates: data.map(d => d.date),
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取最近活动日志
 */
async function getActivityLog(req, res, next) {
    try {
        const data = await dashboardService.getActivityLog();
        res.status(200).json({
            activities: data,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 获取用户统计
 */
async function getUserStats(req, res, next) {
    try {
        const data = await dashboardService.getUserStats();
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
}

/**
 * 获取系统统计
 */
async function getSystemStats(req, res, next) {
    try {
        const data = await dashboardService.getSystemStats();
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
}

/**
 * 获取浏览器数据
 */
async function getBrowser(req, res, next) {
    try {
        const data = await dashboardService.getBrowserData();
        res.status(200).json({
            records: data,
        });
    } catch (error) {
        next(error);
    }
}

async function getChainBrowser(req, res, next) {
    try {
        const data = await dashboardService.getChainBrowserData();
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getStatistics,
    getTrend,
    getActivityLog,
    getUserStats,
    getSystemStats,
    getBrowser,
    getChainBrowser,
};
