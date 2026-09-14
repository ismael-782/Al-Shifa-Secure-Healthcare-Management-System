/**
 * Landing Page JS
 * Pulls only public, non-sensitive data: doctor name + specialty, and an
 * aggregate patient count (never names). No auth required for any of it.
 */
'use strict';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const SPECIALTY_ICON = {
    Cardiology: '❤️',
    Neurology: '🧠',
    'General Medicine': '🩺',
};

async function loadLandingStats() {
    const grid = document.getElementById('doctor-grid');

    try {
        const res = await fetch('/api/v1/public/stats');
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();

        document.getElementById('stat-patients').textContent = data.totalPatients ?? '—';
        document.getElementById('stat-doctors').textContent = data.doctors?.length ?? '—';

        if (!data.doctors || data.doctors.length === 0) {
            grid.innerHTML = '<p class="text-muted">No specialists listed yet.</p>';
            return;
        }

        grid.innerHTML = data.doctors.map((d) => `
            <div class="doctor-card">
                <div class="doctor-avatar">${SPECIALTY_ICON[d.specialty] || '⚕️'}</div>
                <h4>${escapeHtml(d.full_name)}</h4>
                <span class="doctor-specialty">${escapeHtml(d.specialty)}</span>
            </div>`).join('');

    } catch (err) {
        grid.innerHTML = '<p class="text-muted">Care team directory is temporarily unavailable.</p>';
    }
}

loadLandingStats();
