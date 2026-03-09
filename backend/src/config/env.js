const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

module.exports = {
    port: Number(process.env.PORT || '3000'),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    nonceTtlMs: Number(process.env.NONCE_TTL_MS || '300000'),
    allowDevAutoRegister: process.env.ALLOW_DEV_AUTO_REGISTER === 'true',
    adminBootstrapKey: process.env.ADMIN_BOOTSTRAP_KEY || 'change-this-bootstrap-key',
    activationCodeTtlMinutes: Number(process.env.ACTIVATION_CODE_TTL_MINUTES || '60'),
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || '3306'),
        name: process.env.DB_NAME || 'aviation_maintenance',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || '10'),
    },
};
