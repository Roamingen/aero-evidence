const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

const env = require('../config/env');
const activationCodeStore = require('../models/activationCodeStore');
const signerTemplateStore = require('../models/signerTemplateStore');
const userStore = require('../models/userStore');
const nonceStore = require('../models/nonceStore');

function normalizeAddress(address) {
    return String(address || '').toLowerCase();
}

function normalizeEmployeeNo(employeeNo) {
    return String(employeeNo || '').trim();
}

function assertAddress(address) {
    if (!ethers.isAddress(address)) {
        const error = new Error('address 格式不合法');
        error.statusCode = 400;
        throw error;
    }
}

function assertRequiredString(value, fieldName, label) {
    if (!String(value || '').trim()) {
        const error = new Error(`${label || fieldName}不能为空`);
        error.statusCode = 400;
        throw error;
    }
}

function assertAdminBootstrapKey(bootstrapKey) {
    if (!bootstrapKey || bootstrapKey !== env.adminBootstrapKey) {
        const error = new Error('管理员引导密钥无效');
        error.statusCode = 403;
        throw error;
    }
}

function buildLoginChallenge(address, nonce, issuedAt) {
    return [
        'Aviation Maintenance Login',
        `Address: ${normalizeAddress(address)}`,
        `Nonce: ${nonce}`,
        `IssuedAt: ${issuedAt}`,
        'Only sign this message to log in.',
    ].join('\n');
}

function buildActivationChallenge(user, address, nonce, issuedAt) {
    return [
        'Aviation Maintenance Account Activation',
        `EmployeeNo: ${user.employeeNo}`,
        `Name: ${user.name}`,
        `Address: ${normalizeAddress(address)}`,
        `Nonce: ${nonce}`,
        `IssuedAt: ${issuedAt}`,
        'Purpose: Bind this wallet address to your internal account.',
        'Only sign if you requested account activation.',
    ].join('\n');
}

function assertUserCanLogin(user) {
    if (user.status === 'pending_activation') {
        const error = new Error('账户尚未激活，请先完成验证码激活');
        error.statusCode = 403;
        throw error;
    }

    if (user.status === 'disabled') {
        const error = new Error('用户已被禁用');
        error.statusCode = 403;
        throw error;
    }

    if (user.status === 'revoked') {
        const error = new Error('用户已被注销');
        error.statusCode = 403;
        throw error;
    }
}

function assertUserHasAnyPermission(user, permissionCodes, message = '权限不足') {
    const normalizedPermissions = Array.isArray(permissionCodes) ? permissionCodes : [permissionCodes];
    const allowed = normalizedPermissions.some((permissionCode) => user.permissions.includes(permissionCode));
    if (!allowed) {
        const error = new Error(message);
        error.statusCode = 403;
        throw error;
    }
}

function buildToken(user) {
    return jwt.sign(
        {
            sub: user.address,
            roles: user.roles,
            name: user.name,
            department: user.department,
            employeeNo: user.employeeNo,
        },
        env.jwtSecret,
        { expiresIn: env.jwtExpiresIn }
    );
}

