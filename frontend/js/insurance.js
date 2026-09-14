/**
 * Insurance Claims JS — UC-06
 * Admin: submit and manage claims
 * Insurance Provider: view and process pending claims
 */
'use strict';

async function initInsurancePage() {
    const user = await checkAuthAndRedirect();
    if (!user) return;

    if (!['admin', 'insurance_provider'].includes(user.role)) {
        redirectToDashboard(user.role);
        return;
    }

    document.querySelectorAll('.user-greeting').forEach((el) => {
        el.textContent = user.username;
    });

    initInactivityTimer();

    // Show/hide admin-only sections
    document.querySelectorAll('.admin-only').forEach((el) => {
        el.classList.toggle('hidden', user.role !== 'admin');
    });

    await loadClaims();

    if (user.role === 'admin') {
        await loadPatientListForClaim();
        await loadDoctorListForClaim();
        await loadCompletedAppointments();
    }
}

// ── Load Claims ───────────────────────────────────────────────────────────

async function loadClaims() {
    const container = document.getElementById('claims-list');
    if (!container) return;

    const res = await apiFetch('/api/v1/insurance/claims');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load claims.</p>';
        return;
    }

    const claims = res.data.claims;

    if (claims.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📄</div>
                <h3>No insurance claims</h3>
            </div>`;
        return;
    }

    const statusBadge = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead>
            <tr><th>Patient</th><th>Doctor</th><th>Submitted</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
        ${claims.map((c) => `
            <tr>
                <td>${escapeHtml(c.patient_name)}</td>
                <td>${escapeHtml(c.doctor_name)}</td>
                <td>${formatDate(c.submitted_at)}</td>
                <td><span class="badge ${statusBadge[c.status] || 'badge-neutral'}">${c.status}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="viewClaim('${c.id}')">View</button>
                    ${c.status === 'pending' ? `
                    <button class="btn btn-sm btn-success" onclick="processClaim('${c.id}', 'approved')">Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="processClaim('${c.id}', 'rejected')">Reject</button>` : ''}
                </td>
            </tr>`).join('')}
        </tbody></table></div>`;
}

// ── View Claim Details ────────────────────────────────────────────────────

async function viewClaim(id) {
    const res = await apiFetch(`/api/v1/insurance/claims/${id}`);
    if (!res || !res.ok) {
        showToast(res?.data?.error || 'Could not load claim.', 'error');
        return;
    }

    const c = res.data.claim;
    const modal = document.getElementById('claim-modal');
    const content = document.getElementById('claim-modal-content');

    if (content) {
        content.innerHTML = `
            <h3 style="margin-bottom:16px">Claim Details</h3>
            <div class="card card-sm mb-2">
                <div class="record-section"><h4>Patient</h4><p>${escapeHtml(c.patient_name)}</p></div>
                <div class="record-section"><h4>Doctor</h4><p>${escapeHtml(c.doctor_name)}</p></div>
                <div class="record-section"><h4>Submitted</h4><p>${formatDateTime(c.submitted_at)}</p></div>
                <div class="record-section"><h4>Status</h4><p>${escapeHtml(c.status)}</p></div>
                <div class="record-section"><h4>Claim Details</h4><p>${escapeHtml(c.claim_details || '—')}</p></div>
                ${c.processor_notes ? `<div class="record-section"><h4>Processor Notes</h4><p>${escapeHtml(c.processor_notes)}</p></div>` : ''}
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
                ${c.status === 'pending' ? `
                <button class="btn btn-success" onclick="processClaim('${c.id}', 'approved');closeModal()">Approve</button>
                <button class="btn btn-danger" onclick="processClaim('${c.id}', 'rejected');closeModal()">Reject</button>` : ''}
                <button class="btn btn-ghost" onclick="closeModal()">Close</button>
            </div>`;
    }

    if (modal) modal.classList.remove('hidden');
}

function closeModal() {
    document.getElementById('claim-modal')?.classList.add('hidden');
}

// ── Process Claim ─────────────────────────────────────────────────────────

async function processClaim(id, status) {
    const notes = status === 'rejected'
        ? prompt('Optional: Enter reason for rejection') || ''
        : '';

    const res = await apiFetch(`/api/v1/insurance/claims/${id}/process`, {
        method: 'PUT',
        body: { status, processorNotes: notes },
    });

    if (res?.ok) {
        showToast(`Claim ${status}.`, 'success');
        await loadClaims();
    } else {
        showToast(res?.data?.error || 'Could not process claim.', 'error');
    }
}

// ── Submit New Claim (Admin) ───────────────────────────────────────────────

async function loadPatientListForClaim() {
    const select = document.getElementById('claim-patient-select');
    if (!select) return;

    // Must use patients.id (profile PK), not users.id — insurance_claims.patient_id
    // references the patients table, so /api/v1/admin/patients is required here.
    const res = await apiFetch('/api/v1/admin/patients');
    if (!res || !res.ok) return;

    const patients = res.data.patients;
    select.innerHTML = '<option value="">Select patient…</option>' +
        patients.map((p) => `<option value="${p.id}">${escapeHtml(p.full_name)} (${escapeHtml(p.username)})</option>`).join('');
}

async function loadDoctorListForClaim() {
    const select = document.getElementById('claim-doctor-select');
    if (!select) return;

    const res = await apiFetch('/api/v1/doctor/list');
    if (!res || !res.ok) return;

    const doctors = res.data.doctors;
    select.innerHTML = '<option value="">Select doctor…</option>' +
        doctors.map((d) => `<option value="${d.id}">${escapeHtml(d.full_name)} — ${escapeHtml(d.specialty)}</option>`).join('');
}

async function loadCompletedAppointments() {
    const select = document.getElementById('claim-appointment-select');
    if (!select) return;

    const res = await apiFetch('/api/v1/appointments/all');
    if (!res || !res.ok) return;

    const completed = res.data.appointments.filter((a) => a.status === 'completed');
    select.innerHTML = '<option value="">Select appointment (optional)…</option>' +
        completed.map((a) => `<option value="${a.id}">${escapeHtml(a.patient_name)} with ${escapeHtml(a.doctor_name)} — ${formatDate(a.appointment_time)}</option>`).join('');
}

async function submitNewClaim(e) {
    e.preventDefault();
    const form = e.target;
    const btn  = form.querySelector('#submit-claim-btn');
    const errEl = document.getElementById('claim-error');

    const payload = {
        patientId:     form.querySelector('#claim-patient-select')?.value,
        doctorId:      form.querySelector('#claim-doctor-select')?.value,
        appointmentId: form.querySelector('#claim-appointment-select')?.value || undefined,
        claimDetails:  form.querySelector('#claim-details')?.value?.trim(),
    };

    if (!payload.patientId || !payload.doctorId || !payload.claimDetails) {
        errEl.textContent = 'Patient, doctor, and claim details are required.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    setButtonLoading(btn, true);

    const res = await apiFetch('/api/v1/insurance/claims', {
        method: 'POST',
        body: payload,
    });

    setButtonLoading(btn, false);

    if (res?.ok) {
        showToast('Insurance claim submitted successfully.', 'success');
        form.reset();
        await loadClaims();
    } else {
        errEl.textContent = res?.data?.error || 'Could not submit claim.';
        errEl.classList.remove('hidden');
    }
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.dataset.originalText = btn.innerHTML; btn.innerHTML = '<span class="loader"></span> Submitting…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.originalText || btn.innerHTML; btn.disabled = false; }
}
