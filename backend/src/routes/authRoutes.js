const express = require('express');

const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/admin/preregister', authController.preregisterUser);
router.post('/activate/challenge', authController.issueActivationChallenge);
router.post('/activate/verify', authController.activateUser);
router.post('/nonce', authController.issueNonce);
router.post('/verify', authController.verifySignature);
router.get('/me', authMiddleware, authController.getMe);
router.get('/users', authMiddleware, authController.listUsers);
router.get('/roles', authMiddleware, authController.listRoles);
router.patch('/users/:employeeNo', authMiddleware, authController.updateUser);
router.get('/signer-templates', authMiddleware, authController.listSignerTemplates);
router.put('/signer-templates/:templateCode', authMiddleware, authController.upsertSignerTemplate);

module.exports = router;
