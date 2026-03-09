const express = require('express');

const authMiddleware = require('../middlewares/authMiddleware');
const maintenanceController = require('../controllers/maintenanceController');

const router = express.Router();

router.use(authMiddleware);

router.get('/records', maintenanceController.listRecords);
router.get('/workbench', maintenanceController.getWorkbench);
router.post('/records/prepare', maintenanceController.prepareSubmitRecord);
router.post('/records', maintenanceController.submitRecord);
router.get('/records/:recordId', maintenanceController.getRecord);
router.get('/records/:recordId/revisions', maintenanceController.listRevisions);
router.post('/records/:recordId/signatures', maintenanceController.appendSignature);
router.post('/records/:recordId/resubmit', maintenanceController.resubmitRejectedRecord);

module.exports = router;