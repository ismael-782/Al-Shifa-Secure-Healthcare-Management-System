/**
 * Medical Records Controller
 * UC-04: View Medical Record
 * UC-05: Update Medical Record (doctor only)
 * INT-01: Only authorized doctors update records.
 * INT-02: Every update versioned in medical_record_history.
 * INT-05: Prescription digital signature generated on save.
 * CONF-01: All clinical fields encrypted.
 * AUD-01: All accesses and updates logged.
 */
'use strict';

const { query, getClient } = require('../config/db');
const encryptionService = require('../services/encryption.service');
const signatureService = require('../services/signature.service');
const auditService = require('../services/audit.service');

// ── UC-04: Get a single medical record ────────────────────────────────────

async function getRecord(req, res) {
    const { id } = req.params;
    const { id: userId, role } = req.user;
    const ip = req.ip;

    try {
        const result = await query(
            `SELECT mr.*, p.user_id AS patient_user_id, d.user_id AS doctor_user_id
             FROM medical_records mr
             JOIN patients p ON p.id = mr.patient_id
             JOIN doctors d ON d.id = mr.doctor_id
             WHERE mr.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        const record = result.rows[0];

        // AUTHZ-03: patient can only see their own records
        if (role === 'patient' && record.patient_user_id !== userId) {
            await auditService.log({ userId, action: 'VIEW_RECORD', targetResource: `medical_records/${id}`, ipAddress: ip, status: 'FAILURE', errorMessage: 'Not own record' });
            return res.status(403).json({ error: 'Forbidden' });
        }

        // AUTHZ-02: doctor needs active consent
        if (role === 'doctor') {
            const doctorResult = await query(`SELECT id FROM doctors WHERE user_id = $1`, [userId]);
            if (doctorResult.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
            const doctorId = doctorResult.rows[0].id;

            const consent = await query(
                `SELECT id FROM patient_consent
                 WHERE patient_id = $1 AND authorized_doctor_id = $2 AND revoked_at IS NULL`,
                [record.patient_id, doctorId]
            );
            if (consent.rows.length === 0) {
                await auditService.log({ userId, action: 'VIEW_RECORD', targetResource: `medical_records/${id}`, ipAddress: ip, status: 'FAILURE', errorMessage: 'No consent' });
                return res.status(403).json({ error: 'No active patient consent' });
            }
        }
        // Admin has unrestricted read access (AUTHZ-04)

        // Decrypt clinical fields (CONF-01)
        const decrypted = {
            ...record,
            diagnosis:     record.diagnosis     ? encryptionService.decrypt(record.diagnosis) : null,
            treatment:     record.treatment     ? encryptionService.decrypt(record.treatment) : null,
            prescriptions: record.prescriptions ? encryptionService.decrypt(record.prescriptions) : null,
            test_results:  record.test_results  ? encryptionService.decrypt(record.test_results) : null,
        };

        await auditService.log({ userId, action: 'VIEW_RECORD', targetResource: `medical_records/${id}`, ipAddress: ip, status: 'SUCCESS' });

        return res.status(200).json({ record: decrypted });

    } catch (err) {
        console.error('[RecordsController.getRecord]', err.message);
        return res.status(500).json({ error: 'Could not retrieve record' });
    }
}

// ── UC-05: Create/Update Medical Record ───────────────────────────────────

async function createOrUpdateRecord(req, res) {
    const { patientId, diagnosis, treatment, prescriptions, testResults, existingRecordId } = req.body;
    const { id: userId } = req.user;
    const ip = req.ip;

    try {
        // Get doctor profile
        const doctorResult = await query(`SELECT id FROM doctors WHERE user_id = $1`, [userId]);
        if (doctorResult.rows.length === 0) {
            return res.status(403).json({ error: 'Only doctors can create/update records' });
        }
        const doctorId = doctorResult.rows[0].id;

        // AUTHZ-02 + AUTHZ-05: verify active consent
        const consent = await query(
            `SELECT id FROM patient_consent
             WHERE patient_id = $1 AND authorized_doctor_id = $2 AND revoked_at IS NULL`,
            [patientId, doctorId]
        );
        if (consent.rows.length === 0) {
            await auditService.log({ userId, action: 'UPDATE_RECORD', targetResource: `patients/${patientId}`, ipAddress: ip, status: 'FAILURE', errorMessage: 'No consent' });
            return res.status(403).json({ error: 'No active patient consent' });
        }

        // Encrypt all clinical fields (CONF-01)
        const encDiagnosis     = diagnosis     ? encryptionService.encrypt(diagnosis) : null;
        const encTreatment     = treatment     ? encryptionService.encrypt(treatment) : null;
        const encPrescriptions = prescriptions ? encryptionService.encrypt(prescriptions) : null;
        const encTestResults   = testResults   ? encryptionService.encrypt(testResults) : null;

        // Generate prescription digital signature (INT-05)
        const digitalSignature = prescriptions
            ? signatureService.signPrescription({ prescriptions, patientId, doctorId, recordDate: new Date().toISOString() })
            : null;

        // Compute checksum for INT-04 tamper detection
        const checksum = signatureService.computeRecordChecksum({
            diagnosis: encDiagnosis, treatment: encTreatment,
            prescriptions: encPrescriptions, testResults: encTestResults,
            patientId, doctorId,
        });

        const client = await getClient();
        try {
            await client.query('BEGIN');

            let recordId;
            let newVersion;

            if (existingRecordId) {
                // UPDATE path: create history snapshot first (INT-02)
                const existing = await client.query(
                    `SELECT * FROM medical_records WHERE id = $1 AND doctor_id = $2`,
                    [existingRecordId, doctorId]
                );
                if (existing.rows.length === 0) {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ error: 'Record not found or not yours' });
                }

                const prev = existing.rows[0];
                newVersion = prev.version + 1;

                // Save snapshot of previous version (INT-02)
                const snapshot = encryptionService.encryptObject({
                    version: prev.version,
                    diagnosis: prev.diagnosis,
                    treatment: prev.treatment,
                    prescriptions: prev.prescriptions,
                    test_results: prev.test_results,
                    digital_signature: prev.digital_signature,
                    record_date: prev.record_date,
                });

                await client.query(
                    `INSERT INTO medical_record_history (record_id, changed_by, snapshot_data, version_number)
                     VALUES ($1, $2, $3, $4)`,
                    [existingRecordId, userId, snapshot, prev.version]
                );

                // Update the record
                await client.query(
                    `UPDATE medical_records SET
                        diagnosis = $1, treatment = $2, prescriptions = $3,
                        test_results = $4, digital_signature = $5, checksum = $6,
                        version = $7, updated_at = NOW()
                     WHERE id = $8`,
                    [encDiagnosis, encTreatment, encPrescriptions, encTestResults,
                     digitalSignature, checksum, newVersion, existingRecordId]
                );

                recordId = existingRecordId;

            } else {
                // CREATE path
                newVersion = 1;
                const insertResult = await client.query(
                    `INSERT INTO medical_records
                        (patient_id, doctor_id, diagnosis, treatment, prescriptions,
                         test_results, digital_signature, checksum, version)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                     RETURNING id`,
                    [patientId, doctorId, encDiagnosis, encTreatment, encPrescriptions,
                     encTestResults, digitalSignature, checksum, newVersion]
                );
                recordId = insertResult.rows[0].id;
            }

            await client.query('COMMIT');

            await auditService.log({
                userId,
                action: existingRecordId ? 'UPDATE_RECORD' : 'CREATE_RECORD',
                targetResource: `medical_records/${recordId}`,
                ipAddress: ip,
                status: 'SUCCESS',
            });

            return res.status(existingRecordId ? 200 : 201).json({
                message: existingRecordId ? 'Record updated' : 'Record created',
                recordId,
                version: newVersion,
            });

        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

    } catch (err) {
        console.error('[RecordsController.createOrUpdateRecord]', err.message);
        return res.status(500).json({ error: 'Could not save record' });
    }
}

// ── Get record history (admin/doctor) ────────────────────────────────────

async function getRecordHistory(req, res) {
    const { id } = req.params;

    try {
        const result = await query(
            `SELECT mrh.id, mrh.version_number, mrh.changed_at, u.username AS changed_by
             FROM medical_record_history mrh
             JOIN users u ON u.id = mrh.changed_by
             WHERE mrh.record_id = $1
             ORDER BY mrh.changed_at DESC`,
            [id]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_RECORD_HISTORY',
            targetResource: `medical_records/${id}/history`,
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ history: result.rows });

    } catch (err) {
        console.error('[RecordsController.getRecordHistory]', err.message);
        return res.status(500).json({ error: 'Could not retrieve history' });
    }
}

module.exports = { getRecord, createOrUpdateRecord, getRecordHistory };