async function preregisterUser(bootstrapKey, payload) {
    assertAdminBootstrapKey(bootstrapKey);
    assertRequiredString(payload.employeeNo, 'employeeNo', '工号');
    assertRequiredString(payload.name, 'name', '姓名');

    const employeeNo = normalizeEmployeeNo(payload.employeeNo);
    const existingUser = await userStore.findByEmployeeNo(employeeNo);

    let user;
    if (!existingUser) {
        user = await userStore.createPendingUser({
            employeeNo,
            name: String(payload.name).trim(),
            department: String(payload.department || '待分配').trim(),
            roleCodes: payload.roleCodes,
        });
    } else {
        if (existingUser.address || existingUser.status === 'active') {
            const error = new Error('该工号已完成激活，不能重复预注册');
            error.statusCode = 409;
            throw error;
        }

        if (existingUser.status === 'disabled' || existingUser.status === 'revoked') {
            const error = new Error('该工号当前不可重新预注册，请先由管理员调整状态');
            error.statusCode = 409;
            throw error;
        }

        user = await userStore.updatePendingUser(existingUser.id, {
            name: String(payload.name).trim(),
            department: String(payload.department || '待分配').trim(),
            roleCodes: payload.roleCodes,
        });
    }

    const expiresAt = new Date(Date.now() + env.activationCodeTtlMinutes * 60 * 1000).toISOString();
    const activationCode = await activationCodeStore.issueCode(user.id, {
        expiresAt,
        deliveryChannel: payload.deliveryChannel || 'manual',
    });

    return {
        user: {
            id: user.id,
            employeeNo: user.employeeNo,
            name: user.name,
            department: user.department,
            status: user.status,
            roles: user.roles,
            permissions: user.permissions,
        },
        activationCode: activationCode.code,
        activationCodeLast4: activationCode.codeLast4,
        activationCodeExpiresAt: activationCode.expiresAt,
    };
}

async function issueActivationChallenge(payload) {
    assertRequiredString(payload.employeeNo, 'employeeNo', '工号');
    assertRequiredString(payload.activationCode, 'activationCode', '激活码');
    assertAddress(payload.address);

    const employeeNo = normalizeEmployeeNo(payload.employeeNo);
    const normalizedAddress = normalizeAddress(payload.address);
    const user = await userStore.findByEmployeeNo(employeeNo);

    if (!user) {
        const error = new Error('用户不存在，请联系管理员预注册');
        error.statusCode = 404;
        throw error;
    }

    if (user.status !== 'pending_activation') {
        const error = new Error('当前账户不处于待激活状态');
        error.statusCode = 409;
        throw error;
    }

    if (user.address && user.address !== normalizedAddress) {
        const error = new Error('该账户已绑定其他地址，请联系管理员处理');
        error.statusCode = 409;
        throw error;
    }

    const existingAddressUser = await userStore.findByAddress(normalizedAddress);
    if (existingAddressUser && existingAddressUser.employeeNo !== user.employeeNo) {
        const error = new Error('该区块链地址已被其他账户绑定');
        error.statusCode = 409;
        throw error;
    }

    const activationCodeRecord = await activationCodeStore.getLatestActiveCodeByUserId(user.id);
    if (!activationCodeRecord) {
        const error = new Error('未找到有效激活码，请联系管理员重新发放');
        error.statusCode = 404;
        throw error;
    }

    if (new Date(activationCodeRecord.expiresAt).getTime() < Date.now()) {
        const error = new Error('激活码已过期，请联系管理员重新发放');
        error.statusCode = 410;
        throw error;
    }

    if (activationCodeRecord.attemptCount >= activationCodeRecord.maxAttempts) {
        const error = new Error('激活码已锁定，请联系管理员重新发放');
        error.statusCode = 423;
        throw error;
    }

    const providedCodeHash = activationCodeStore.hashCode(payload.activationCode);
    if (providedCodeHash !== activationCodeRecord.codeHash) {
        await activationCodeStore.incrementAttempt(activationCodeRecord.id);
        const error = new Error('激活码错误');
        error.statusCode = 401;
        throw error;
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + env.nonceTtlMs).toISOString();
    const message = buildActivationChallenge(user, normalizedAddress, nonce, issuedAt);

    await nonceStore.saveChallenge({
        userId: user.id,
        challengeType: 'activate',
        address: normalizedAddress,
        nonce,
        message,
        expiresAt,
    });

    return {
        employeeNo: user.employeeNo,
        address: normalizedAddress,
        message,
        expiresAt,
    };
}

