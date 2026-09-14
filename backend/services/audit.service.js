/**
 * Audit Service — Centralized Audit Log Writer
 * Implements AUD-01, AUD-02, AUD-03: log every action with user identity
 * and ISO 8601 timestamp. Logs are written to the audit_logs DB table.
 * Also implements AUD-05: alert admin on repeated failed login attempts.
 */
'use strict';

const { query } = require('../config/db');
const { adminAlertEmail } = require('../config/security');

/**
 * Writes one audit entry to the database.
 * Never throws — audit failure must never break the main request flow.
 *
 * @param {object} entry
 * @param {string|null} entry.userId
 * @param {string}      entry.action         e.g. 'LOGIN', 'VIEW_RECORD'
 * @param {string|null} entry.targetResource e.g. 'medical_records/uuid'
 * @param {string|null} entry.ipAddress
 * @param {string|null} entry.userAgent
 * @param {string|null} entry.requestMethod
 * @param {string|null} entry.requestPath
 * @param {'SUCCESS'|'FAILURE'} entry.status
 * @param {string|null} entry.errorMessage   sanitized; no stack traces
 */
async function log(entry) {
    const {
        userId = null,
        action,
        targetResource = null,
        ipAddress = null,
        userAgent = null,
        requestMethod = null,
        requestPath = null,
        status = 'SUCCESS',
        errorMessage = null,
    } = entry;

    try {
        await query(
            `INSERT INTO audit_logs
                (user_id, action, target_resource, ip_address, user_agent,
                 request_method, request_path, status, error_message)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [userId, action, targetResource, ipAddress, userAgent,
             requestMethod, requestPath, status, errorMessage]
        );
    } catch (err) {
        // Audit write failure is logged to console but never propagated
        console.error('[AuditService] Failed to write audit log:', err.message);
    }
}

/**
 * Sends an admin alert (AUD-05) when an account is locked due to
 * repeated failed login attempts. In production, this should also
 * send an email via nodemailer.
 */
async function alertAdminAccountLocked(username, ipAddress) {
    console.warn(
        `[SECURITY ALERT] Account locked: "${username}" after repeated failed logins from IP: ${ipAddress}`
    );

    // Record the alert itself in audit_logs
    await log({
        action: 'SECURITY_ALERT_ACCOUNT_LOCKED',
        targetResource: `users/${username}`,
        ipAddress,
        status: 'FAILURE',
        errorMessage: `Account locked after 5 consecutive failed login attempts`,
    });

    // ── Email Alert (nodemailer) ──────────────────────────────────
    // Uncomment and configure SMTP env vars to enable email alerts.
    //
    // const nodemailer = require('nodemailer');
    // const transporter = nodemailer.createTransport({
    //     host: process.env.SMTP_HOST,
    //     port: parseInt(process.env.SMTP_PORT, 10),
    //     secure: process.env.SMTP_SECURE === 'true',
    //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    // });
    // await transporter.sendMail({
    //     from: process.env.SMTP_FROM,
    //     to: adminAlertEmail,
    //     subject: '[As-Shifa] Security Alert: Account Locked',
    //     text: `Account "${username}" has been locked after 5 failed login attempts from IP: ${ipAddress}.`,
    // });
}

module.exports = { log, alertAdminAccountLocked };
