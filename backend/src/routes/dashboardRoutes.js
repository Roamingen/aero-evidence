const express = require('express');

const authMiddleware = require('../middlewares/authMiddleware');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

// 所有dashboard接口都需要认证
router.use(authMiddleware);

// 获取区块链统计数据
router.get('/statistics', dashboardController.getStatistics);

// 获取30天趋势数据
router.get('/trend', dashboardController.getTrend);

// 获取最近活动日志
router.get('/activity-log', dashboardController.getActivityLog);

// 获取用户统计
router.get('/user-stats', dashboardController.getUserStats);

// 获取系统统计
router.get('/system-stats', dashboardController.getSystemStats);

// 获取浏览器数据
router.get('/browser', dashboardController.getBrowser);

module.exports = router;
