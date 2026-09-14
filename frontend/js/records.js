/**
 * Medical Record Viewer JS — UC-04, UC-05
 * Standalone record viewer/editor page.
 * Used by doctors (editable) and patients (read-only).
 */
'use strict';

let currentUser   = null;
let currentRecord = null;

async function initRecordPage() {
    currentUser = await checkAuthAndRedirect();
    if (!currentUser) return;

    initInactivityTimer();

    const params   = new URLSearchParams(window.location.search);
    const recordId = params.get('id');

    if (recordId) {
        await loadRecord(recordId);
    }

    // Show edit controls only for doctors
    document.querySelectorAll('.doctor-only').forEach((el) => {
        el.classList.toggle('hidden', currentUser.role !== 'doctor');
    });
}

// ── Load record ────────────────────────────────────────────────────────────

async function loadRecord(id) {
    const container = document.getElementById('record-container');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px"><span class="loader loader-dark"></span></div>';

    const res = await apiFetch(`/api/v1/records/${id}`);

    if (!res || !res.ok) {
        container.innerHTML = `<div class="alert alert-error">${escapeHtml(res?.data?.error || 'Could not load record.')}</div>`;
        return;
    }

    currentRecord = res.data.record;
    renderRecord(currentRecord);
}

function renderRecord(r) {
    const container = document.getElementById('record-container');

    container.innerHTML = `
        <div class="record-card">
            <div class="record-header">
                <div>
                    <h3>Medical Record</h3>
                    <small class="text-muted">${formatDateTime(r.record_date)} &bull; Version ${r.version}</small>
                </div>
                <div style="display:flex;gap:8px">
                    ${currentUser.role === 'doctor' ? `<button class="btn btn-outline btn-sm" onclick="toggleEditMode()">✏️ Edit</button>` : ''}
                    <a href="/api/v1/records/${r.id}/history" class="btn btn-ghost btn-sm" onclick="loadHistory(event,'${r.id}')">History</a>
                </div>
            </div>

            <div id="record-view-mode">
                ${r.diagnosis ? `<div class="record-section"><h4>Diagnosis</h4><p>${escapeHtml(r.diagnosis)}</p></div>` : ''}
                ${r.treatment ? `<div class="record-section"><h4>Treatment Plan</h4><p>${escapeHtml(r.treatment)}</p></div>` : ''}
                ${r.prescriptions ? `
                <div class="record-section">
                    <h4>Prescriptions</h4>
                    <p>${escapeHtml(r.prescriptions)}</p>
                    <span class="prescription-badge">✓ Digitally Signed</span>
                    <div class="text-muted" style="font-size:.75rem;margin-top:4px;font-family:monospace">
                        Signature: ${r.digital_signature ? r.digital_signature.slice(0,32) + '…' : 'N/A'}
                    </div>
                </div>` : ''}
                ${r.test_results ? `<div class="record-section"><h4>Test Results</h4><p>${escapeHtml(r.test_results)}</p></div>` : ''}
            </div>

            <div id="record-edit-mode" class="hidden doctor-only">
                <form onsubmit="saveRecord(event)">
                    <div class="form-group">
                        <label>Diagnosis</label>
                        <textarea class="form-control" id="edit-diagnosis" rows="3">${escapeHtml(r.diagnosis || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Treatment Plan</label>
                        <textarea class="form-control" id="edit-treatment" rows="3">${escapeHtml(r.treatment || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Prescriptions <small class="text-muted">(will be digitally signed)</small></label>
                        <textarea class="form-control" id="edit-prescriptions" rows="3">${escapeHtml(r.prescriptions || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Test Results</label>
                        <textarea class="form-control" id="edit-test-results" rows="4">${escapeHtml(r.test_results || '')}</textarea>
                    </div>
                    <div id="record-save-error" class="alert alert-error hidden"></div>
                    <div style="display:flex;gap:10px">
                        <button type="submit" id="save-record-btn" class="btn btn-primary">Save Changes</button>
                        <button type="button" class="btn btn-ghost" onclick="toggleEditMode()">Cancel</button>
                    </div>
                </form>
            </div>
        </div>

        <div id="history-panel" class="hidden mt-3">
            <h3 class="mb-2">Version History</h3>
            <div id="history-list"></div>
        </div>`;
}

// ── Edit Mode Toggle ──────────────────────────────────────────────────────

function toggleEditMode() {
    const viewMode = document.getElementById('record-view-mode');
    const editMode = document.getElementById('record-edit-mode');
    if (viewMode && editMode) {
        viewMode.classList.toggle('hidden');
        editMode.classList.toggle('hidden');
    }
}

// ── Save Updated Record ───────────────────────────────────────────────────

async function saveRecord(e) {
    e.preventDefault();
    const btn   = document.getElementById('save-record-btn');
    const errEl = document.getElementById('record-save-error');

    const payload = {
        patientId:        currentRecord.patient_id,
        existingRecordId: currentRecord.id,
        diagnosis:        document.getElementById('edit-diagnosis')?.value?.trim(),
        treatment:        document.getElementById('edit-treatment')?.value?.trim(),
        prescriptions:    document.getElementById('edit-prescriptions')?.value?.trim(),
        testResults:      document.getElementById('edit-test-results')?.value?.trim(),
    };

    errEl.classList.add('hidden');
    setButtonLoading(btn, true);

    const res = await apiFetch('/api/v1/records', {
        method: 'POST',
        body: payload,
    });

    setButtonLoading(btn, false);

    if (res?.ok) {
        showToast('Record updated successfully.', 'success');
        await loadRecord(currentRecord.id);
    } else {
        errEl.textContent = res?.data?.error || 'Could not save changes.';
        errEl.classList.remove('hidden');
    }
}

// ── Version History ───────────────────────────────────────────────────────

async function loadHistory(e, recordId) {
    e.preventDefault();
    const panel = document.getElementById('history-panel');
    const list  = document.getElementById('history-list');
    if (!panel || !list) return;

    panel.classList.remove('hidden');
    list.innerHTML = '<span class="loader loader-dark"></span>';

    const res = await apiFetch(`/api/v1/records/${recordId}/history`);

    if (!res || !res.ok) {
        list.innerHTML = '<p class="text-danger">Could not load history.</p>';
        return;
    }

    const history = res.data.history;

    if (history.length === 0) {
        list.innerHTML = '<p class="text-muted">No version history yet.</p>';
        return;
    }

    list.innerHTML = history.map((h) => `
        <div class="card card-sm mb-2">
            <strong>Version ${h.version_number}</strong>
            <span class="text-muted" style="margin-left:12px;font-size:.85rem">
                ${formatDateTime(h.changed_at)} by ${escapeHtml(h.changed_by)}
            </span>
        </div>`).join('');
}

function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) { btn.dataset.originalText = btn.innerHTML; btn.innerHTML = '<span class="loader"></span> Saving…'; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.originalText || btn.innerHTML; btn.disabled = false; }
}
