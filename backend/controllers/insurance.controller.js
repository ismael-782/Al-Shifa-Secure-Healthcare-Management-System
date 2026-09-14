/**
 * Insurance Claims Controller
 * UC-06: Submit Insurance Claim (admin only)
 * CONF-01: Claim details encrypted.
 * AUD-01: All claim activity logged.
 */
'use strict';

const { query } = require('../config/db');
const encryptionService = require('../services/encryption.service');
const auditService = require('../services/audit.service');

// ── UC-06: Submit a claim (admin) ─────────────────────────────────────────

async function submitClaim(req, res) {
    const { patientId, doctorId, appointmentId, claimDetails } = req.body;
    const ip = req.ip;

    try {
        // Verify appointment is completed
        if (appointmentId) {
            const apptResult = await query(
                `SELECT status FROM appointments WHERE id = $1`,
                [appointmentId]
            );
            if (apptResult.rows.length === 0) {
                return res.status(404).json({ error: 'Appointment not found' });
            }
            if (apptResult.rows[0].status !== 'completed') {
                return res.status(400).json({ error: 'Claim can only be submitted for completed appointments' });
            }
        }

        // Verify patient has insurance info
        const patientResult = await query(
            `SELECT insurance_provider_name, insurance_policy_number
             FROM patients WHERE id = $1`,
            [patientId]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }
        if (!patientResult.rows[0].insurance_policy_number) {
            return res.status(400).json({ error: 'Patient has no insurance information on file' });
        }

        // Encrypt claim details (CONF-01)
        const encryptedDetails = encryptionService.encrypt(claimDetails);

        const result = await query(
            `INSERT INTO insurance_claims
                (patient_id, doctor_id, appointment_id, claim_details, status, submitted_by)
             VALUES ($1,$2,$3,$4,'pending',$5)
             RETURNING id, status, submitted_at`,
            [patientId, doctorId, appointmentId || null, encryptedDetails, req.user.id]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'SUBMIT_CLAIM',
            targetResource: `insurance_claims/${result.rows[0].id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(201).json({
            message: 'Insurance claim submitted',
            claim: result.rows[0],
        });

    } catch (err) {
        console.error('[InsuranceController.submitClaim]', err.message);
        return res.status(500).json({ error: 'Could not submit claim' });
    }
}

// ── List claims (admin sees all; insurance_provider sees pending) ─────────

async function listClaims(req, res) {
    const { role } = req.user;

    try {
        let whereClause = '';
        const params = [];

        if (role === 'insurance_provider') {
            whereClause = `WHERE ic.status = 'pending'`;
        }

        const result = await query(
            `SELECT ic.id, ic.status, ic.submitted_at, ic.processed_at,
                    p.full_name AS patient_name, d.full_name AS doctor_name,
                    u.username AS submitted_by_username
             FROM insurance_claims ic
             JOIN patients p ON p.id = ic.patient_id
             JOIN doctors d ON d.id = ic.doctor_id
             JOIN users u ON u.id = ic.submitted_by
             ${whereClause}
             ORDER BY ic.submitted_at DESC`,
            params
        );

        return res.status(200).json({ claims: result.rows });

    } catch (err) {
        console.error('[InsuranceController.listClaims]', err.message);
        return res.status(500).json({ error: 'Could not retrieve claims' });
    }
}

// ── Get single claim with decrypted details ───────────────────────────────

async function getClaim(req, res) {
    const { id } = req.params;
    const { role } = req.user;

    try {
        const result = await query(
            `SELECT ic.*, p.full_name AS patient_name, d.full_name AS doctor_name
             FROM insurance_claims ic
             JOIN patients p ON p.id = ic.patient_id
             JOIN doctors d ON d.id = ic.doctor_id
             WHERE ic.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found' });
        }

        const claim = result.rows[0];

        // Insurance providers only see pending claims (AUTHZ)
        if (role === 'insurance_provider' && claim.status !== 'pending') {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const decryptedDetails = claim.claim_details
            ? encryptionService.decrypt(claim.claim_details)
            : null;

        await auditService.log({
            userId: req.user.id,
            action: 'VIEW_CLAIM',
            targetResource: `insurance_claims/${id}`,
            ipAddress: req.ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ claim: { ...claim, claim_details: decryptedDetails } });

    } catch (err) {
        console.error('[InsuranceController.getClaim]', err.message);
        return res.status(500).json({ error: 'Could not retrieve claim' });
    }
}

// ── Process a claim (insurance_provider or admin) ─────────────────────────

async function processClaim(req, res) {
    const { id } = req.params;
    const { status, processorNotes } = req.body;
    const ip = req.ip;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Status must be approved or rejected' });
    }

    try {
        const result = await query(
            `UPDATE insurance_claims
             SET status = $1, processed_at = NOW(), processor_notes = $2
             WHERE id = $3 AND status = 'pending'
             RETURNING id`,
            [status, processorNotes || null, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Claim not found or already processed' });
        }

        await auditService.log({
            userId: req.user.id,
            action: `PROCESS_CLAIM_${status.toUpperCase()}`,
            targetResource: `insurance_claims/${id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: `Claim ${status}` });

    } catch (err) {
        console.error('[InsuranceController.processClaim]', err.message);
        return res.status(500).json({ error: 'Could not process claim' });
    }
}

module.exports = { submitClaim, listClaims, getClaim, processClaim };
