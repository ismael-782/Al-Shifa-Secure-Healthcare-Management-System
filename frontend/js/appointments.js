/**
 * Appointment Scheduling JS — UC-03
 * - Load available doctors
 * - Show doctor's availability slots for a selected date
 * - Book appointment
 */
'use strict';

let selectedDoctorId    = null;
let selectedDoctorName  = null;
let selectedSlot        = null;
let selectedDate        = null;
let doctorsCache        = [];

async function initAppointmentsPage() {
    const user = await checkAuthAndRedirect('patient');
    if (!user) return;

    initInactivityTimer();
    await loadDoctorsForBooking();
    initDatePicker();
}

// ── Load doctors ──────────────────────────────────────────────────────────

async function loadDoctorsForBooking() {
    const container = document.getElementById('doctors-grid');
    if (!container) return;

    const res = await apiFetch('/api/v1/doctor/list');
    if (!res || !res.ok) {
        container.innerHTML = '<p class="text-danger">Could not load doctors.</p>';
        return;
    }

    doctorsCache = res.data.doctors;

    if (doctorsCache.length === 0) {
        container.innerHTML = '<p class="text-muted">No doctors available at this time.</p>';
        return;
    }

    container.innerHTML = doctorsCache.map((d) => `
        <div class="card card-sm doctor-card ${selectedDoctorId === d.id ? 'selected' : ''}"
             id="doctor-card-${d.id}"
             onclick="selectDoctor('${d.id}', '${escapeHtml(d.full_name)}')"
             style="cursor:pointer;border:2px solid transparent;transition:all .2s">
            <div style="display:flex;align-items:center;gap:12px">
                <div style="width:48px;height:48px;border-radius:50%;background:var(--color-primary-light);display:flex;align-items:center;justify-content:center;font-size:1.3rem">👨‍⚕️</div>
                <div>
                    <h4>${escapeHtml(d.full_name)}</h4>
                    <div class="text-muted" style="font-size:.85rem">${escapeHtml(d.specialty)}</div>
                </div>
            </div>
        </div>`).join('');
}

function selectDoctor(doctorId, doctorName) {
    selectedDoctorId   = doctorId;
    selectedDoctorName = doctorName;
    selectedSlot       = null;

    // Highlight selected card
    document.querySelectorAll('.doctor-card').forEach((c) => {
        c.style.borderColor = 'transparent';
        c.style.background  = '';
    });
    const card = document.getElementById(`doctor-card-${doctorId}`);
    if (card) {
        card.style.borderColor = 'var(--color-primary)';
        card.style.background  = 'var(--color-primary-light)';
    }

    document.getElementById('selected-doctor-name').textContent = doctorName;
    document.getElementById('step-slots').classList.remove('hidden');

    // If a date is already selected, reload slots
    if (selectedDate) loadTimeSlots();
}

// ── Date Picker ───────────────────────────────────────────────────────────

function initDatePicker() {
    const datePicker = document.getElementById('appt-date');
    if (!datePicker) return;

    // Set min date to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    datePicker.min = tomorrow.toISOString().split('T')[0];

    // Set max date to 60 days from now
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 60);
    datePicker.max = maxDate.toISOString().split('T')[0];

    datePicker.addEventListener('change', () => {
        selectedDate = datePicker.value;
        selectedSlot = null;
        if (selectedDoctorId) loadTimeSlots();
    });
}

function loadTimeSlots() {
    const slotsContainer = document.getElementById('time-slots');
    if (!slotsContainer || !selectedDoctorId || !selectedDate) return;

    const doctor = doctorsCache.find((d) => d.id === selectedDoctorId);
    if (!doctor) return;

    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayName  = dayNames[dateObj.getDay()];

    const schedule = doctor.availability_schedule || {};
    const slots    = schedule[dayName] || [];

    if (slots.length === 0) {
        slotsContainer.innerHTML = `<p class="text-muted">Dr. ${escapeHtml(doctor.full_name)} has no availability on ${dayName}s. Please choose a different date.</p>`;
        return;
    }

    slotsContainer.innerHTML = `
        <p class="text-muted" style="margin-bottom:12px">Available slots for ${dayName}, ${selectedDate}:</p>
        <div class="time-slot-grid">
            ${slots.map((slot) => `
                <div class="time-slot" onclick="selectSlot('${escapeHtml(slot)}', this)">${escapeHtml(slot)}</div>
            `).join('')}
        </div>`;
}

function selectSlot(slot, el) {
    document.querySelectorAll('.time-slot').forEach((s) => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedSlot = slot;

    // Update confirmation panel
    const panel = document.getElementById('booking-summary');
    if (panel) {
        panel.classList.remove('hidden');
        document.getElementById('summary-doctor').textContent = selectedDoctorName;
        document.getElementById('summary-date').textContent   = selectedDate;
        document.getElementById('summary-time').textContent   = selectedSlot;
    }
}

// ── Book Appointment ──────────────────────────────────────────────────────

async function confirmBooking() {
    const btn   = document.getElementById('confirm-btn');
    const errEl = document.getElementById('booking-error');

    if (!selectedDoctorId || !selectedDate || !selectedSlot) {
        errEl.textContent = 'Please select a doctor, date, and time slot.';
        errEl.classList.remove('hidden');
        return;
    }

    // Build datetime string — keep local time without UTC conversion so the
    // server-side day-of-week and hour checks match what the user selected.
    const appointmentTime = `${selectedDate}T${selectedSlot}:00`;

    setButtonLoading(btn, true);
    errEl.classList.add('hidden');

    const res = await apiFetch('/api/v1/appointments', {
        method: 'POST',
        body: { doctorId: selectedDoctorId, appointmentTime },
    });

    setButtonLoading(btn, false);

    if (res?.ok) {
        showToast('Appointment booked successfully!', 'success');
        // Reset state
        selectedDoctorId = null; selectedDoctorName = null;
        selectedSlot = null; selectedDate = null;
        document.getElementById('booking-summary').classList.add('hidden');
        document.getElementById('step-slots').classList.add('hidden');
        document.getElementById('appt-date').value = '';
        document.querySelectorAll('.doctor-card').forEach((c) => {
            c.style.borderColor = 'transparent'; c.style.background = '';
        });
        setTimeout(() => { window.location.href = '/dashboard-patient.html'; }, 2000);
    } else {
        errEl.textContent = res?.data?.error || 'Booking failed. Please try again.';
        errEl.classList.remove('hidden');
    }
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.dataset.originalText = btn.innerHTML; btn.innerHTML = '<span class="loader"></span> Booking…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.originalText || btn.innerHTML; btn.disabled = false; }
}
