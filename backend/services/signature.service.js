/**
 * Digital Signature Service — HMAC-SHA256 for Prescriptions
 * Implements INT-05: prescriptions include a digital signature to detect tampering.
 *
 * The signature covers the prescription text + patient_id + doctor_id + timestamp
 * to bind it to a specific record and prevent replay of signatures.
 */
'use strict';

const crypto = require('crypto');
const { hmacSecret } = require('../config/security');

/**
 * Generates an HMAC-SHA256 signature over prescription data.
 * @param {object} params - { prescriptions, patientId, doctorId, recordDate }
 * @returns {string} hex-encoded HMAC digest
 */
function signPrescription({ prescriptions, patientId, doctorId, recordDate }) {
    const payload = JSON.stringify({ prescriptions, patientId, doctorId, recordDate });
    return crypto
        .createHmac('sha256', hmacSecret)
        .update(payload, 'utf8')
        .digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature against the provided data.
 * Uses timingSafeEqual to prevent timing attacks.
 * @returns {boolean}
 */
function verifyPrescriptionSignature({ prescriptions, patientId, doctorId, recordDate }, signature) {
    if (!signature) return false;

    const expected = signPrescription({ prescriptions, patientId, doctorId, recordDate });

    try {
        // timingSafeEqual requires equal-length buffers
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(signature, 'hex');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
}

/**
 * Computes a SHA-256 checksum over a record's core fields.
 * Used by INT-04 trigger to detect unauthorized DB-level modifications.
 */
function computeRecordChecksum({ diagnosis, treatment, prescriptions, testResults, patientId, doctorId }) {
    const payload = JSON.stringify({ diagnosis, treatment, prescriptions, testResults, patientId, doctorId });
    return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

module.exports = { signPrescription, verifyPrescriptionSignature, computeRecordChecksum };
