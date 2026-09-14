/**
 * Shared Utilities
 * - Auto-logout timer (CONF-05): 15 minutes of inactivity → server logout
 * - Field masking helpers (CONF-04)
 * - Authenticated fetch wrapper
 * - Toast notifications
 * - Role-based redirect on page load
 */

'use strict';

// ── Auto-Logout Timer (CONF-05) ──────────────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const INACTIVITY_WARN_MS    = 13 * 60 * 1000; // warn at 13 min

let inactivityTimer   = null;
let warningTimer      = null;
let warningEl         = null;

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    clearTimeout(warningTimer);
    hideInactivityWarning();

    warningTimer = setTimeout(() => {
        showInactivityWarning();
    }, INACTIVITY_WARN_MS);

    inactivityTimer = setTimeout(async () => {
        await performLogout('Session expired due to inactivity.');
    }, INACTIVITY_TIMEOUT_MS);
}

function showInactivityWarning() {
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.id = 'inactivity-warning';
        warningEl.innerHTML = `
            <span>⚠️ Your session will expire in 2 minutes due to inactivity.</span>
            <button onclick="resetInactivityTimer()" style="background:rgba(255,255,255,.2);border:none;padding:6px 12px;border-radius:4px;color:#fff;cursor:pointer;font-weight:600">Stay Active</button>
        `;
        document.body.appendChild(warningEl);
    }
    warningEl.classList.remove('hidden');
}

function hideInactivityWarning() {
    if (warningEl) warningEl.classList.add('hidden');
}

function initInactivityTimer() {
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((evt) => document.addEventListener(evt, resetInactivityTimer, { passive: true }));
    resetInactivityTimer();
}

async function performLogout(reason = '') {
    try {
        await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } catch (_) {}
    if (reason) sessionStorage.setItem('logout_reason', reason);
    window.location.href = '/index.html';
}

// ── Masked Field Display (CONF-04) ────────────────────────────────────────
function maskInsuranceNumber(value) {
    if (!value) return '—';
    const visible = value.slice(-4);
    return '••••-••••-' + visible;
}

function maskEmail(email) {
    if (!email) return '—';
    const [local, domain] = email.split('@');
    return local[0] + '•••' + local.slice(-1) + '@' + domain;
}

function createMaskedField(value, type = 'insurance') {
    const masked = type === 'insurance' ? maskInsuranceNumber(value) : '••••••••';
    return `
        <span class="masked-value" data-real="${encodeURIComponent(value)}" data-shown="false">
            ${masked}
        </span>
        <button class="reveal-btn" onclick="toggleMaskedField(this)">Show</button>
    `;
}

function toggleMaskedField(btn) {
    const span = btn.previousElementSibling;
    const isShown = span.dataset.shown === 'true';
    if (isShown) {
        const type = span.dataset.type || 'insurance';
        span.textContent = type === 'insurance'
            ? maskInsuranceNumber(decodeURIComponent(span.dataset.real))
            : '••••••••';
        span.dataset.shown = 'false';
        btn.textContent = 'Show';
    } else {
        span.textContent = decodeURIComponent(span.dataset.real);
        span.dataset.shown = 'true';
        btn.textContent = 'Hide';
    }
}

// ── CSRF Token ────────────────────────────────────────────────────────────
// Held in memory only (never in a cookie, so a cross-site page can't read
// it) — populated from login/MFA/status responses (see storeCsrfToken calls
// below and in auth.js) and attached to every mutating request.
let csrfToken = null;

function storeCsrfToken(token) {
    if (token) csrfToken = token;
}

// ── Authenticated Fetch Wrapper ───────────────────────────────────────────
async function apiFetch(url, options = {}) {
    const defaults = {
        credentials: 'include',   // Always send session cookie
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    };

    const config = {
        ...defaults,
        ...options,
        headers: { ...defaults.headers, ...(options.headers || {}) },
    };

    const method = (config.method || 'GET').toUpperCase();
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        config.headers['X-CSRF-Token'] = csrfToken;
    }

    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const response = await fetch(url, config);

    if (response.status === 401) {
        // Session expired server-side
        await performLogout('Your session has expired. Please log in again.');
        return null;
    }

    const data = await response.json().catch(() => ({}));

    // Pick up a fresh token whenever the server hands us one (login, MFA
    // verify, /auth/status) so subsequent mutating calls stay authorized.
    if (data && data.csrfToken) storeCsrfToken(data.csrfToken);

    return { ok: response.ok, status: response.status, data };
}

// ── Toast Notifications ───────────────────────────────────────────────────
let toastContainer = null;

function showToast(message, type = 'info', duration = 4000) {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:360px';
        document.body.appendChild(toastContainer);
    }

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const colors = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12', info: '#1a6b8a' };

    const toast = document.createElement('div');
    toast.style.cssText = `background:#fff;border-left:4px solid ${colors[type]};border-radius:8px;padding:14px 18px;box-shadow:0 4px 12px rgba(0,0,0,.12);display:flex;align-items:flex-start;gap:10px;animation:slideIn .25s ease`;
    toast.innerHTML = `
        <span style="color:${colors[type]};font-size:1.1rem;flex-shrink:0">${icons[type]}</span>
        <span style="font-size:.9rem;color:#1a2332;line-height:1.5;flex:1">${escapeHtml(message)}</span>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;color:#999;font-size:1rem;padding:0;line-height:1">×</button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut .25s ease forwards';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

// ── HTML Escaping (XSS prevention) ───────────────────────────────────────
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Format Date/Time ─────────────────────────────────────────────────────
function formatDate(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

function formatDateTime(isoString) {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

// ── Role → Dashboard Redirect ─────────────────────────────────────────────
function redirectToDashboard(role) {
    const dashboards = {
        patient:            '/dashboard-patient.html',
        doctor:             '/dashboard-doctor.html',
        admin:              '/dashboard-admin.html',
        insurance_provider: '/insurance.html',
    };
    const target = dashboards[role] || '/index.html';
    window.location.href = target;
}

// ── Check auth status on page load ───────────────────────────────────────
async function checkAuthAndRedirect(requiredRole = null) {
    try {
        const res = await apiFetch('/api/v1/auth/status');
        if (!res || !res.data.authenticated) {
            window.location.href = '/index.html';
            return null;
        }
        if (requiredRole && res.data.role !== requiredRole) {
            redirectToDashboard(res.data.role);
            return null;
        }
        return res.data;
    } catch {
        window.location.href = '/index.html';
        return null;
    }
}

// ── CSS animation keyframes (injected once) ───────────────────────────────
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn  { from { transform:translateX(100%);opacity:0 } to { transform:translateX(0);opacity:1 } }
    @keyframes slideOut { from { transform:translateX(0);opacity:1 }   to { transform:translateX(100%);opacity:0 } }
`;
document.head.appendChild(style);
