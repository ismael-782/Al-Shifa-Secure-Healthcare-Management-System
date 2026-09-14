/**
 * Repair script: seed.sql inserts clinical/insurance fields as literal
 * 'ENCRYPTED_PLACEHOLDER_...' strings (see comments in seed.sql) instead of
 * real AES-256-CBC ciphertext, and medical_records.digital_signature /
 * .checksum as literal 'HMAC_PLACEHOLDER_...' / 'CHECKSUM_PLACEHOLDER_...'
 * strings instead of real HMAC/SHA-256 values. Every read path calls
 * encryptionService.decrypt() on these fields, which throws "Invalid
 * ciphertext format" on the placeholder text.
 *
 * This script finds every placeholder-tagged row, strips the prefix to
 * recover the intended plaintext, and re-encrypts/re-signs it for real
 * using the app's own services — so the seeded demo data actually round-
 * trips through the same code path production data would.
 *
 * Safe to re-run: rows without a placeholder prefix are left untouched.
 */
'use strict';

const { query } = require('../config/db');
const encryptionService = require('../services/encryption.service');
const signatureService = require('../services/signature.service');

const PLACEHOLDER_PREFIX = 'ENCRYPTED_PLACEHOLDER_';

async function fixPatients() {
    const { rows } = await query(
        `SELECT id, insurance_policy_number FROM patients WHERE insurance_policy_number LIKE $1`,
        [`${PLACEHOLDER_PREFIX}%`]
    );
    for (const row of rows) {
        const plaintext = row.insurance_policy_number.slice(PLACEHOLDER_PREFIX.length);
        const ciphertext = encryptionService.encrypt(plaintext);
        await query(`UPDATE patients SET insurance_policy_number = $1 WHERE id = $2`, [ciphertext, row.id]);
        console.log(`[patients] ${row.id}: re-encrypted insurance_policy_number`);
    }
}

async function fixMedicalRecords() {
    const { rows } = await query(
        `SELECT id, patient_id, doctor_id, record_date, diagnosis, treatment, prescriptions, test_results
         FROM medical_records
         WHERE diagnosis LIKE $1 OR treatment LIKE $1 OR prescriptions LIKE $1 OR test_results LIKE $1`,
        [`${PLACEHOLDER_PREFIX}%`]
    );
    for (const row of rows) {
        const stripPrefix = (v) => (v && v.startsWith(PLACEHOLDER_PREFIX) ? v.slice(PLACEHOLDER_PREFIX.length) : v);

        const plainDiagnosis     = stripPrefix(row.diagnosis);
        const plainTreatment     = stripPrefix(row.treatment);
        const plainPrescriptions = stripPrefix(row.prescriptions);
        const plainTestResults   = stripPrefix(row.test_results);

        const encDiagnosis     = plainDiagnosis     ? encryptionService.encrypt(plainDiagnosis)     : null;
        const encTreatment     = plainTreatment     ? encryptionService.encrypt(plainTreatment)     : null;
        const encPrescriptions = plainPrescriptions ? encryptionService.encrypt(plainPrescriptions) : null;
        const encTestResults   = plainTestResults   ? encryptionService.encrypt(plainTestResults)   : null;

        const digitalSignature = plainPrescriptions
            ? signatureService.signPrescription({
                  prescriptions: plainPrescriptions,
                  patientId: row.patient_id,
                  doctorId: row.doctor_id,
                  recordDate: row.record_date.toISOString(),
              })
            : null;

        const checksum = signatureService.computeRecordChecksum({
            diagnosis: encDiagnosis, treatment: encTreatment,
            prescriptions: encPrescriptions, testResults: encTestResults,
            patientId: row.patient_id, doctorId: row.doctor_id,
        });

        await query(
            `UPDATE medical_records
             SET diagnosis = $1, treatment = $2, prescriptions = $3, test_results = $4,
                 digital_signature = $5, checksum = $6
             WHERE id = $7`,
            [encDiagnosis, encTreatment, encPrescriptions, encTestResults, digitalSignature, checksum, row.id]
        );
        console.log(`[medical_records] ${row.id}: re-encrypted clinical fields + regenerated signature/checksum`);
    }
}

async function fixInsuranceClaims() {
    const { rows } = await query(
        `SELECT id, claim_details FROM insurance_claims WHERE claim_details LIKE $1`,
        [`${PLACEHOLDER_PREFIX}%`]
    );
    for (const row of rows) {
        const plaintext = row.claim_details.slice(PLACEHOLDER_PREFIX.length);
        const ciphertext = encryptionService.encrypt(plaintext);
        await query(`UPDATE insurance_claims SET claim_details = $1 WHERE id = $2`, [ciphertext, row.id]);
        console.log(`[insurance_claims] ${row.id}: re-encrypted claim_details`);
    }
}

async function fixSeedEncryption() {
    await fixPatients();
    await fixMedicalRecords();
    await fixInsuranceClaims();
}

module.exports = { fixSeedEncryption, fixPatients, fixMedicalRecords, fixInsuranceClaims };

// Runnable standalone: `node backend/db/fix_seed_encryption.js`
if (require.main === module) {
    fixSeedEncryption()
        .then(() => {
            console.log('Done.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('Repair failed:', err);
            process.exit(1);
        });
}
