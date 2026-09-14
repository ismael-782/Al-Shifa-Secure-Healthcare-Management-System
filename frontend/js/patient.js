/**
 * Patient Dashboard JS
 * - Load and display profile
 * - View own medical records (decrypted server-side, masked in UI)
 * - Manage doctor consents
 * - View appointments
 */
'use strict';

let patientData = null;

async function initPatientDashboard() {
    const user = await checkAuthAndRedirect('patient');
    if (!user) return;

    document.querySelectorAll('.user-greeting').forEach((el) => {
        el.textContent = user.username;
    });

    initInactivityTimer();
    await loadPatientProfile();
    await loadPatientStats();
    showSection('section-overview');
}

// ── Profile ───────────────────────────────────────────────────────────────

async function loadPatientProfile() {
    const res = await apiFetch('/api/v1/patient/profile');
    if (!res || !res.ok) return;

    patientData = res.data;

    // Populate profile fields
    setText('profile-name', patientData.full_name);
    setText('profile-email', patientData.email);
    setText('profile-dob', formatDate(patientData.date_of_birth));
    setText('profile-phone', patientData.contact_phone || '—');
    setText('profile-address', patientData.contact_address || '—');
    setText('profile-insurer', patientData.insurance_provider_name || '—');

    // Mask insurance policy number (CONF-04)
    const policyEl = document.getElementById('profile-policy');
    if (policyEl && patientData.insurance_policy_number) {
        policyEl.innerHTML = createMaskedField(patientData.insurance_policy_number, 'insurance');
    } else if (policyEl) {
        policyEl.textContent = '—';
    }
}

// ── Stats ─────────────────────────────────────────────────────────────────

async function loadPatientStats() {
    const [apptRes, recordsRes] = await Promise.all([
        apiFetch('/api/v1/appointments/my'),
        apiFetch('/api/v1/patient/records'),
    ]);

    if (apptRes?.ok) {
        const upcoming = apptRes.data.appointments.filter((a) => a.status === 'scheduled').length;
        setText('stat-appointments', upcoming);
    }

    if (recordsRes?.ok) {
        setText('stat-records', recordsRes.data.records.length);
    }
}

// ── Medical Records ───────────────────────────────────────────────────────

async function loadMyRecords() {
    const container = document.getElementById('records-list');
    if (!container) return;

    container.innerHTML = '<div class="loader loader-dark"></div>';

    const res = await apiFetch('/api/v1/patient/records');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load records.</p>';
        return;
    }

    const records = res.data.records;

    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>No medical records yet</h3>
                <p>Your medical records will appear here after your first consultation.</p>
            </div>`;
        return;
    }

    container.innerHTML = records.map((r) => `
        <div class="record-card">
            <div class="record-header">
                <div>
                    <h4>${escapeHtml(r.doctor_name)} — ${escapeHtml(r.specialty)}</h4>
                    <small class="text-muted">${formatDateTime(r.record_date)} &bull; Version ${r.version}</small>
                </div>
            </div>
            ${r.diagnosis ? `
            <div class="record-section">
                <h4>Diagnosis</h4>
                <p>${escapeHtml(r.diagnosis)}</p>
            </div>` : ''}
            ${r.treatment ? `
            <div class="record-section">
                <h4>Treatment</h4>
                <p>${escapeHtml(r.treatment)}</p>
            </div>` : ''}
            ${r.prescriptions ? `
            <div class="record-section">
                <h4>Prescriptions</h4>
                <p>${escapeHtml(r.prescriptions)}</p>
                <span class="prescription-badge">✓ Digitally signed</span>
            </div>` : ''}
            ${r.test_results ? `
            <div class="record-section">
                <h4>Test Results</h4>
                <p>${escapeHtml(r.test_results)}</p>
            </div>` : ''}
        </div>
    `).join('');
}

// ── Consents ──────────────────────────────────────────────────────────────

async function loadMyConsents() {
    const container = document.getElementById('consents-list');
    if (!container) return;

    const [consentsRes, doctorsRes] = await Promise.all([
        apiFetch('/api/v1/patient/consents'),
        apiFetch('/api/v1/doctor/list'),
    ]);

    // Populate add-consent dropdown
    const select = document.getElementById('consent-doctor-select');
    if (select && doctorsRes?.ok) {
        const doctors = doctorsRes.data.doctors;
        select.innerHTML = '<option value="">Select a doctor…</option>' +
            doctors.map((d) => `<option value="${escapeHtml(d.id)}">${escapeHtml(d.full_name)} — ${escapeHtml(d.specialty)}</option>`).join('');
    }

    if (!consentsRes || !consentsRes.ok) {
        container.innerHTML = '<p class="text-danger">Could not load consents.</p>';
        return;
    }

    const consents = consentsRes.data.consents;
    const active   = consents.filter((c) => !c.revoked_at);
    const revoked  = consents.filter((c) => c.revoked_at);

    if (consents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔒</div>
                <h3>No consents granted</h3>
                <p>Grant a doctor access to your medical records using the form above.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <h4 class="mt-2 mb-2">Active Consents (${active.length})</h4>
        ${active.length === 0 ? '<p class="text-muted">None</p>' :
            active.map((c) => `
            <div class="card card-sm flex items-center justify-between mb-2">
                <div>
                    <strong>${escapeHtml(c.doctor_name)}</strong>
                    <span class="text-muted"> — ${escapeHtml(c.specialty)}</span>
                    <div class="text-muted" style="font-size:.8rem">Granted: ${formatDate(c.granted_at)}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="revokeConsent('${c.authorized_doctor_id}')">Revoke</button>
            </div>`).join('')}
        ${revoked.length > 0 ? `
        <h4 class="mt-3 mb-2">Revoked Consents</h4>
        ${revoked.map((c) => `
            <div class="card card-sm flex items-center justify-between mb-2" style="opacity:.6">
                <div>
                    <strong>${escapeHtml(c.doctor_name)}</strong>
                    <div class="text-muted" style="font-size:.8rem">Revoked: ${formatDate(c.revoked_at)}</div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="regrantConsent('${c.authorized_doctor_id}')">Re-grant</button>
            </div>`).join('')}` : ''}
    `;
}

