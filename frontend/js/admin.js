/**
 * Admin Dashboard JS
 * - User management (list, unlock, delete)
 * - Audit log viewer (searchable/filterable) — AUD-04
 * - Security alerts panel — AUD-05
 * - System health status — AVL-05
 */
'use strict';

async function initAdminDashboard() {
    const user = await checkAuthAndRedirect('admin');
    if (!user) return;

    document.querySelectorAll('.user-greeting').forEach((el) => {
        el.textContent = user.username;
    });

    initInactivityTimer();
    showSection('section-overview');
    await loadAdminStats();
}

// ── Stats Overview ────────────────────────────────────────────────────────

async function loadAdminStats() {
    const [usersRes, alertsRes] = await Promise.all([
        apiFetch('/api/v1/admin/users'),
        apiFetch('/api/v1/admin/security-alerts'),
    ]);

    if (usersRes?.ok) {
        const users = usersRes.data.users;
        setText('stat-total-users', users.length);
        setText('stat-locked', users.filter((u) => u.is_locked).length);
        setText('stat-patients', users.filter((u) => u.role === 'patient').length);
        setText('stat-doctors', users.filter((u) => u.role === 'doctor').length);
    }

    if (alertsRes?.ok) {
        setText('stat-alerts', alertsRes.data.lockedAccounts.length);
    }
}

// ── User Management ───────────────────────────────────────────────────────

async function loadUsers() {
    const container = document.getElementById('users-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:20px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch('/api/v1/admin/users');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load users.</p>';
        return;
    }

    const users = res.data.users;
    const roleBadge = {
        admin:              'badge-danger',
        doctor:             'badge-info',
        patient:            'badge-success',
        insurance_provider: 'badge-warning',
    };

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead>
            <tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Failed Logins</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>
        ${users.map((u) => `
            <tr>
                <td><strong>${escapeHtml(u.username)}</strong></td>
                <td>${escapeHtml(u.email)}</td>
                <td><span class="badge ${roleBadge[u.role] || 'badge-neutral'}">${u.role}</span></td>
                <td>
                    ${u.is_locked
                        ? '<span class="badge badge-danger">🔒 Locked</span>'
                        : '<span class="badge badge-success">✓ Active</span>'}
                </td>
                <td style="text-align:center">${u.failed_login_attempts}</td>
                <td>${formatDate(u.created_at)}</td>
                <td>
                    ${u.is_locked ? `<button class="btn btn-sm btn-success" onclick="unlockUser('${u.id}')">Unlock</button>` : ''}
                    <button class="btn btn-sm btn-danger" onclick="deleteUser('${u.id}', '${escapeHtml(u.username)}')">Delete</button>
                </td>
            </tr>`).join('')}
        </tbody></table></div>`;
}

async function unlockUser(id) {
    const res = await apiFetch(`/api/v1/admin/users/${id}/unlock`, { method: 'PUT' });
    if (res?.ok) {
        showToast(res.data.message, 'success');
        await loadUsers();
    } else {
        showToast(res?.data?.error || 'Could not unlock.', 'error');
    }
}

async function deleteUser(id, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;

    const res = await apiFetch(`/api/v1/admin/users/${id}`, { method: 'DELETE' });
    if (res?.ok) {
        showToast('User deleted.', 'success');
        await loadUsers();
    } else {
        showToast(res?.data?.error || 'Could not delete user.', 'error');
    }
}

// ── Audit Log Viewer (AUD-04) ─────────────────────────────────────────────

async function loadAuditLogs(page = 0) {
    const container = document.getElementById('audit-list');
    if (!container) return;

    // Read filter values
    const userId = document.getElementById('filter-user')?.value?.trim() || '';
    const action = document.getElementById('filter-action')?.value?.trim() || '';
    const status = document.getElementById('filter-status')?.value || '';
    const from   = document.getElementById('filter-from')?.value || '';
    const to     = document.getElementById('filter-to')?.value || '';
    const limit  = 50;
    const offset = page * limit;

    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (action) params.set('action', action);
    if (status) params.set('status', status);
    if (from)   params.set('from', from);
    if (to)     params.set('to', to);
    params.set('limit', limit);
    params.set('offset', offset);

    container.innerHTML = '<div style="text-align:center;padding:20px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch(`/api/v1/admin/audit-logs?${params.toString()}`);
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load audit logs.</p>';
        return;
    }

    const { logs, total } = res.data;

    if (logs.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📑</div><h3>No logs found</h3></div>`;
        return;
    }

    const statusColor = { SUCCESS: 'badge-success', FAILURE: 'badge-danger' };

    container.innerHTML = `
        <p class="text-muted" style="margin-bottom:12px">Showing ${offset + 1}–${Math.min(offset + logs.length, total)} of ${total} entries</p>
        <div class="table-wrapper">
        <table>
        <thead>
            <tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>IP</th><th>Status</th></tr>
        </thead>
        <tbody>
        ${logs.map((l) => `
            <tr>
                <td style="white-space:nowrap;font-size:.8rem">${formatDateTime(l.timestamp)}</td>
                <td>${escapeHtml(l.username || 'system')}</td>
                <td><code style="font-size:.8rem">${escapeHtml(l.action)}</code></td>
                <td style="font-size:.8rem;max-width:200px;overflow:hidden;text-overflow:ellipsis">${escapeHtml(l.target_resource || '—')}</td>
                <td style="font-size:.8rem">${escapeHtml(l.ip_address || '—')}</td>
                <td><span class="badge ${statusColor[l.status] || 'badge-neutral'}">${l.status}</span></td>
            </tr>`).join('')}
        </tbody></table></div>
        <div class="flex gap-2 mt-2">
            ${page > 0 ? `<button class="btn btn-ghost btn-sm" onclick="loadAuditLogs(${page - 1})">← Previous</button>` : ''}
            ${offset + logs.length < total ? `<button class="btn btn-ghost btn-sm" onclick="loadAuditLogs(${page + 1})">Next →</button>` : ''}
        </div>`;
}

