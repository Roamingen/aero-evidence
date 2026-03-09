const jwt = require('jsonwebtoken');
const env = require('../config/env');

function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
        return res.status(401).json({ message: '缺少 Bearer Token' });
    }

    const token = header.slice('Bearer '.length).trim();
    try {
        const payload = jwt.verify(token, env.jwtSecret);
        req.auth = {
            address: payload.sub,
            roles: payload.roles || [],
            name: payload.name,
            department: payload.department,
            employeeNo: payload.employeeNo,
        };
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Token 无效或已过期' });
    }
}

module.exports = authMiddleware;
