/**
 * Doctor Controller
 * AUTHZ-02: Doctors access only assigned (consented) patients.
 * INT-01: Only authorized doctors can update medical records.
 * INT-02: Every update creates a versioned snapshot.
 */
'use strict';

const { query } = require('../config/db');
const encryptionService = require('../services/encryption.service');
const auditService = require('../services/audit.service');

// ── Get doctor's profile ────────────────────────────────────────────────────

async function getMyProfile(req, res) {
    try {
        const result = await query(
            `SELECT d.id, d.full_name, d.specialty, d.license_number, d.availability_schedule
             FROM doctors d
             WHERE d.user_id = $1`,
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor profile not found' });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('[DoctorController.getMyProfile]', err.message);
        return res.status(500).json({ error: 'Could not retrieve profile' });
    }
}

// ── Get assigned patients (with active consent) ─────────────────────────────

async function getAssignedPatients(req, res) {
    try {
        const doctorResult = await query(
            `SELECT id FROM doctors WHERE user_id = $1`,
            [req.user.id]
        );
        if (doctorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor profile not found' });
        }
        const doctorId = doctorResult.rows[0].id;

        // AUTHZ-02 + AUTHZ-05: only patients who have active (non-revoked) consent
        const result = await query(
            `SELECT p.id, p.full_name, p.date_of_birth, p.contact_phone,
                    u.email, pc.granted_at
             FROM patient_consent pc
             JOIN patients p ON p.id = pc.patient_id
             JOIN users u ON u.id = p.user_id
             WHERE pc.authorized_doctor_id = $1
               AND pc.revoked_at IS NULL
             ORDER BY p.full_name`,
            [doctorId]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'LIST_ASSIGNED_PATIENTS',
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ patients: result.rows });

    } catch (err) {
        console.error('[DoctorController.getAssignedPatients]', err.message);
        return res.status(500).json({ error: 'Could not retrieve patients' });
    }
}

// ── Get records of a consented patient ────────────────────────────────────

async function getPatientRecords(req, res) {
    const { patientId } = req.params;

    try {
        const doctorResult = await query(
            `SELECT id FROM doctors WHERE user_id = $1`,
            [req.user.id]
        );
        if (doctorResult.rows.length === 0) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const doctorId = doctorResult.rows[0].id;

        // AUTHZ-02: verify active consent
        const consentCheck = await query(
            `SELECT id FROM patient_consent
             WHERE patient_id = $1 AND authorized_doctor_id = $2 AND revoked_at IS NULL`,
            [patientId, doctorId]
        );
        if (consentCheck.rows.length === 0) {
            await auditService.log({ userId: req.user.id, action: 'VIEW_RECORD', targetResource: `patients/${patientId}`, ipAddress: req.ip, status: 'FAILURE', errorMessage: 'No active consent' });
            return res.status(403).json({ error: 'No active patient consent for this access' });
        }

        const result = await query(
            `SELECT mr.id, mr.record_date, mr.diagnosis, mr.treatment,
                    mr.prescriptions, mr.test_results, mr.version,
                    mr.digital_signature
             FROM medical_records mr
             WHERE mr.patient_id = $1
             ORDER BY mr.record_date DESC`,
            [patientId]
        );

        const records = result.rows.map((r) => ({
            ...r,
            diagnosis:     r.diagnosis     ? encryptionService.decrypt(r.diagnosis) : null,
            treatment:     r.treatment     ? encryptionService.decrypt(r.treatment) : null,
            prescriptions: r.prescriptions ? encryptionService.decrypt(r.prescriptions) : null,
            test_results:  r.test_results  ? encryptionService.decrypt(r.test_results) : null,
        }));

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_RECORD',
            targetResource: `patients/${patientId}/records`,
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ records });

    } catch (err) {
        console.error('[DoctorController.getPatientRecords]', err.message);
        return res.status(500).json({ error: 'Could not retrieve records' });
    }
}

// ── Update availability schedule ───────────────────────────────────────────

async function updateAvailability(req, res) {
    const { availabilitySchedule } = req.body;

    try {
        const result = await query(
            `UPDATE doctors SET availability_schedule = $1 WHERE user_id = $2 RETURNING id`,
            [JSON.stringify(availabilitySchedule), req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor profile not found' });
        }

        await auditService.log({
            userId: req.user.id,
            action: 'UPDATE_AVAILABILITY',
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: 'Availability updated' });

    } catch (err) {
        console.error('[DoctorController.updateAvailability]', err.message);
        return res.status(500).json({ error: 'Could not update availability' });
    }
}

// ── List all doctors (for patient appointment booking) ─────────────────────

async function listAllDoctors(req, res) {
    try {
        const result = await query(
            `SELECT d.id, d.full_name, d.specialty, d.availability_schedule
             FROM doctors d
             ORDER BY d.specialty, d.full_name`
        );
        return res.status(200).json({ doctors: result.rows });
    } catch (err) {
        console.error('[DoctorController.listAllDoctors]', err.message);
        return res.status(500).json({ error: 'Could not list doctors' });
    }
}

module.exports = {
    getMyProfile,
    getAssignedPatients,
    getPatientRecords,
    updateAvailability,
    listAllDoctors,
};
