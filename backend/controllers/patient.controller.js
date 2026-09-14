/**
 * Patient Controller
 * AUTHZ-03: Patients can view their own records but cannot modify them.
 * CONF-01: Decrypts sensitive fields before returning to client.
 * AUD-01: All accesses are logged.
 */
'use strict';

const { query } = require('../config/db');
const encryptionService = require('../services/encryption.service');
const auditService = require('../services/audit.service');

// ── Get patient profile ────────────────────────────────────────────────────

async function getMyProfile(req, res) {
    try {
        const result = await query(
            `SELECT p.id, p.full_name, p.date_of_birth, p.contact_phone,
                    p.contact_address, p.insurance_provider_name,
                    p.insurance_policy_number, u.email, u.username
             FROM patients p
             JOIN users u ON u.id = p.user_id
             WHERE u.id = $1`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }

        const patient = result.rows[0];

        // Decrypt sensitive field (CONF-01); mask display in frontend (CONF-04)
        const decryptedPolicyNumber = patient.insurance_policy_number
            ? encryptionService.decrypt(patient.insurance_policy_number)
            : null;

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_PROFILE',
            targetResource: `patients/${patient.id}`,
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({
            ...patient,
            insurance_policy_number: decryptedPolicyNumber,
        });

    } catch (err) {
        console.error('[PatientController.getMyProfile]', err.message);
        return res.status(500).json({ error: 'Could not retrieve profile' });
    }
}

// ── Get patient's own medical records ─────────────────────────────────────

async function getMyMedicalRecords(req, res) {
    try {
        // First, get patient ID for this user
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient record not found' });
        }
        const patientId = patientResult.rows[0].id;

        const result = await query(
            `SELECT mr.id, mr.record_date, mr.diagnosis, mr.treatment,
                    mr.prescriptions, mr.test_results, mr.version,
                    d.full_name AS doctor_name, d.specialty
             FROM medical_records mr
             JOIN doctors d ON d.id = mr.doctor_id
             WHERE mr.patient_id = $1
             ORDER BY mr.record_date DESC`,
            [patientId]
        );

        // Decrypt all sensitive fields before returning (CONF-01)
        const records = result.rows.map((r) => ({
            ...r,
            diagnosis:    r.diagnosis    ? encryptionService.decrypt(r.diagnosis) : null,
            treatment:    r.treatment    ? encryptionService.decrypt(r.treatment) : null,
            prescriptions: r.prescriptions ? encryptionService.decrypt(r.prescriptions) : null,
            test_results:  r.test_results  ? encryptionService.decrypt(r.test_results) : null,
        }));

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_RECORDS',
            targetResource: `patients/${patientId}/records`,
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ records });

    } catch (err) {
        console.error('[PatientController.getMyMedicalRecords]', err.message);
        return res.status(500).json({ error: 'Could not retrieve medical records' });
    }
}

// ── Manage doctor consent (AUTHZ-05) ──────────────────────────────────────

async function getMyConsents(req, res) {
    try {
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        const patientId = patientResult.rows[0].id;

        const result = await query(
            `SELECT pc.id, pc.authorized_doctor_id, d.full_name AS doctor_name,
                    d.specialty, pc.granted_at, pc.revoked_at
             FROM patient_consent pc
             JOIN doctors d ON d.id = pc.authorized_doctor_id
             WHERE pc.patient_id = $1
             ORDER BY pc.granted_at DESC`,
            [patientId]
        );

        return res.status(200).json({ consents: result.rows });

    } catch (err) {
        console.error('[PatientController.getMyConsents]', err.message);
        return res.status(500).json({ error: 'Could not retrieve consents' });
    }
}

async function grantConsent(req, res) {
    const { doctorId } = req.body;
    const ip = req.ip;

    try {
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        const patientId = patientResult.rows[0].id;

        // Upsert consent — if revoked record exists, reactivate it
        await query(
            `INSERT INTO patient_consent (patient_id, authorized_doctor_id)
             VALUES ($1, $2)
             ON CONFLICT (patient_id, authorized_doctor_id)
             DO UPDATE SET revoked_at = NULL, granted_at = NOW()`,
            [patientId, doctorId]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'GRANT_CONSENT',
            targetResource: `doctors/${doctorId}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: 'Consent granted' });

    } catch (err) {
        console.error('[PatientController.grantConsent]', err.message);
        return res.status(500).json({ error: 'Could not grant consent' });
    }
}

async function revokeConsent(req, res) {
    const { doctorId } = req.params;
    const ip = req.ip;

    try {
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        const patientId = patientResult.rows[0].id;

        await query(
            `UPDATE patient_consent
             SET revoked_at = NOW()
             WHERE patient_id = $1 AND authorized_doctor_id = $2 AND revoked_at IS NULL`,
            [patientId, doctorId]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'REVOKE_CONSENT',
            targetResource: `doctors/${doctorId}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: 'Consent revoked' });

    } catch (err) {
        console.error('[PatientController.revokeConsent]', err.message);
        return res.status(500).json({ error: 'Could not revoke consent' });
    }
}

module.exports = {
    getMyProfile,
    getMyMedicalRecords,
    getMyConsents,
    grantConsent,
    revokeConsent,
};
