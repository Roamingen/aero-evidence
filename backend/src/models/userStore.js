const { getPool } = require('../config/database');

function normalizeAddress(address) {
    return String(address || '').toLowerCase();
}

function normalizeEmployeeNo(employeeNo) {
    return String(employeeNo || '').trim();
}

function normalizeRoleCode(roleCode) {
    return String(roleCode || '').trim();
}

async function getRoleCodesByUserId(userId) {
    const [rows] = await getPool().execute(
        `SELECT r.code
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ?
         ORDER BY r.code ASC`,
        [userId]
    );

    return rows.map((row) => row.code);
}

async function getPermissionCodesByUserId(userId) {
    const [allowedRows] = await getPool().execute(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
         INNER JOIN permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = ?`,
        [userId]
    );

    const [overrideRows] = await getPool().execute(
        `SELECT p.code, upo.effect
         FROM user_permission_overrides upo
         INNER JOIN permissions p ON p.id = upo.permission_id
         WHERE upo.user_id = ?`,
        [userId]
    );

    const permissions = new Set(allowedRows.map((row) => row.code));
    for (const row of overrideRows) {
        if (row.effect === 'allow') {
            permissions.add(row.code);
        }
        if (row.effect === 'deny') {
            permissions.delete(row.code);
        }
    }

    return Array.from(permissions).sort();
}

async function mapUserRow(row) {
    if (!row) {
        return null;
    }

    const roles = await getRoleCodesByUserId(row.id);
    const permissions = await getPermissionCodesByUserId(row.id);

    return {
        id: row.id,
        employeeNo: row.employee_no,
        address: row.address,
        name: row.name,
        department: row.department,
        status: row.status,
        addressBoundAt: row.address_bound_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at,
        roles,
        permissions,
    };
}

async function findByAddress(address) {
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) {
        return null;
    }

    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE address = ?
         LIMIT 1`,
        [normalizedAddress]
    );

    return mapUserRow(rows[0] || null);
}

async function findByEmployeeNo(employeeNo) {
    const normalizedEmployeeNo = normalizeEmployeeNo(employeeNo);
    if (!normalizedEmployeeNo) {
        return null;
    }

    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE employee_no = ?
         LIMIT 1`,
        [normalizedEmployeeNo]
    );

    return mapUserRow(rows[0] || null);
}

async function getExistingRoleCodes(roleCodes) {
    if (!Array.isArray(roleCodes) || roleCodes.length === 0) {
        return ['engineer_submitter'];
    }

    const normalizedRoleCodes = Array.from(
        new Set(roleCodes.map((code) => String(code || '').trim()).filter(Boolean))
    );

    const placeholders = normalizedRoleCodes.map(() => '?').join(', ');
    const [rows] = await getPool().execute(
        `SELECT code
         FROM roles
         WHERE code IN (${placeholders})`,
        normalizedRoleCodes
    );

    const existingRoleCodes = rows.map((row) => row.code);
    if (existingRoleCodes.length !== normalizedRoleCodes.length) {
        const existingRoleCodeSet = new Set(existingRoleCodes);
        const invalidCodes = normalizedRoleCodes.filter((code) => !existingRoleCodeSet.has(code));
        const error = new Error(`存在无效角色编码: ${invalidCodes.join(', ')}`);
        error.statusCode = 400;
        throw error;
    }

    return existingRoleCodes;
}

async function replaceUserRoles(userId, roleCodes, assignedBy = null) {
    const existingRoleCodes = await getExistingRoleCodes(roleCodes);

    await getPool().execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);

    for (const code of existingRoleCodes) {
        await getPool().execute(
            `INSERT INTO user_roles (user_id, role_id, assigned_by)
             SELECT ?, r.id, ?
             FROM roles r
             WHERE r.code = ?`,
            [userId, assignedBy, code]
        );
    }
}

async function createPendingUser(user) {
    const normalizedEmployeeNo = normalizeEmployeeNo(user.employeeNo);

    const [result] = await getPool().execute(
        `INSERT INTO users (employee_no, address, name, department, status, last_login_at)
         VALUES (?, NULL, ?, ?, ?, ?)`,
        [
            normalizedEmployeeNo,
            user.name,
            user.department || '待分配',
            user.status || 'pending_activation',
            user.lastLoginAt || null,
        ]
    );

    await replaceUserRoles(result.insertId, user.roleCodes, user.assignedBy || null);

    return findByEmployeeNo(normalizedEmployeeNo);
}

async function updatePendingUser(userId, user) {
    await getPool().execute(
        `UPDATE users
         SET name = ?,
             department = ?,
             status = 'pending_activation',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [user.name, user.department || '待分配', userId]
    );

    await replaceUserRoles(userId, user.roleCodes, user.assignedBy || null);

    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return mapUserRow(rows[0] || null);
}

async function bindAddressAndActivate(userId, address) {
    const normalizedAddress = normalizeAddress(address);

    await getPool().execute(
        `UPDATE users
         SET address = ?,
             status = 'active',
             address_bound_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedAddress, userId]
    );

    return findByAddress(normalizedAddress);
}

async function clearUserAddress(userId) {
    await getPool().execute(
        `UPDATE users
         SET address = NULL,
             status = 'pending_activation',
             address_bound_at = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId]
    );

    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return mapUserRow(rows[0] || null);
}

async function updateLastLoginAtByUserId(userId) {
    await getPool().execute(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [userId]
    );

    const [result] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return mapUserRow(result[0] || null);
}

