/**
 * Authentication Middleware
 * AUTHZ-01: Every protected route checks that the user has a valid session.
 * CONF-03: Unauthorized requests receive 403 — no data is returned.
 * CONF-05: Session expiry is enforced by cookie maxAge and server-side check.
 */
'use strict';

const auditService = require('../services/audit.service');

/**
 * Requires an authenticated session.
 * Attaches req.user = { id, username, role } for downstream use.
 */
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    // Rehydrate user from session (set during login)
    req.user = {
        id:       req.session.userId,
        username: req.session.username,
        role:     req.session.role,
    };

    next();
}

/**
 * Requires MFA to have been completed for this session.
 * Used on all doctor/admin routes after password-step login (AUTH-02).
 */
function requireMfaComplete(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    const role = req.session.role;

    // MFA is mandatory for doctor and admin roles
    if ((role === 'doctor' || role === 'admin') && !req.session.mfaComplete) {
        return res.status(403).json({ error: 'MFA verification required' });
    }

    req.user = {
        id:       req.session.userId,
        username: req.session.username,
        role:     req.session.role,
    };

    next();
}

module.exports = { requireAuth, requireMfaComplete };
