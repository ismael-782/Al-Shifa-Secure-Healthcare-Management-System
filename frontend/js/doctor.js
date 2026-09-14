/**
 * Doctor Dashboard JS
 * - List assigned (consented) patients
 * - View patient medical records
 * - Create/update medical records
 * - Manage availability schedule
 */
'use strict';

let selectedPatientId = null;
let selectedRecordId  = null;
let currentPatientRecords = []; // cache so the Edit button never has to inline record data into HTML

async function initDoctorDashboard() {
    const user = await checkAuthAndRedirect('doctor');
    if (!user) return;

    document.querySelectorAll('.user-greeting').forEach((el) => {
        el.textContent = user.username;
    });

    initInactivityTimer();
    await loadDoctorProfile();
    showSection('section-patients');
}

// ── Profile ───────────────────────────────────────────────────────────────

async function loadDoctorProfile() {
    const res = await apiFetch('/api/v1/doctor/profile');
    if (!res || !res.ok) return;

    const d = res.data;
    setText('doctor-name', d.full_name);
    setText('doctor-specialty', d.specialty);
    setText('doctor-license', d.license_number);

    // Render availability
    renderAvailabilitySchedule(d.availability_schedule || {});
}

// ── Assigned Patients ─────────────────────────────────────────────────────

async function loadAssignedPatients() {
    const container = document.getElementById('patients-list');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:20px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch('/api/v1/doctor/patients');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load patients.</p>';
        return;
    }

    const patients = res.data.patients;

    if (patients.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👥</div>
                <h3>No assigned patients</h3>
                <p>Patients who grant you consent will appear here.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead><tr><th>Patient Name</th><th>Date of Birth</th><th>Email</th><th>Consent Since</th><th>Actions</th></tr></thead>
        <tbody>
        ${patients.map((p) => `
            <tr>
                <td><strong>${escapeHtml(p.full_name)}</strong></td>
                <td>${formatDate(p.date_of_birth)}</td>
                <td>${escapeHtml(p.email)}</td>
                <td>${formatDate(p.granted_at)}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="viewPatientRecords('${p.id}', '${escapeHtml(p.full_name)}')">View Records</button>
                    <button class="btn btn-sm btn-outline" onclick="openNewRecordForm('${p.id}')">New Record</button>
                </td>
            </tr>`).join('')}
        </tbody></table></div>`;
}

// ── Patient Medical Records (doctor view) ─────────────────────────────────

async function viewPatientRecords(patientId, patientName) {
    selectedPatientId = patientId;

    showSection('section-records');
    document.getElementById('records-patient-name').textContent = patientName;

    const container = document.getElementById('doctor-records-list');
    container.innerHTML = '<div style="text-align:center;padding:20px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch(`/api/v1/doctor/patients/${patientId}/records`);

    if (!res || !res.ok) {
        container.innerHTML = `<div class="alert alert-error">${escapeHtml(res?.data?.error || 'Could not load records.')}</div>`;
        return;
    }

    const records = res.data.records;
    currentPatientRecords = records;

    if (records.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📋</div>
                <h3>No records yet</h3>
                <button class="btn btn-primary mt-2" onclick="openNewRecordForm('${patientId}')">Create First Record</button>
            </div>`;
        return;
    }

    container.innerHTML = records.map((r) => `
        <div class="record-card">
            <div class="record-header">
                <div>
                    <small class="text-muted">${formatDateTime(r.record_date)} &bull; Version ${r.version}</small>
                </div>
                <button class="btn btn-sm btn-outline" onclick="openEditRecordForm('${r.id}', '${patientId}')">Edit</button>
            </div>
            ${r.diagnosis ? `<div class="record-section"><h4>Diagnosis</h4><p>${escapeHtml(r.diagnosis)}</p></div>` : ''}
            ${r.treatment ? `<div class="record-section"><h4>Treatment</h4><p>${escapeHtml(r.treatment)}</p></div>` : ''}
            ${r.prescriptions ? `
            <div class="record-section">
                <h4>Prescriptions</h4>
                <p>${escapeHtml(r.prescriptions)}</p>
                <span class="prescription-badge">✓ Digitally signed</span>
                <div style="font-size:.75rem;color:#aab4c3;margin-top:4px;font-family:monospace">${r.digital_signature ? 'Sig: ' + r.digital_signature.slice(0, 20) + '…' : ''}</div>
            </div>` : ''}
            ${r.test_results ? `<div class="record-section"><h4>Test Results</h4><p>${escapeHtml(r.test_results)}</p></div>` : ''}
        </div>`).join('');
}

// ── Record Form (Create / Edit) ───────────────────────────────────────────

function openNewRecordForm(patientId) {
    selectedPatientId = patientId;
    selectedRecordId  = null;
    populateRecordForm({});
    showSection('section-record-form');
    document.getElementById('record-form-title').textContent = 'New Medical Record';
}