async function grantConsent(e) {
    e.preventDefault();
    const doctorId = document.getElementById('consent-doctor-select')?.value;
    if (!doctorId) { showToast('Please select a doctor.', 'warning'); return; }

    const res = await apiFetch('/api/v1/patient/consents', {
        method: 'POST',
        body: { doctorId },
    });

    if (res?.ok) {
        showToast('Consent granted successfully.', 'success');
        await loadMyConsents();
    } else {
        showToast(res?.data?.error || 'Could not grant consent.', 'error');
    }
}

async function revokeConsent(doctorId) {
    if (!confirm('Revoke this doctor\'s access to your records?')) return;

    const res = await apiFetch(`/api/v1/patient/consents/${doctorId}`, { method: 'DELETE' });

    if (res?.ok) {
        showToast('Consent revoked.', 'success');
        await loadMyConsents();
    } else {
        showToast(res?.data?.error || 'Could not revoke consent.', 'error');
    }
}

async function regrantConsent(doctorId) {
    const res = await apiFetch('/api/v1/patient/consents', {
        method: 'POST',
        body: { doctorId },
    });
    if (res?.ok) {
        showToast('Consent re-granted.', 'success');
        await loadMyConsents();
    } else {
        showToast(res?.data?.error || 'Failed.', 'error');
    }
}

// ── Appointments ──────────────────────────────────────────────────────────

async function loadPatientAppointments() {
    const container = document.getElementById('appointments-list');
    if (!container) return;

    const res = await apiFetch('/api/v1/appointments/my');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load appointments.</p>';
        return;
    }

    const appts = res.data.appointments;
    if (appts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📅</div>
                <h3>No appointments</h3>
                <p><a href="/appointments.html">Schedule your first appointment</a></p>
            </div>`;
        return;
    }

    const statusBadge = {
        scheduled:   'badge-info',
        completed:   'badge-success',
        cancelled:   'badge-danger',
        rescheduled: 'badge-warning',
    };

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead><tr><th>Doctor</th><th>Specialty</th><th>Date & Time</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
        ${appts.map((a) => `
            <tr>
                <td>${escapeHtml(a.doctor_name)}</td>
                <td>${escapeHtml(a.specialty)}</td>
                <td>${formatDateTime(a.appointment_time)}</td>
                <td><span class="badge ${statusBadge[a.status] || 'badge-neutral'}">${a.status}</span></td>
                <td>${a.status === 'scheduled' ? `<button class="btn btn-sm btn-danger" onclick="cancelAppointment('${a.id}')">Cancel</button>` : '—'}</td>
            </tr>`).join('')}
        </tbody></table></div>`;
}

async function cancelAppointment(id) {
    if (!confirm('Cancel this appointment?')) return;
    const res = await apiFetch(`/api/v1/appointments/${id}`, { method: 'DELETE' });
    if (res?.ok) {
        showToast('Appointment cancelled.', 'success');
        await loadPatientAppointments();
    } else {
        showToast(res?.data?.error || 'Could not cancel.', 'error');
    }
}

// ── Section Navigation ────────────────────────────────────────────────────

function showSection(id) {
    document.querySelectorAll('.dashboard-section').forEach((s) => s.classList.add('hidden'));
    document.querySelectorAll('.sidebar-nav a').forEach((a) => a.classList.remove('active'));

    const section = document.getElementById(id);
    if (section) section.classList.remove('hidden');

    const navLink = document.querySelector(`[data-section="${id}"]`);
    if (navLink) navLink.classList.add('active');

    // Lazy-load section content
    const loaders = {
        'section-records':      loadMyRecords,
        'section-consents':     loadMyConsents,
        'section-appointments': loadPatientAppointments,
    };
    if (loaders[id]) loaders[id]();
}

// ── DOM Helpers ───────────────────────────────────────────────────────────

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
}
