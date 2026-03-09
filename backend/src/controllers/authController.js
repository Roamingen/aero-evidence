const authService = require('../services/authService');

async function preregisterUser(req, res, next) {
    try {
        const bootstrapKey = req.headers['x-admin-bootstrap-key'];
        const result = await authService.preregisterUser(bootstrapKey, req.body || {});
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

async function issueActivationChallenge(req, res, next) {
    try {
        const result = await authService.issueActivationChallenge(req.body || {});
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function activateUser(req, res, next) {
    try {
        const result = await authService.activateUser(req.body || {});
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function issueNonce(req, res, next) {
    try {
        const result = await authService.issueNonce(req.body.address);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function verifySignature(req, res, next) {
    try {
        const result = await authService.verifySignature(req.body.address, req.body.signature);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function getMe(req, res, next) {
    try {
        const user = await authService.getCurrentUser(req.auth.address);
        res.status(200).json({ user });
    } catch (error) {
        next(error);
    }
}

async function listUsers(req, res, next) {
    try {
        const users = await authService.listUsersForAdmin(req.auth.address, req.query || {});
        res.status(200).json({ users });
    } catch (error) {
        next(error);
    }
}

async function listRoles(req, res, next) {
    try {
        const roles = await authService.listRoleCatalog(req.auth.address);
        res.status(200).json({ roles });
    } catch (error) {
        next(error);
    }
}

async function updateUser(req, res, next) {
    try {
        const user = await authService.updateUserForAdmin(req.auth.address, req.params.employeeNo, req.body || {});
        res.status(200).json({ user });
    } catch (error) {
        next(error);
    }
}

async function listSignerTemplates(req, res, next) {
    try {
        const templates = await authService.listSignerTemplates(req.auth.address);
        res.status(200).json({ templates });
    } catch (error) {
        next(error);
    }
}

async function upsertSignerTemplate(req, res, next) {
    try {
        const template = await authService.upsertSignerTemplate(
            req.auth.address,
            req.params.templateCode,
            req.body || {}
        );
        res.status(200).json({ template });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    preregisterUser,
    issueActivationChallenge,
    activateUser,
    issueNonce,
    verifySignature,
    getMe,
    listUsers,
    listRoles,
    updateUser,
    listSignerTemplates,
    upsertSignerTemplate,
};