function openEditRecordForm(recordId, patientId) {
    const record = currentPatientRecords.find((r) => r.id === recordId);
    if (!record) return;

    selectedPatientId = patientId;
    selectedRecordId  = recordId;
    populateRecordForm(record);
    showSection('section-record-form');
    document.getElementById('record-form-title').textContent = 'Update Medical Record';
}

function populateRecordForm(record) {
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
    };
    setValue('record-diagnosis', record.diagnosis);
    setValue('record-treatment', record.treatment);
    setValue('record-prescriptions', record.prescriptions);
    setValue('record-test-results', record.test_results);
}

async function submitRecordForm(e) {
    e.preventDefault();
    const btn = document.getElementById('record-submit-btn');
    const errEl = document.getElementById('record-error');

    const payload = {
        patientId:        selectedPatientId,
        diagnosis:        document.getElementById('record-diagnosis').value.trim(),
        treatment:        document.getElementById('record-treatment').value.trim(),
        prescriptions:    document.getElementById('record-prescriptions').value.trim(),
        testResults:      document.getElementById('record-test-results').value.trim(),
        existingRecordId: selectedRecordId || undefined,
    };

    if (!payload.diagnosis && !payload.treatment && !payload.prescriptions && !payload.testResults) {
        errEl.textContent = 'At least one field must be filled.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    setButtonLoading(btn, true);

    const res = await apiFetch('/api/v1/records', {
        method: 'POST',
        body: payload,
    });

    setButtonLoading(btn, false);

    if (res?.ok) {
        showToast(res.data.message, 'success');
        showSection('section-patients');
        await loadAssignedPatients();
    } else {
        errEl.textContent = res?.data?.error || 'Could not save record.';
        errEl.classList.remove('hidden');
    }
}

// ── Availability Schedule ─────────────────────────────────────────────────

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00'];

let currentSchedule = {};

function renderAvailabilitySchedule(schedule) {
    currentSchedule = schedule;
    const container = document.getElementById('availability-grid');
    if (!container) return;

    container.innerHTML = DAYS.map((day) => `
        <div class="mb-2">
            <h4 style="margin-bottom:8px">${day}</h4>
            <div class="time-slot-grid">
                ${SLOTS.map((slot) => `
                    <div class="time-slot ${(schedule[day] || []).includes(slot) ? 'selected' : ''}"
                         onclick="toggleSlot('${day}', '${slot}', this)">${slot}</div>
                `).join('')}
            </div>
        </div>`).join('');
}

function toggleSlot(day, slot, el) {
    if (!currentSchedule[day]) currentSchedule[day] = [];

    if (currentSchedule[day].includes(slot)) {
        currentSchedule[day] = currentSchedule[day].filter((s) => s !== slot);
        el.classList.remove('selected');
    } else {
        currentSchedule[day].push(slot);
        currentSchedule[day].sort();
        el.classList.add('selected');
    }
}

async function saveAvailability() {
    const res = await apiFetch('/api/v1/doctor/availability', {
        method: 'PUT',
        body: { availabilitySchedule: currentSchedule },
    });

    if (res?.ok) {
        showToast('Availability saved successfully.', 'success');
    } else {
        showToast(res?.data?.error || 'Could not save availability.', 'error');
    }
}

// ── Doctor Appointments ───────────────────────────────────────────────────

async function loadDoctorAppointments() {
    const container = document.getElementById('doctor-appointments-list');
    if (!container) return;

    const res = await apiFetch('/api/v1/appointments/doctor');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load appointments.</p>';
        return;
    }

    const appts = res.data.appointments;
    if (appts.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📅</div><h3>No appointments scheduled</h3></div>`;
        return;
    }

    const statusBadge = { scheduled: 'badge-info', completed: 'badge-success', cancelled: 'badge-danger', rescheduled: 'badge-warning' };

    container.innerHTML = `
        <div class="table-wrapper">
        <table>
        <thead><tr><th>Patient</th><th>Date & Time</th><th>Status</th></tr></thead>
        <tbody>
        ${appts.map((a) => `
            <tr>
                <td>${escapeHtml(a.patient_name)}</td>
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
        'section-patients':     loadAssignedPatients,
        'section-appointments': loadDoctorAppointments,
        'section-availability': () => {
            apiFetch('/api/v1/doctor/profile').then((r) => {
                if (r?.ok) renderAvailabilitySchedule(r.data.availability_schedule || {});
            });
        },
    };
    if (loaders[id]) loaders[id]();
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value ?? '—';
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.dataset.originalText = btn.innerHTML; btn.innerHTML = '<span class="loader"></span> Saving…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.originalText || btn.innerHTML; btn.disabled = false; }
}
