const maintenanceService = require('../services/maintenanceService');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { STORAGE_ATTACHMENTS_DIR } = require('../middlewares/uploadMiddleware');

async function prepareSubmitRecord(req, res, next) {
    try {
        const result = await maintenanceService.prepareSubmitRecord(req.auth.address, req.body || {});
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function submitRecord(req, res, next) {
    try {
        const result = await maintenanceService.submitRecord(req.auth.address, req.body || {});
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

async function appendSignature(req, res, next) {
    try {
        const result = await maintenanceService.appendSignature(
            req.auth.address,
            req.params.recordId,
            req.body || {}
        );
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function resubmitRejectedRecord(req, res, next) {
    try {
        const result = await maintenanceService.resubmitRejectedRecord(
            req.auth.address,
            req.params.recordId,
            req.body || {}
        );
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

async function getRecord(req, res, next) {
    try {
        const result = await maintenanceService.getRecord(req.params.recordId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function listRevisions(req, res, next) {
    try {
        const result = await maintenanceService.listRevisions(req.params.recordId);
        res.status(200).json({ revisions: result });
    } catch (error) {
        next(error);
    }
}

async function listRecords(req, res, next) {
    try {
        const result = await maintenanceService.listRecords(req.auth.address, req.query || {});
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function getWorkbench(req, res, next) {
    try {
        const result = await maintenanceService.getWorkbench(req.auth.address);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function previewRecordAttachment(req, res, next) {
    try {
        const attachment = await maintenanceService.getRecordAttachmentForPreview(
            req.params.recordId,
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

async function downloadRecordAttachmentsZip(req, res, next) {
    try {
        const { record, attachments } = await maintenanceService.getRecordAttachmentsForDownload(
            req.params.recordId
        );

        if (!attachments || attachments.length === 0) {
            return res.status(404).json({ message: '该记录没有附件' });
        }

        const zipFileName = `attachments-${record.jobCardNo || record.recordId}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFileName)}"`);

        const archive = archiver('zip', { zlib: { level: 5 } });
        archive.on('error', (err) => {
            console.error('Archiver error:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: '打包失败' });
            }
        });
        archive.pipe(res);

        for (const att of attachments) {
            const fullPath = path.resolve(STORAGE_ATTACHMENTS_DIR, '..', att.storagePath);
            if (fs.existsSync(fullPath)) {
                archive.file(fullPath, { name: att.originalFileName || att.fileName });
            }
        }

        await archive.finalize();
    } catch (error) {
        next(error);
    }
}

module.exports = {
    appendSignature,
    downloadRecordAttachmentsZip,
    getRecord,
    getWorkbench,
    listRevisions,
    listRecords,
    prepareSubmitRecord,
    previewRecordAttachment,
    resubmitRejectedRecord,
    submitRecord,
};