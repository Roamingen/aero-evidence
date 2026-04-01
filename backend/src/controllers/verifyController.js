const verifyService = require('../services/verifyService');

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

module.exports = { verifyRecord, tamperRecord, restoreTamper };
