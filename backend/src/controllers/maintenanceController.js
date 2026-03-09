const maintenanceService = require('../services/maintenanceService');

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

module.exports = {
    appendSignature,
    getRecord,
    getWorkbench,
    listRevisions,
    listRecords,
    prepareSubmitRecord,
    resubmitRejectedRecord,
    submitRecord,
};