const express = require('express');

const authController = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/admin/preregister', authMiddleware, authController.preregisterUser);
router.post('/activate/challenge', authController.issueActivationChallenge);
router.post('/activate/verify', authController.activateUser);
router.post('/nonce', authController.issueNonce);
router.post('/verify', authController.verifySignature);
router.get('/me', authMiddleware, authController.getMe);
router.get('/users', authMiddleware, authController.listUsers);
router.get('/roles', authMiddleware, authController.listRoles);
router.patch('/users/:employeeNo', authMiddleware, authController.updateUser);
router.get('/activation-codes', authMiddleware, authController.listActivationCodes);
router.post('/activation-codes/:employeeNo/regenerate', authMiddleware, authController.regenerateActivationCode);
router.post('/activation-codes/:employeeNo/revoke', authMiddleware, authController.revokeActivationCode);
router.post('/users/:employeeNo/clear-address', authMiddleware, authController.clearUserAddress);
router.post('/users/:employeeNo/reset-pending', authMiddleware, authController.resetUserToPending);
router.post('/users/:employeeNo/modify-address', authMiddleware, authController.modifyUserAddress);
router.get('/permissions', authMiddleware, authController.listAllPermissions);
router.get('/users/:employeeNo/permissions', authMiddleware, authController.getUserPermissions);
router.post('/users/:employeeNo/permissions/override', authMiddleware, authController.setUserPermissionOverride);
router.delete('/users/:employeeNo/permissions/override', authMiddleware, authController.deleteUserPermissionOverride);
router.get('/signer-templates', authMiddleware, authController.listSignerTemplates);
router.put('/signer-templates/:templateCode', authMiddleware, authController.upsertSignerTemplate);

module.exports = router;
