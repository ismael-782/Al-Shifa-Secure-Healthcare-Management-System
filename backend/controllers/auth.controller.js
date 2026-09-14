/**
 * Authentication Controller
 * UC-01: Patient Registration
 * UC-02: Login (all roles) + MFA step (doctors, admins)
 */
'use strict';

const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { bcryptRounds, maxFailedLogins } = require('../config/security');
const encryptionService = require('../services/encryption.service');
const mfaService = require('../services/mfa.service');
const auditService = require('../services/audit.service');
const { generateCsrfToken } = require('../middleware/csrf');

// ── UC-01: Register Patient ────────────────────────────────────────────────

async function register(req, res) {
    const {
        username, email, password,
        fullName, dateOfBirth, contactPhone, contactAddress,
        insuranceProviderName, insurancePolicyNumber,
    } = req.body;

    const ip = req.ip || req.socket?.remoteAddress;

    try {
        // Check username/email uniqueness
        const existing = await query(
            `SELECT id FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
            [username, email]
        );
        if (existing.rows.length > 0) {
            await auditService.log({ action: 'REGISTER', targetResource: username, ipAddress: ip, status: 'FAILURE', errorMessage: 'Duplicate username/email' });
            return res.status(409).json({ error: 'Username or email already in use' });
        }

        // Hash password (AUTH-05)
        const passwordHash = await bcrypt.hash(password, bcryptRounds);

        // Encrypt insurance policy number (CONF-01)
        const encryptedPolicyNumber = insurancePolicyNumber
            ? encryptionService.encrypt(insurancePolicyNumber)
            : null;

        // Insert user and patient in a transaction
        const client = await require('../config/db').getClient();
        try {
            await client.query('BEGIN');

            const userResult = await client.query(
                `INSERT INTO users (username, email, password_hash, role)
                 VALUES ($1, $2, $3, 'patient')
                 RETURNING id`,
                [username, email, passwordHash]
            );
            const userId = userResult.rows[0].id;

            await client.query(
                `INSERT INTO patients
                    (user_id, full_name, date_of_birth, contact_phone, contact_address,
                     insurance_provider_name, insurance_policy_number)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [userId, fullName, dateOfBirth, contactPhone || null,
                 contactAddress || null, insuranceProviderName || null,
                 encryptedPolicyNumber]
            );

            await client.query('COMMIT');

            await auditService.log({ action: 'REGISTER', userId, targetResource: 'users', ipAddress: ip, status: 'SUCCESS' });

            return res.status(201).json({ message: 'Registration successful. Please log in.' });

        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('[AuthController.register]', err.message);
        return res.status(500).json({ error: 'Registration failed' });
    }
}

// ── UC-02: Login (Step 1 — Password) ──────────────────────────────────────

