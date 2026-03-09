-- Active: 1772877078845@@127.0.0.1@3306@aviation
-- 审阅用户权限用。
-- 用法示例：
-- mysql -h 127.0.0.1 -P 3306 -u root -p123456 -D aviation < backend/sql/review_user_permissions.sql

DROP VIEW IF EXISTS v_user_permission_summary;

DROP VIEW IF EXISTS v_user_effective_permissions;

DROP VIEW IF EXISTS v_user_permission_overrides_detail;

DROP VIEW IF EXISTS v_user_role_permissions;

CREATE VIEW v_user_role_permissions AS
SELECT
    u.id AS user_id,
    u.employee_no,
    u.name AS user_name,
    u.department,
    u.status AS user_status,
    u.address,
    r.code AS role_code,
    r.name AS role_name,
    p.code AS permission_code,
    p.name AS permission_name,
    'role' AS grant_source
FROM
    users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    JOIN role_permissions rp ON rp.role_id = r.id
    JOIN permissions p ON p.id = rp.permission_id;

CREATE VIEW v_user_permission_overrides_detail AS
SELECT
    u.id AS user_id,
    u.employee_no,
    u.name AS user_name,
    u.department,
    u.status AS user_status,
    u.address,
    p.code AS permission_code,
    p.name AS permission_name,
    upo.effect,
    upo.reason,
    upo.created_at,
    upo.created_by
FROM
    users u
    JOIN user_permission_overrides upo ON upo.user_id = u.id
    JOIN permissions p ON p.id = upo.permission_id;

CREATE VIEW v_user_effective_permissions AS
SELECT
    base.user_id,
    base.employee_no,
    base.user_name,
    base.department,
    base.user_status,
    base.address,
    base.permission_code,
    base.permission_name,
    MAX(base.granted_by_role) AS granted_by_role,
    MAX(base.allowed_override) AS allowed_override,
    MAX(base.denied_override) AS denied_override,
    CASE
        WHEN MAX(base.denied_override) = 1 THEN 'deny'
        WHEN MAX(base.granted_by_role) = 1
        OR MAX(base.allowed_override) = 1 THEN 'allow'
        ELSE 'none'
    END AS effective_effect,
    CASE
        WHEN MAX(base.denied_override) = 1 THEN 'override_deny'
        WHEN MAX(base.allowed_override) = 1
        AND MAX(base.granted_by_role) = 1 THEN 'role+override_allow'
        WHEN MAX(base.allowed_override) = 1 THEN 'override_allow'
        WHEN MAX(base.granted_by_role) = 1 THEN 'role'
        ELSE 'none'
    END AS effective_source
FROM (
        SELECT
            u.id AS user_id, u.employee_no, u.name AS user_name, u.department, u.status AS user_status, u.address, p.code AS permission_code, p.name AS permission_name, 1 AS granted_by_role, 0 AS allowed_override, 0 AS denied_override
        FROM
            users u
            JOIN user_roles ur ON ur.user_id = u.id
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
        UNION ALL
        SELECT
            u.id AS user_id, u.employee_no, u.name AS user_name, u.department, u.status AS user_status, u.address, p.code AS permission_code, p.name AS permission_name, 0 AS granted_by_role, CASE
                WHEN upo.effect = 'allow' THEN 1
                ELSE 0
            END AS allowed_override, CASE
                WHEN upo.effect = 'deny' THEN 1
                ELSE 0
            END AS denied_override
        FROM
            users u
            JOIN user_permission_overrides upo ON upo.user_id = u.id
            JOIN permissions p ON p.id = upo.permission_id
    ) AS base
GROUP BY
    base.user_id,
    base.employee_no,
    base.user_name,
    base.department,
    base.user_status,
    base.address,
    base.permission_code,
    base.permission_name;

CREATE VIEW v_user_permission_summary AS
SELECT
    u.id AS user_id,
    u.employee_no,
    u.name AS user_name,
    u.department,
    u.status AS user_status,
    u.address,
    COALESCE(role_agg.role_codes, '') AS role_codes,
    COALESCE(
        permission_agg.allowed_permissions,
        ''
    ) AS allowed_permissions,
    COALESCE(
        permission_agg.denied_permissions,
        ''
    ) AS denied_permissions
FROM
    users u
    LEFT JOIN (
        SELECT ur.user_id, GROUP_CONCAT(
                DISTINCT r.code
                ORDER BY r.code SEPARATOR ', '
            ) AS role_codes
        FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
        GROUP BY
            ur.user_id
    ) AS role_agg ON role_agg.user_id = u.id
    LEFT JOIN (
        SELECT
            ep.user_id,
            GROUP_CONCAT(
                DISTINCT CASE
                    WHEN ep.effective_effect = 'allow' THEN ep.permission_code
                END
                ORDER BY ep.permission_code SEPARATOR ', '
            ) AS allowed_permissions,
            GROUP_CONCAT(
                DISTINCT CASE
                    WHEN ep.effective_effect = 'deny' THEN ep.permission_code
                END
                ORDER BY ep.permission_code SEPARATOR ', '
            ) AS denied_permissions
        FROM v_user_effective_permissions ep
        GROUP BY
            ep.user_id
    ) AS permission_agg ON permission_agg.user_id = u.id;

-- 1) 总览：每个用户当前最终生效的角色和权限
SELECT
    user_id,
    employee_no,
    user_name,
    department,
    user_status,
    address,
    role_codes,
    allowed_permissions,
    denied_permissions
FROM v_user_permission_summary
ORDER BY user_id;

-- 2) 明细：每条权限是来自角色，还是被用户级覆盖允许/拒绝
SELECT
    user_id,
    employee_no,
    user_name,
    permission_code,
    effective_effect,
    effective_source,
    granted_by_role,
    allowed_override,
    denied_override
FROM v_user_effective_permissions
ORDER BY user_id, permission_code;