async function activateUser(payload) {
    assertRequiredString(payload.employeeNo, 'employeeNo', '工号');
    assertAddress(payload.address);

    if (!payload.signature) {
        const error = new Error('signature 不能为空');
        error.statusCode = 400;
        throw error;
    }

    const employeeNo = normalizeEmployeeNo(payload.employeeNo);
    const normalizedAddress = normalizeAddress(payload.address);
    const user = await userStore.findByEmployeeNo(employeeNo);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }

    if (user.status !== 'pending_activation') {
        const error = new Error('当前账户不处于待激活状态');
        error.statusCode = 409;
        throw error;
    }

    const challenge = await nonceStore.getChallenge(normalizedAddress, 'activate');
    if (!challenge || challenge.userId !== user.id) {
        const error = new Error('未找到有效激活挑战，请重新发起激活');
        error.statusCode = 404;
        throw error;
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        await nonceStore.consumeChallenge(challenge.id);
        const error = new Error('激活挑战已过期，请重新发起激活');
        error.statusCode = 401;
        throw error;
    }

    const activationCodeRecord = await activationCodeStore.getLatestActiveCodeByUserId(user.id);
    if (!activationCodeRecord || new Date(activationCodeRecord.expiresAt).getTime() < Date.now()) {
        const error = new Error('激活码已失效，请联系管理员重新发放');
        error.statusCode = 410;
        throw error;
    }

    const recoveredAddress = normalizeAddress(ethers.verifyMessage(challenge.message, payload.signature));
    if (recoveredAddress !== normalizedAddress) {
        const error = new Error('签名验证失败');
        error.statusCode = 401;
        throw error;
    }

    const existingAddressUser = await userStore.findByAddress(normalizedAddress);
    if (existingAddressUser && existingAddressUser.employeeNo !== user.employeeNo) {
        const error = new Error('该区块链地址已被其他账户绑定');
        error.statusCode = 409;
        throw error;
    }

    await userStore.bindAddressAndActivate(user.id, normalizedAddress);
    await nonceStore.consumeChallenge(challenge.id);
    await activationCodeStore.consumeCode(activationCodeRecord.id);
    const activatedUser = await userStore.updateLastLoginAtByUserId(user.id);

    return {
        token: buildToken(activatedUser),
        user: {
            employeeNo: activatedUser.employeeNo,
            address: activatedUser.address,
            name: activatedUser.name,
            roles: activatedUser.roles,
            permissions: activatedUser.permissions,
            department: activatedUser.department,
            status: activatedUser.status,
            lastLoginAt: activatedUser.lastLoginAt,
        },
    };
}

async function issueNonce(address) {
    assertAddress(address);

    const normalizedAddress = normalizeAddress(address);
    const user = await userStore.findByAddress(normalizedAddress);
    if (!user) {
        const error = new Error('用户不存在，请先由管理员预注册并完成激活');
        error.statusCode = 404;
        throw error;
    }

    assertUserCanLogin(user);
    if (!user.address) {
        const error = new Error('当前账户尚未绑定地址，请先完成激活');
        error.statusCode = 403;
        throw error;
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    const issuedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + env.nonceTtlMs).toISOString();
    const message = buildLoginChallenge(normalizedAddress, nonce, issuedAt);

    await nonceStore.saveChallenge({
        userId: user.id,
        challengeType: 'login',
        address: normalizedAddress,
        nonce,
        message,
        expiresAt,
    });

    return {
        employeeNo: user.employeeNo,
        address: normalizedAddress,
        nonce,
        message,
        expiresAt,
        user: {
            address: user.address,
            name: user.name,
            roles: user.roles,
            permissions: user.permissions,
            department: user.department,
        },
    };
}

