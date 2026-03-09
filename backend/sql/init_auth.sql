-- DEV ONLY: rebuild auth-related schema from scratch.
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS user_permission_overrides;

DROP TABLE IF EXISTS role_permissions;

DROP TABLE IF EXISTS user_roles;

DROP TABLE IF EXISTS login_nonces;

DROP TABLE IF EXISTS auth_challenges;

DROP TABLE IF EXISTS activation_codes;

DROP TABLE IF EXISTS permissions;

DROP TABLE IF EXISTS roles;

DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    employee_no VARCHAR(50) NOT NULL UNIQUE,
    address VARCHAR(42) UNIQUE DEFAULT NULL,
    name VARCHAR(100) NOT NULL,
    department VARCHAR(100) DEFAULT NULL,
    status ENUM(
        'pending_activation',
        'active',
        'disabled',
        'revoked'
    ) NOT NULL DEFAULT 'pending_activation',
    address_bound_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login_at DATETIME DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    is_system BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    assigned_by BIGINT DEFAULT NULL,
    UNIQUE KEY uk_user_roles_user_role (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_role_permissions_role_permission (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles (id),
    CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions (id)
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    effect ENUM('allow', 'deny') NOT NULL,
    reason VARCHAR(255) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by BIGINT DEFAULT NULL,
    UNIQUE KEY uk_user_permission_overrides_user_permission (user_id, permission_id),
    CONSTRAINT fk_user_permission_overrides_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_user_permission_overrides_permission FOREIGN KEY (permission_id) REFERENCES permissions (id),
    CONSTRAINT fk_user_permission_overrides_created_by FOREIGN KEY (created_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS activation_codes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    code_hash CHAR(64) NOT NULL,
    code_last4 CHAR(4) NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME DEFAULT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    delivery_channel ENUM(
        'manual',
        'sms',
        'email',
        'other'
    ) NOT NULL DEFAULT 'manual',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    issued_by BIGINT DEFAULT NULL,
    KEY idx_activation_codes_user_id (user_id),
    KEY idx_activation_codes_expires_at (expires_at),
    CONSTRAINT fk_activation_codes_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_activation_codes_issued_by FOREIGN KEY (issued_by) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS auth_challenges (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT DEFAULT NULL,
    challenge_type ENUM('login', 'activate') NOT NULL,
    address VARCHAR(42) NOT NULL,
    nonce VARCHAR(128) NOT NULL,
    message TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_auth_challenges_address_type (address, challenge_type),
    KEY idx_auth_challenges_expires_at (expires_at),
    CONSTRAINT fk_auth_challenges_user FOREIGN KEY (user_id) REFERENCES users (id)
);

INSERT INTO
    roles (
        code,
        name,
        description,
        is_system
    )
VALUES (
        'engineer_submitter',
        '检修填报工程师',
        '可创建和提交检修记录',
        TRUE
    ),
    (
        'engineer_approver',
        '放行工程师',
        '可执行检修放行和审核操作',
        TRUE
    ),
    (
        'admin',
        '系统管理员',
        '负责用户、角色和系统配置管理',
        TRUE
    )
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description),
    is_system = VALUES(is_system);

INSERT INTO
    permissions (code, name, description)
VALUES (
        'record.create',
        '创建检修记录',
        '允许创建新的检修记录'
    ),
    (
        'record.submit',
        '提交检修记录',
        '允许提交检修记录进入审核流程'
    ),
    (
        'record.view',
        '查看检修记录',
        '允许查看检修记录详情和列表'
    ),
    (
        'record.approve',
        '审核/放行检修记录',
        '允许对检修记录执行审核或放行'
    ),
    (
        'record.verify',
        '校验存证结果',
        '允许执行链上链下一致性校验'
    ),
    (
        'user.manage',
        '管理用户',
        '允许维护用户信息和状态'
    ),
    (
        'role.manage',
        '管理角色权限',
        '允许配置角色和权限映射'
    ),
    (
        'user.preregister',
        '预注册内部用户',
        '允许创建待激活内部用户并下发激活码'
    )
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    description = VALUES(description);

INSERT INTO
    role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
    JOIN permissions p ON p.code IN (
        'record.create', 'record.submit', 'record.view'
    )
WHERE
    r.code = 'engineer_submitter'
ON DUPLICATE KEY UPDATE
    role_id = role_id;

INSERT INTO
    role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
    JOIN permissions p ON p.code IN (
        'record.create', 'record.submit', 'record.view', 'record.verify', 'record.approve'
    )
WHERE
    r.code = 'engineer_approver'
ON DUPLICATE KEY UPDATE
    role_id = role_id;

INSERT INTO
    role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
    JOIN permissions p ON p.code IN (
        'record.create', 'record.submit', 'record.view', 'record.verify', 'record.approve', 'user.manage', 'role.manage', 'user.preregister'
    )
WHERE
    r.code = 'admin'
ON DUPLICATE KEY UPDATE
    role_id = role_id;