async function listUsers() {
    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         ORDER BY id ASC`
    );

    const users = [];
    for (const row of rows) {
        users.push(await mapUserRow(row));
    }
    return users;
}

async function listRoleCatalog() {
    const [rows] = await getPool().execute(
        `SELECT code, name, description, is_system
         FROM roles
         ORDER BY id ASC`
    );

    return rows.map((row) => ({
        code: row.code,
        name: row.name,
        description: row.description,
        isSystem: Boolean(row.is_system),
    }));
}

async function updateUserAdmin(employeeNo, payload, assignedBy = null) {
    const existingUser = await findByEmployeeNo(employeeNo);
    if (!existingUser) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }

    const nextName = String(payload.name || existingUser.name || '').trim();
    const nextDepartment = String(payload.department || existingUser.department || '待分配').trim();
    const nextStatus = String(payload.status || existingUser.status || '').trim();
    const allowedStatuses = new Set(['pending_activation', 'active', 'disabled', 'revoked']);
    if (!allowedStatuses.has(nextStatus)) {
        const error = new Error(`不支持的用户状态: ${nextStatus}`);
        error.statusCode = 400;
        throw error;
    }

    await getPool().execute(
        `UPDATE users
         SET name = ?,
             department = ?,
             status = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nextName, nextDepartment, nextStatus, existingUser.id]
    );

    if (Array.isArray(payload.roleCodes)) {
        const normalizedRoleCodes = payload.roleCodes.map(normalizeRoleCode).filter(Boolean);
        await replaceUserRoles(existingUser.id, normalizedRoleCodes, assignedBy);
    }

    return findByEmployeeNo(existingUser.employeeNo);
}

async function modifyUserAddress(userId, newAddress) {
    const normalizedAddress = normalizeAddress(newAddress);

    // Check if address is already used by another user
    const [existingRows] = await getPool().execute(
        `SELECT id FROM users WHERE address = ? AND id != ?`,
        [normalizedAddress, userId]
    );

    if (existingRows.length > 0) {
        const error = new Error('该地址已被其他用户使用');
        error.statusCode = 409;
        throw error;
    }

    await getPool().execute(
        `UPDATE users
         SET address = ?,
             address_bound_at = CURRENT_TIMESTAMP,
             status = 'active',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [normalizedAddress, userId]
    );

    const [rows] = await getPool().execute(
        `SELECT id, employee_no, address, name, department, status, address_bound_at, created_at, updated_at, last_login_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId]
    );

    return mapUserRow(rows[0] || null);
}

async function getAllPermissions() {
    const [rows] = await getPool().execute(
        `SELECT id, code, name, description
         FROM permissions
         ORDER BY code ASC`
    );

    return rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
    }));
}

async function getUserPermissionOverrides(userId) {
    const [rows] = await getPool().execute(
        `SELECT upo.id, upo.permission_id, upo.effect, upo.reason, p.code, p.name
         FROM user_permission_overrides upo
         INNER JOIN permissions p ON p.id = upo.permission_id
         WHERE upo.user_id = ?
         ORDER BY p.code ASC`,
        [userId]
    );

    return rows.map((row) => ({
        id: row.id,
        permissionId: row.permission_id,
        permissionCode: row.code,
        permissionName: row.name,
        effect: row.effect,
        reason: row.reason,
    }));
}

async function setUserPermissionOverride(userId, permissionCode, effect, createdBy = null, reason = null) {
    // Get permission id
    const [permRows] = await getPool().execute(
        `SELECT id FROM permissions WHERE code = ?`,
        [permissionCode]
    );

    if (permRows.length === 0) {
        const error = new Error(`权限 ${permissionCode} 不存在`);
        error.statusCode = 404;
        throw error;
    }

    const permissionId = permRows[0].id;

    // Check valid effect
    const allowedEffects = new Set(['allow', 'deny']);
    if (!allowedEffects.has(effect)) {
        const error = new Error(`无效的权限效果: ${effect}`);
        error.statusCode = 400;
        throw error;
    }

    // Insert or update override
    await getPool().execute(
        `INSERT INTO user_permission_overrides (user_id, permission_id, effect, reason, created_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         effect = VALUES(effect),
         reason = VALUES(reason),
         created_by = VALUES(created_by)`,
        [userId, permissionId, effect, reason || null, createdBy || null]
    );
}

async function deleteUserPermissionOverride(userId, permissionCode) {
    // Get permission id
    const [permRows] = await getPool().execute(
        `SELECT id FROM permissions WHERE code = ?`,
        [permissionCode]
    );

    if (permRows.length === 0) {
        const error = new Error(`权限 ${permissionCode} 不存在`);
        error.statusCode = 404;
        throw error;
    }

    const permissionId = permRows[0].id;

    await getPool().execute(
        `DELETE FROM user_permission_overrides
         WHERE user_id = ? AND permission_id = ?`,
        [userId, permissionId]
    );
}

module.exports = {
    findByAddress,
    findByEmployeeNo,
    createPendingUser,
    updatePendingUser,
    bindAddressAndActivate,
    clearUserAddress,
    updateLastLoginAtByUserId,
    listUsers,
    listRoleCatalog,
    updateUserAdmin,
    modifyUserAddress,
    getAllPermissions,
    getUserPermissionOverrides,
    setUserPermissionOverride,
    deleteUserPermissionOverride,
};