async function login(req, res) {
    const { username, password } = req.body;
    const ip = req.ip || req.socket?.remoteAddress;

    try {
        const result = await query(
            `SELECT id, username, email, password_hash, role, failed_login_attempts, is_locked, mfa_enabled
             FROM users WHERE username = $1 LIMIT 1`,
            [username]
        );

        // Generic error — don't reveal if username exists (AUTH-01)
        if (result.rows.length === 0) {
            await auditService.log({ action: 'LOGIN', targetResource: username, ipAddress: ip, status: 'FAILURE', errorMessage: 'Unknown username' });
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // AUTH-04: check lockout before comparing password
        if (user.is_locked) {
            await auditService.log({ userId: user.id, action: 'LOGIN', ipAddress: ip, status: 'FAILURE', errorMessage: 'Account locked' });
            return res.status(423).json({ error: 'Account is locked. Contact your administrator.' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            const newFailCount = user.failed_login_attempts + 1;
            const shouldLock = newFailCount >= maxFailedLogins;

            await query(
                `UPDATE users SET failed_login_attempts = $1, is_locked = $2 WHERE id = $3`,
                [newFailCount, shouldLock, user.id]
            );

            await auditService.log({ userId: user.id, action: 'LOGIN', ipAddress: ip, status: 'FAILURE', errorMessage: `Failed attempt ${newFailCount}` });

            if (shouldLock) {
                await auditService.alertAdminAccountLocked(username, ip);
                return res.status(423).json({ error: 'Account locked after too many failed attempts. Contact your administrator.' });
            }

            return res.status(400).json({ error: 'Invalid credentials' });
        }

        // Reset failed attempts on successful password match
        await query(
            `UPDATE users SET failed_login_attempts = 0 WHERE id = $1`,
            [user.id]
        );

        // Roles requiring MFA: doctor, admin (AUTH-02)
        const mfaRequired = (user.role === 'doctor' || user.role === 'admin');

        if (mfaRequired) {
            // Partial session — not fully authenticated yet
            req.session.pendingMfaUserId = user.id;
            req.session.pendingMfaRole = user.role;
            req.session.pendingMfaUsername = user.username;

            // Generate and send OTP
            const otp = await mfaService.generateOtp(user.id);
            await mfaService.sendOtpEmail(user.email, otp);

            await auditService.log({ userId: user.id, action: 'LOGIN_PASSWORD_OK_MFA_REQUIRED', ipAddress: ip, status: 'SUCCESS' });

            return res.status(200).json({ mfaRequired: true, message: 'OTP sent to your registered email' });
        }

        // No MFA required (patient, insurance_provider) — create full session
        req.session.userId   = user.id;
        req.session.username = user.username;
        req.session.role     = user.role;
        req.session.mfaComplete = true;
        const csrfToken = generateCsrfToken(req);

        await auditService.log({ userId: user.id, action: 'LOGIN', ipAddress: ip, status: 'SUCCESS' });

        return res.status(200).json({ role: user.role, message: 'Login successful', csrfToken });

    } catch (err) {
        console.error('[AuthController.login]', err.message);
        return res.status(500).json({ error: 'Login failed' });
    }
}

// ── UC-02: MFA Verification (Step 2) ──────────────────────────────────────

async function verifyMfa(req, res) {
    const { otp } = req.body;
    const ip = req.ip || req.socket?.remoteAddress;

    const userId   = req.session.pendingMfaUserId;
    const role     = req.session.pendingMfaRole;
    const username = req.session.pendingMfaUsername;

    if (!userId) {
        return res.status(400).json({ error: 'No pending MFA session' });
    }

    try {
        const valid = await mfaService.verifyOtp(userId, otp);

        if (!valid) {
            await auditService.log({ userId, action: 'MFA_VERIFY', ipAddress: ip, status: 'FAILURE', errorMessage: 'Invalid or expired OTP' });
            return res.status(400).json({ error: 'Invalid or expired OTP' });
        }

        // Elevate session to fully authenticated
        delete req.session.pendingMfaUserId;
        delete req.session.pendingMfaRole;
        delete req.session.pendingMfaUsername;

        req.session.userId      = userId;
        req.session.username    = username;
        req.session.role        = role;
        req.session.mfaComplete = true;
        const csrfToken = generateCsrfToken(req);

        await auditService.log({ userId, action: 'MFA_VERIFY', ipAddress: ip, status: 'SUCCESS' });

        return res.status(200).json({ role, message: 'MFA verified. Login complete.', csrfToken });

    } catch (err) {
        console.error('[AuthController.verifyMfa]', err.message);
        return res.status(500).json({ error: 'MFA verification failed' });
    }
}

// ── Logout ─────────────────────────────────────────────────────────────────

async function logout(req, res) {
    const userId = req.session?.userId;
    const ip = req.ip || req.socket?.remoteAddress;

    req.session.destroy(async (err) => {
        if (err) console.error('[AuthController.logout] session destroy:', err.message);
        // Clear cookie on client side too
        res.clearCookie('asshifa.sid');
        await auditService.log({ userId, action: 'LOGOUT', ipAddress: ip, status: 'SUCCESS' });
        return res.status(200).json({ message: 'Logged out successfully' });
    });
}

// ── Session Status ─────────────────────────────────────────────────────────

async function sessionStatus(req, res) {
    if (!req.session?.userId) {
        return res.status(200).json({ authenticated: false });
    }

    // Sessions predating CSRF protection (or any edge case where a full
    // session exists without a token yet) get one issued on the spot.
    const csrfToken = req.session.csrfToken || generateCsrfToken(req);

    return res.status(200).json({
        authenticated: true,
        role: req.session.role,
        username: req.session.username,
        mfaComplete: req.session.mfaComplete || false,
        csrfToken,
    });
}

module.exports = { register, login, verifyMfa, logout, sessionStatus };
