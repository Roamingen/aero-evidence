const { getPool } = require('../src/config/database');

const ROLE_PERMISSION_MATRIX = {
    engineer_submitter: ['record.create', 'record.submit', 'record.view', 'record.sign.technician'],
    engineer_approver: ['record.create', 'record.submit', 'record.view', 'record.verify', 'record.sign.reviewer', 'record.sign.release'],
    admin: ['record.create', 'record.submit', 'record.view', 'record.verify', 'record.sign.technician', 'record.sign.reviewer', 'record.sign.release', 'user.manage', 'role.manage', 'user.preregister'],
};

async function syncRolePermissions() {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
            const [roleRows] = await connection.execute(
                'SELECT id FROM roles WHERE code = ? LIMIT 1',
                [roleCode]
            );

            if (roleRows.length === 0) {
                throw new Error(`角色不存在: ${roleCode}`);
            }

            const roleId = roleRows[0].id;
            await connection.execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

            for (const permissionCode of permissionCodes) {
                const [permissionRows] = await connection.execute(
                    'SELECT id FROM permissions WHERE code = ? LIMIT 1',
                    [permissionCode]
                );

                if (permissionRows.length === 0) {
                    throw new Error(`权限不存在: ${permissionCode}`);
                }

                await connection.execute(
                    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
                    [roleId, permissionRows[0].id]
                );
            }
        }

        await connection.commit();
        console.log('Role permissions synchronized successfully.');
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

syncRolePermissions().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});