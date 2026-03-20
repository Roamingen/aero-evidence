-- 迁移脚本：拆分 record.approve 为三个细粒度签名权限
-- 适用于已有数据库，全新建库请直接使用 init_auth.sql

-- Step 1: 插入三个新权限
INSERT INTO permissions (code, name, description) VALUES
    ('record.sign.technician', '技术签名', '允许对检修记录执行工程师技术签名'),
    ('record.sign.reviewer',   '审核签名', '允许对检修记录执行审核签名'),
    ('record.sign.release',    '放行签名', '允许对检修记录执行放行签名')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

-- Step 2: engineer_submitter 新增 record.sign.technician
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code = 'record.sign.technician'
WHERE r.code = 'engineer_submitter'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Step 3: engineer_approver 新增 record.sign.reviewer + record.sign.release
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN ('record.sign.reviewer', 'record.sign.release')
WHERE r.code = 'engineer_approver'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Step 4: admin 新增全部三个签名权限
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.code IN ('record.sign.technician', 'record.sign.reviewer', 'record.sign.release')
WHERE r.code = 'admin'
ON DUPLICATE KEY UPDATE role_id = role_id;

-- Step 5: 去掉 specified_signers 表的 sequence_no 字段
ALTER TABLE maintenance_record_specified_signers DROP COLUMN sequence_no;

-- Step 6 (可选): 删除旧的 record.approve 权限及其关联
-- DELETE rp FROM role_permissions rp JOIN permissions p ON rp.permission_id = p.id WHERE p.code = 'record.approve';
-- DELETE FROM permissions WHERE code = 'record.approve';