async function verifySignature(address, signature) {
    assertAddress(address);
    if (!signature) {
        const error = new Error('signature 不能为空');
        error.statusCode = 400;
        throw error;
    }

    const normalizedAddress = normalizeAddress(address);
    const challenge = await nonceStore.getChallenge(normalizedAddress, 'login');
    if (!challenge) {
        const error = new Error('未找到有效 nonce，请重新获取挑战');
        error.statusCode = 404;
        throw error;
    }

    if (new Date(challenge.expiresAt).getTime() < Date.now()) {
        await nonceStore.consumeChallenge(challenge.id);
        const error = new Error('nonce 已过期，请重新获取挑战');
        error.statusCode = 401;
        throw error;
    }

    const recoveredAddress = normalizeAddress(ethers.verifyMessage(challenge.message, signature));
    if (recoveredAddress !== normalizedAddress) {
        const error = new Error('签名验证失败');
        error.statusCode = 401;
        throw error;
    }

    const user = await userStore.findByAddress(normalizedAddress);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }

    assertUserCanLogin(user);

    await nonceStore.consumeChallenge(challenge.id);
    const updatedUser = await userStore.updateLastLoginAtByUserId(user.id);

    return {
        token: buildToken(updatedUser),
        user: {
            employeeNo: updatedUser.employeeNo,
            address: updatedUser.address,
            name: updatedUser.name,
            roles: updatedUser.roles,
            permissions: updatedUser.permissions,
            department: updatedUser.department,
            status: updatedUser.status,
            lastLoginAt: updatedUser.lastLoginAt,
        },
    };
}

async function getCurrentUser(address) {
    const user = await userStore.findByAddress(address);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }
    return user;
}

async function listUsersForAdmin(address, query = {}) {
    const currentUser = await getCurrentUser(address);
    assertUserHasAnyPermission(currentUser, 'user.manage', '当前用户无权查看人员列表');

    const users = await userStore.listUsers();
    const status = String(query.status || '').trim();
    const keyword = String(query.keyword || '').trim().toLowerCase();

    return users.filter((user) => {
        if (status && user.status !== status) {
            return false;
        }
        if (!keyword) {
            return true;
        }

        return [user.employeeNo, user.name, user.department, ...(user.roles || [])]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword));
    });
}

async function listRoleCatalog(address) {
    const currentUser = await getCurrentUser(address);
    assertUserHasAnyPermission(currentUser, ['user.manage', 'role.manage'], '当前用户无权查看角色目录');
    return userStore.listRoleCatalog();
}

async function updateUserForAdmin(address, employeeNo, payload = {}) {
    const currentUser = await getCurrentUser(address);
    assertUserHasAnyPermission(currentUser, 'user.manage', '当前用户无权维护用户信息');
    return userStore.updateUserAdmin(employeeNo, payload, currentUser.id);
}

async function listSignerTemplates(address) {
    const currentUser = await getCurrentUser(address);
    assertUserHasAnyPermission(currentUser, ['user.manage', 'role.manage'], '当前用户无权查看签名模板');
    return signerTemplateStore.listTemplates();
}

async function upsertSignerTemplate(address, templateCode, payload = {}) {
    const currentUser = await getCurrentUser(address);
    assertUserHasAnyPermission(currentUser, 'role.manage', '当前用户无权维护签名模板');

    const normalizedTemplateCode = String(templateCode || payload.templateCode || '').trim();
    if (!normalizedTemplateCode) {
        const error = new Error('templateCode 不能为空');
        error.statusCode = 400;
        throw error;
    }

    const templateName = String(payload.templateName || '').trim();
    if (!templateName) {
        const error = new Error('templateName 不能为空');
        error.statusCode = 400;
        throw error;
    }

    if (!Array.isArray(payload.defaultSigners)) {
        const error = new Error('defaultSigners 必须是数组');
        error.statusCode = 400;
        throw error;
    }

    return signerTemplateStore.upsertTemplate(
        {
            templateCode: normalizedTemplateCode,
            templateName,
            workType: payload.workType || null,
            ataCode: payload.ataCode || null,
            aircraftType: payload.aircraftType || null,
            defaultSigners: payload.defaultSigners,
            isActive: payload.isActive == null ? true : Boolean(payload.isActive),
        },
        currentUser.id
    );
}

module.exports = {
    preregisterUser,
    issueActivationChallenge,
    activateUser,
    issueNonce,
    verifySignature,
    getCurrentUser,
    listUsersForAdmin,
    listRoleCatalog,
    updateUserForAdmin,
    listSignerTemplates,
    upsertSignerTemplate,
};