// ── Security Alerts (AUD-05) ──────────────────────────────────────────────

async function loadSecurityAlerts() {
    const container = document.getElementById('alerts-container');
    if (!container) return;

    const res = await apiFetch('/api/v1/admin/security-alerts');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load security alerts.</p>';
        return;
    }

    const { lockedAccounts, suspiciousActivity } = res.data;

    container.innerHTML = `
        <div class="card mb-2" style="border-left:4px solid #e74c3c">
            <h3>🔒 Locked Accounts (${lockedAccounts.length})</h3>
            ${lockedAccounts.length === 0
                ? '<p class="text-muted mt-2">No locked accounts.</p>'
                : `<div class="table-wrapper mt-2">
                    <table>
                    <thead><tr><th>Username</th><th>Email</th><th>Failed Attempts</th><th>Last Updated</th><th>Action</th></tr></thead>
                    <tbody>
                    ${lockedAccounts.map((u) => `
                        <tr>
                            <td><strong>${escapeHtml(u.username)}</strong></td>
                            <td>${escapeHtml(u.email)}</td>
                            <td>${u.failed_login_attempts}</td>
                            <td>${formatDateTime(u.updated_at)}</td>
                            <td><button class="btn btn-sm btn-success" onclick="unlockUser('${u.id}')">Unlock</button></td>
                        </tr>`).join('')}
                    </tbody></table></div>`}
        </div>

        <div class="card" style="border-left:4px solid #f39c12">
            <h3>⚠️ Suspicious Login Activity (last hour)</h3>
            ${suspiciousActivity.length === 0
                ? '<p class="text-muted mt-2">No suspicious activity detected.</p>'
                : `<div class="table-wrapper mt-2">
                    <table>
                    <thead><tr><th>User</th><th>Failed Attempts</th><th>Last Attempt</th></tr></thead>
                    <tbody>
                    ${suspiciousActivity.map((s) => `
                        <tr>
                            <td>${escapeHtml(s.username || 'Unknown')}</td>
                            <td><strong>${s.failure_count}</strong></td>
                            <td>${formatDateTime(s.last_attempt)}</td>
                        </tr>`).join('')}
                    </tbody></table></div>`}
        </div>`;
}

// ── System Health (AVL-05) ────────────────────────────────────────────────

async function loadSystemHealth() {
    const container = document.getElementById('health-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:20px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch('/api/v1/health');
    if (!res) return;

    const h = res.data;
    const statusColor = res.ok ? 'var(--color-success)' : 'var(--color-danger)';
    const statusIcon  = res.ok ? '✓' : '✕';

    container.innerHTML = `
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-number" style="color:${statusColor}">${statusIcon}</div>
                <div class="stat-label">System Status: ${escapeHtml(h.status)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${formatUptime(h.uptime_seconds)}</div>
                <div class="stat-label">Uptime</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="color:${h.database?.status === 'ok' ? 'var(--color-success)' : 'var(--color-danger)'}">
                    ${h.database?.status === 'ok' ? '✓' : '✕'}
                </div>
                <div class="stat-label">Database: ${escapeHtml(h.database?.status || 'unknown')} ${h.database?.latency_ms != null ? '(' + h.database.latency_ms + 'ms)' : ''}</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" style="font-size:1rem">${escapeHtml(h.timestamp?.split('T')[0] || '—')}</div>
                <div class="stat-label">Last Checked</div>
            </div>
        </div>`;
}

function formatUptime(seconds) {
    if (!seconds) return '—';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
}

// ── Appointments (Admin view) ─────────────────────────────────────────────

async function loadAllAppointments() {
    const container = document.getElementById('admin-appointments-list');
    if (!container) return;

    const res = await apiFetch('/api/v1/appointments/all');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load appointments.</p>';
        return;
    }

    const appts = res.data.appointments;
    const statusBadge = { scheduled: 'badge-info', completed: 'badge-success', cancelled: 'badge-danger', rescheduled: 'badge-warning' };

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead><tr><th>Patient</th><th>Doctor</th><th>Date & Time</th><th>Status</th></tr></thead>
        <tbody>
        ${appts.map((a) => `
            <tr>
                <td>${escapeHtml(a.patient_name)}</td>
                <td>${escapeHtml(a.doctor_name)}</td>
                <td>${formatDateTime(a.appointment_time)}</td>
                <td><span class="badge ${statusBadge[a.status] || 'badge-neutral'}">${a.status}</span></td>
            </tr>`).join('')}
        </tbody></table></div>`;
}

// ── Navigation ────────────────────────────────────────────────────────────

function showSection(id) {
    document.querySelectorAll('.dashboard-section').forEach((s) => s.classList.add('hidden'));
    document.querySelectorAll('.sidebar-nav a').forEach((a) => a.classList.remove('active'));

    const section = document.getElementById(id);
    if (section) section.classList.remove('hidden');

    const navLink = document.querySelector(`[data-section="${id}"]`);
    if (navLink) navLink.classList.add('active');

    const loaders = {
        'section-users':        loadUsers,
        'section-audit':        () => loadAuditLogs(0),
        'section-alerts':       loadSecurityAlerts,
        'section-health':       loadSystemHealth,
        'section-appointments': loadAllAppointments,
    };
    if (loaders[id]) loaders[id]();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
}
