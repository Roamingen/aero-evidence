const draftService = require('../services/draftService');

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
    finalizeDraft,
    submitDraft,
};
