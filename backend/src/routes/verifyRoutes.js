const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const verifyController = require('../controllers/verifyController');

const router = express.Router();

// Public - no auth required
router.get('/:recordId', verifyController.verifyRecord);

// Admin only - requires auth
router.post('/admin/tamper-demo/:recordId', authMiddleware, verifyController.tamperRecord);
router.post('/admin/restore-demo/:recordId', authMiddleware, verifyController.restoreTamper);

module.exports = router;
