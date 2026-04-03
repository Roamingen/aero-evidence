const verifyService = require('../services/verifyService');
const { generateVerifyPdf } = require('../services/pdfService');

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || 'http://127.0.0.1:5173';

async function verifyRecord(req, res, next) {
    try {
        const result = await verifyService.verifyRecord(req.params.recordId);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function tamperRecord(req, res, next) {
    try {
        const result = await verifyService.tamperRecord(req.params.recordId, req.auth.address);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function restoreTamper(req, res, next) {
    try {
        const result = await verifyService.restoreTamper(req.params.recordId, req.auth.address);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function exportPdf(req, res, next) {
    try {
        const result = await verifyService.verifyRecord(req.params.recordId);
        if (!result.found) {
            return res.status(404).json({ message: result.message || '记录不存在' });
        }
        const verifyUrl = `${FRONTEND_BASE_URL}/verify?recordId=${req.params.recordId}`;
        const pdfBuf = await generateVerifyPdf(result, verifyUrl);
        const filename = `maintenance-report-${req.params.recordId.slice(0, 10)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuf);
    } catch (error) {
        next(error);
    }
}

module.exports = { verifyRecord, tamperRecord, restoreTamper, exportPdf };
