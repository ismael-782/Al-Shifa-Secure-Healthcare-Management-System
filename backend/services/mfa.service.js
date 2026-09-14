/**
 * MFA Service — Email OTP Generation and Verification
 * Implements AUTH-02: doctors and admins must complete MFA after password login.
 *
 * OTP is a 6-digit cryptographically random number.
 * The token is bcrypt-hashed before storage (same principle as passwords).
 * Tokens are single-use and have a short TTL (default 10 minutes).
 */
'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { bcryptRounds, mfaOtpExpiryMinutes } = require('../config/security');

/**
 * Generates a 6-digit OTP, hashes it, stores in mfa_tokens, and
 * returns the plaintext OTP (to be emailed to the user).
 *
 * @param {string} userId
 * @returns {string} 6-digit OTP plaintext
 */
async function generateOtp(userId) {
    // Invalidate any unused existing tokens for this user first
    await query(
        `UPDATE mfa_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE`,
        [userId]
    );

    // Generate cryptographically secure 6-digit OTP
    const otp = String(crypto.randomInt(100000, 999999));

    const tokenHash = await bcrypt.hash(otp, bcryptRounds);
    const expiresAt = new Date(Date.now() + mfaOtpExpiryMinutes * 60 * 1000);

    await query(
        `INSERT INTO mfa_tokens (user_id, token_hash, expires_at, used)
         VALUES ($1, $2, $3, FALSE)`,
        [userId, tokenHash, expiresAt]
    );

    return otp; // Caller must email this to the user; never log it
}

/**
 * Verifies the submitted OTP against the stored hash.
 * Marks the token as used on success (single-use enforcement).
 *
 * @param {string} userId
 * @param {string} otp plaintext OTP from user input
 * @returns {boolean} true if valid
 */
async function verifyOtp(userId, otp) {
    const result = await query(
        `SELECT id, token_hash, expires_at
         FROM mfa_tokens
         WHERE user_id = $1
           AND used = FALSE
           AND expires_at > NOW()
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
    );

    if (result.rows.length === 0) return false;

    const { id: tokenId, token_hash: tokenHash } = result.rows[0];

    const isValid = await bcrypt.compare(otp, tokenHash);

    if (isValid) {
        // Mark as used immediately to prevent replay
        await query(`UPDATE mfa_tokens SET used = TRUE WHERE id = $1`, [tokenId]);
    }

    return isValid;
}

/**
 * Sends the OTP to the user's email via nodemailer.
 * Configure SMTP env vars to activate.
 */
async function sendOtpEmail(email, otp) {
    if (process.env.NODE_ENV !== 'production') {
        // Outside production (dev, test, ...) print the OTP instead of
        // sending real email — no SMTP required, and it means the test
        // suite can never accidentally attempt a real network send.
        console.log(`[MFA DEV] OTP for ${email}: ${otp}`);
        return;
    }

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: 'As-Shifa — Your Login Verification Code',
        text: `Your one-time verification code is: ${otp}\n\nThis code expires in ${mfaOtpExpiryMinutes} minutes. Do not share it with anyone.`,
        html: `
            <div style="font-family:sans-serif;max-width:480px">
                <h2 style="color:#1a4d6d">As-Shifa Healthcare</h2>
                <p>Your one-time verification code:</p>
                <h1 style="letter-spacing:8px;color:#1a4d6d">${otp}</h1>
                <p>This code expires in <strong>${mfaOtpExpiryMinutes} minutes</strong>.</p>
                <p style="color:#888;font-size:12px">If you did not attempt to log in, please contact your administrator immediately.</p>
            </div>
        `,
    });
}

module.exports = { generateOtp, verifyOtp, sendOtpEmail };
