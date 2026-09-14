/**
 * Admin Controller
 * AUTHZ-04: Only admins access user management and audit logs.
 * AUD-04: Audit log viewer with search and filter.
 * AUD-05: Admin can unlock locked accounts.
 */
'use strict';

const { query } = require('../config/db');
const auditService = require('../services/audit.service');

// ── List all users ─────────────────────────────────────────────────────────

async function listUsers(req, res) {
    try {
        const result = await query(
            `SELECT id, username, email, role, failed_login_attempts, is_locked, mfa_enabled, created_at
             FROM users
             ORDER BY created_at DESC`
        );
        return res.status(200).json({ users: result.rows });
    } catch (err) {
        console.error('[AdminController.listUsers]', err.message);
        return res.status(500).json({ error: 'Could not retrieve users' });
    }
}

// ── List all patients (for admin claim submission, etc.) ──────────────────
// Returns the patients.id (profile PK), distinct from users.id — this is
// the ID that insurance_claims.patient_id / appointments.patient_id / etc.
// actually reference.

async function listPatients(req, res) {
    try {
        const result = await query(
            `SELECT p.id, p.full_name, u.username, u.email
             FROM patients p
             JOIN users u ON u.id = p.user_id
             ORDER BY p.full_name`
        );
        return res.status(200).json({ patients: result.rows });
    } catch (err) {
        console.error('[AdminController.listPatients]', err.message);
        return res.status(500).json({ error: 'Could not retrieve patients' });
    }
}

// ── Unlock a locked account (AUTH-04) ─────────────────────────────────────

async function unlockUser(req, res) {
    const { id } = req.params;
    const ip = req.ip;

    try {
        const result = await query(
            `UPDATE users
             SET is_locked = FALSE, failed_login_attempts = 0
             WHERE id = $1 RETURNING username`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await auditService.log({
            userId: req.user.id,
            action: 'UNLOCK_USER',
            targetResource: `users/${id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: `Account ${result.rows[0].username} unlocked` });

    } catch (err) {
        console.error('[AdminController.unlockUser]', err.message);
        return res.status(500).json({ error: 'Could not unlock account' });
    }
}

// ── Delete user (admin only) ───────────────────────────────────────────────

async function deleteUser(req, res) {
    const { id } = req.params;
    const ip = req.ip;

    // Prevent admin from deleting themselves
    if (id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    try {
        const result = await query(
            `DELETE FROM users WHERE id = $1 RETURNING username`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await auditService.log({
            userId: req.user.id,
            action: 'DELETE_USER',
            targetResource: `users/${id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: `User deleted` });

    } catch (err) {
        console.error('[AdminController.deleteUser]', err.message);
        return res.status(500).json({ error: 'Could not delete user' });
    }
}

// ── Audit Log Viewer (AUD-04) — searchable, filterable ───────────────────

async function getAuditLogs(req, res) {
    const { userId, action, status, from, to, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
        conditions.push(`al.user_id = $${paramIndex++}`);
        params.push(userId);
    }
    if (action) {
        conditions.push(`al.action ILIKE $${paramIndex++}`);
        params.push(`%${action}%`);
    }
    if (status) {
        conditions.push(`al.status = $${paramIndex++}`);
        params.push(status.toUpperCase());
    }
    if (from) {
        conditions.push(`al.timestamp >= $${paramIndex++}`);
        params.push(from);
    }
    if (to) {
        conditions.push(`al.timestamp <= $${paramIndex++}`);
        params.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Clamp limit to avoid memory exhaustion
    const safeLimit = Math.min(parseInt(limit, 10) || 100, 500);
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

    params.push(safeLimit, safeOffset);

    try {
        const result = await query(
            `SELECT al.id, al.user_id, u.username, al.action, al.target_resource,
                    al.ip_address, al.status, al.error_message, al.timestamp
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             ${whereClause}
             ORDER BY al.timestamp DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        const countResult = await query(
            `SELECT COUNT(*) AS total FROM audit_logs al ${whereClause}`,
            params.slice(0, -2) // exclude limit/offset for count
        );

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_AUDIT_LOGS',
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({
            logs: result.rows,
            total: parseInt(countResult.rows[0].total, 10),
            limit: safeLimit,
            offset: safeOffset,
        });

    } catch (err) {
        console.error('[AdminController.getAuditLogs]', err.message);
        return res.status(500).json({ error: 'Could not retrieve audit logs' });
    }
}

// ── Security Alerts: locked accounts ──────────────────────────────────────

async function getSecurityAlerts(req, res) {
    try {
        const lockedUsers = await query(
            `SELECT id, username, email, failed_login_attempts, updated_at
             FROM users WHERE is_locked = TRUE
             ORDER BY updated_at DESC`
        );

        const recentFailures = await query(
            `SELECT al.user_id, u.username, COUNT(*) AS failure_count, MAX(al.timestamp) AS last_attempt
             FROM audit_logs al
             LEFT JOIN users u ON u.id = al.user_id
             WHERE al.status = 'FAILURE'
               AND al.action = 'LOGIN'
               AND al.timestamp > NOW() - INTERVAL '1 hour'
             GROUP BY al.user_id, u.username
             HAVING COUNT(*) >= 3
             ORDER BY failure_count DESC`
        );

        return res.status(200).json({
            lockedAccounts: lockedUsers.rows,
            suspiciousActivity: recentFailures.rows,
        });

    } catch (err) {
        console.error('[AdminController.getSecurityAlerts]', err.message);
        return res.status(500).json({ error: 'Could not retrieve security alerts' });
    }
}

module.exports = {
    listUsers,
    listPatients,
    unlockUser,
    deleteUser,
    getAuditLogs,
    getSecurityAlerts,
};
