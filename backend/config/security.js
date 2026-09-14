/**
 * Security Configuration Constants
 * Centralises all cryptographic and auth parameters.
 * Values loaded from environment — never hardcoded.
 */
'use strict';

require('dotenv').config();

// Validate critical secrets at startup so the server fails fast
// rather than silently running with insecure defaults.
const requiredEnvVars = ['SESSION_SECRET', 'ENCRYPTION_KEY', 'HMAC_SECRET'];
requiredEnvVars.forEach((key) => {
    if (!process.env[key]) {
        throw new Error(`[Security] Missing required environment variable: ${key}`);
    }
});

module.exports = {
    // ── Session (express-session) ─────────────────────────────────
    session: {
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,            // Prevents JS access to cookie (XSS mitigation)
            secure: process.env.NODE_ENV === 'production',  // HTTPS-only in prod (CONF-02)
            sameSite: 'strict',        // CSRF mitigation
            maxAge: parseInt(process.env.SESSION_TIMEOUT_MS, 10) || 900000, // 15 min (CONF-05)
        },
        name: 'asshifa.sid',           // Non-default name hides server technology
    },

    // ── Password Hashing (bcrypt) ─────────────────────────────────
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,  // AUTH-05

    // ── AES-256-CBC Field Encryption ─────────────────────────────
    // Key must be exactly 32 bytes (64 hex chars). (CONF-01)
    encryptionKey: Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),

    // ── HMAC-SHA256 Prescription Signature ───────────────────────
    hmacSecret: process.env.HMAC_SECRET,  // INT-05

    // ── Auth Policy ───────────────────────────────────────────────
    maxFailedLogins: parseInt(process.env.MAX_FAILED_LOGINS, 10) || 5,  // AUTH-04
    mfaOtpExpiryMinutes: parseInt(process.env.MFA_OTP_EXPIRY_MINUTES, 10) || 10,

    // ── Rate Limiting (AVL-03) ────────────────────────────────────
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 10,
    },

    // ── Password Policy Regex (AUTH-03) ──────────────────────────
    // Min 8 chars, uppercase, lowercase, digit, special char
    passwordPolicy: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/,

    // ── Admin Alert ───────────────────────────────────────────────
    adminAlertEmail: process.env.ADMIN_ALERT_EMAIL || 'admin@asshifa.health',
};
