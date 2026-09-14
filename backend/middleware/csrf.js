/**
 * CSRF Protection — synchronizer token pattern.
 *
 * SameSite=Strict on the session cookie (config/security.js) already blocks
 * the vast majority of cross-site request forgery, but it's not foolproof
 * (some browsers/situations still send same-site cookies on top-level GET
 * navigations, and defense-in-depth is cheap here), so state-changing
 * requests also require an explicit token.
 *
 * How it works:
 *  1. When a session is established (login success, MFA verified), the
 *     server generates a random token and stores it server-side on
 *     req.session.csrfToken. It's also returned in that response's JSON
 *     body (and by GET /auth/status) so the frontend JS can read it —
 *     it is NOT put in a cookie, so a cross-site form/script has no way
 *     to obtain it.
 *  2. The frontend sends it back on every mutating request as the
 *     `X-CSRF-Token` header (see frontend/js/utils.js apiFetch()).
 *  3. This middleware rejects any authenticated, state-changing request
 *     whose header doesn't match the session's token.
 */
'use strict';

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function generateCsrfToken(req) {
    const token = crypto.randomBytes(32).toString('hex');
    req.session.csrfToken = token;
    return token;
}

/**
 * Enforce the token on state-changing requests for any session that has
 * one issued (i.e. anyone past login). Requests without an established
 * session yet (e.g. the login/register call itself) are left to their own
 * auth checks — there's no session to forge a request against.
 */
function requireCsrfToken(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    if (!req.session || !req.session.csrfToken) return next(); // no session yet — nothing to protect

    const headerToken = req.get('X-CSRF-Token');

    if (!headerToken || headerToken !== req.session.csrfToken) {
        return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }

    next();
}

module.exports = { generateCsrfToken, requireCsrfToken };
