/**
 * Audit Logger Middleware
 * AUD-01: Logs every incoming request automatically.
 * AUD-02: Records user identity from session.
 * AUD-03: Timestamp is set by the DB (NOW()) to guarantee server-authoritative time.
 *
 * This middleware runs AFTER the route handler via res.on('finish') so
 * it has access to the final response status code.
 */
'use strict';

const auditService = require('../services/audit.service');

// Actions that always get logged (beyond the automatic request log)
const AUDITED_ACTIONS = {
    'POST /api/v1/auth/login':    'LOGIN',
    'POST /api/v1/auth/logout':   'LOGOUT',
    'POST /api/v1/auth/register': 'REGISTER',
    'POST /api/v1/auth/mfa':      'MFA_VERIFY',
};

/**
 * Middleware that attaches a post-response audit hook.
 * All requests are logged; the action name is inferred from method + path.
 */
function requestAuditLogger(req, res, next) {
    const startTime = Date.now();

    res.on('finish', async () => {
        const userId = req.session?.userId || null;
        const actionKey = `${req.method} ${req.route?.path || req.path}`;
        const action = AUDITED_ACTIONS[actionKey] || `${req.method}:${req.path}`;
        const status = res.statusCode < 400 ? 'SUCCESS' : 'FAILURE';

        await auditService.log({
            userId,
            action,
            targetResource: req.originalUrl,
            ipAddress: req.ip || req.socket?.remoteAddress,
            userAgent: req.headers['user-agent'] || null,
            requestMethod: req.method,
            requestPath: req.originalUrl,
            status,
            errorMessage: status === 'FAILURE' ? `HTTP ${res.statusCode}` : null,
        });
    });

    next();
}

module.exports = { requestAuditLogger };
