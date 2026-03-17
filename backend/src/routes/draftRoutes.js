const express = require('express');

const authMiddleware = require('../middlewares/authMiddleware');
const draftController = require('../controllers/draftController');
const { upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

router.use(authMiddleware);

// Draft CRUD
router.post('/', draftController.createDraft);
router.get('/', draftController.listDrafts);
router.get('/:draftId', draftController.getDraft);
router.put('/:draftId', draftController.saveDraft);
router.delete('/:draftId', draftController.deleteDraft);

// Attachment management
router.post('/:draftId/attachments', upload.array('files', 5), draftController.uploadAttachments);
router.delete('/:draftId/attachments/:attachmentId', draftController.deleteAttachment);

// Finalize and submit
router.post('/:draftId/finalize', draftController.finalizeDraft);
router.post('/:draftId/submit', draftController.submitDraft);

module.exports = router;
