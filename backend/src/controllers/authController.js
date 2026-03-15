const authService = require('../services/authService');

async function preregisterUser(req, res, next) {
    try {
        const result = await authService.preregisterUser(req.auth.address, req.body || {});
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

async function listActivationCodes(req, res, next) {
    try {
        const codes = await authService.listActivationCodes(req.auth.address);
        res.status(200).json({ codes });
    } catch (error) {
        next(error);
    }
}

async function regenerateActivationCode(req, res, next) {
    try {
        const result = await authService.regenerateActivationCode(req.auth.address, req.params.employeeNo);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function revokeActivationCode(req, res, next) {
    try {
        const result = await authService.revokeActivationCode(req.auth.address, req.params.employeeNo);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function clearUserAddress(req, res, next) {
    try {
        const result = await authService.clearUserAddress(req.auth.address, req.params.employeeNo);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function resetUserToPending(req, res, next) {
    try {
        const result = await authService.resetUserToPending(req.auth.address, req.params.employeeNo);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function modifyUserAddress(req, res, next) {
    try {
        const result = await authService.modifyUserAddress(req.auth.address, req.params.employeeNo, req.body.address);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function listAllPermissions(req, res, next) {
    try {
        const permissions = await authService.listAllPermissions(req.auth.address);
        res.status(200).json({ permissions });
    } catch (error) {
        next(error);
    }
}

async function getUserPermissions(req, res, next) {
    try {
        const result = await authService.getUserPermissions(req.auth.address, req.params.employeeNo);
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function setUserPermissionOverride(req, res, next) {
    try {
        const result = await authService.setUserPermissionOverride(
            req.auth.address,
            req.params.employeeNo,
            req.body.permissionCode,
            req.body.effect,
            req.body.reason || null
        );
        res.status(200).json(result);
    } catch (error) {
        next(error);
    }
}

async function deleteUserPermissionOverride(req, res, next) {
    try {
        const result = await authService.deleteUserPermissionOverride(
            req.auth.address,
            req.params.employeeNo,
            req.body.permissionCode
        );
        res.status(200).json(result);
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
    listActivationCodes,
    regenerateActivationCode,
    revokeActivationCode,
    clearUserAddress,
    resetUserToPending,
    modifyUserAddress,
    listAllPermissions,
    getUserPermissions,
    setUserPermissionOverride,
    deleteUserPermissionOverride,
};
