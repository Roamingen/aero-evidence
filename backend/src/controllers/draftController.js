const draftService = require('../services/draftService');
const fs = require('fs');
const path = require('path');
const { STORAGE_ATTACHMENTS_DIR } = require('../middlewares/uploadMiddleware');

async function createDraft(req, res, next) {
    try {
        const body = req.body || {};
        const result = await draftService.createDraft(req.auth.address, body);
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

async function listDrafts(req, res, next) {
    try {
        const drafts = await draftService.listDrafts(req.auth.address);
        res.status(200).json({ drafts });
    } catch (error) {
        next(error);
    }
}

async function getDraft(req, res, next) {
    try {
        const result = await draftService.getDraft(req.auth.address, req.params.draftId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function saveDraft(req, res, next) {
    try {
        const result = await draftService.saveDraft(req.auth.address, req.params.draftId, req.body || {});
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function deleteDraft(req, res, next) {
    try {
        await draftService.deleteDraft(req.auth.address, req.params.draftId);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
}

async function uploadAttachments(req, res, next) {
    try {
        const result = await draftService.uploadAttachments(req.auth.address, req.params.draftId, req.files || []);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function deleteAttachment(req, res, next) {
    try {
        await draftService.deleteAttachment(req.auth.address, req.params.draftId, req.params.attachmentId);
        res.status(204).end();
    } catch (error) {
        next(error);
    }
}

async function previewAttachment(req, res, next) {
    try {
        const attachment = await draftService.getAttachmentForPreview(
            req.auth.address,
            req.params.draftId,
            req.params.attachmentId
        );

        if (!attachment) {
            return res.status(404).json({ message: '附件不存在' });
        }

        const fullPath = path.resolve(STORAGE_ATTACHMENTS_DIR, '..', attachment.storagePath);

        // 检查文件是否存在
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ message: '文件不存在' });
        }

        // 设置响应头
        res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalFileName || 'download')}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        // 流式发送文件
        const fileStream = fs.createReadStream(fullPath);
        fileStream.pipe(res);
        fileStream.on('error', (err) => {
            console.error('File stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '读取文件失败' });
            }
        });
    } catch (error) {
        next(error);
    }
}

async function finalizeDraft(req, res, next) {
    try {
        const result = await draftService.finalizeDraft(req.auth.address, req.params.draftId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function submitDraft(req, res, next) {
    try {
        const result = await draftService.submitDraft(req.auth.address, req.params.draftId, req.body || {});
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    createDraft,
    listDrafts,
    getDraft,
    saveDraft,
    deleteDraft,
    uploadAttachments,
    deleteAttachment,
    previewAttachment,
    finalizeDraft,
    submitDraft,
};
