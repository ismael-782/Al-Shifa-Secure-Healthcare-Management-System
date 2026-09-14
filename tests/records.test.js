'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loginAs } = require('./helpers');

describe('Medical Records', () => {
    it('patient can view their own decrypted records', async () => {
        const { agent } = await loginAs('patient'); // patient_khalid — has a seeded record from dr_ahmad
        const res = await agent.get('/api/v1/patient/records');
        assert.equal(res.status, 200);
        assert.ok(res.body.records.length > 0);
        // Confirms the encryption-placeholder bug (see CLAUDE.md gotcha #2)
        // can't silently regress: this must be real decrypted text, not a
        // raw "ENCRYPTED_PLACEHOLDER_..." string or a thrown error.
        assert.ok(!res.body.records[0].diagnosis.includes('ENCRYPTED_PLACEHOLDER'));
    });

    it('doctor with active consent can view a patient record', async () => {
        const { agent } = await loginAs('doctor'); // dr_ahmad has consent for patient_khalid (seed.sql)
        const patients = await agent.get('/api/v1/doctor/patients');
        assert.equal(patients.status, 200);
        assert.ok(patients.body.patients.length > 0);

        const patientId = patients.body.patients[0].id;
        const records = await agent.get(`/api/v1/doctor/patients/${patientId}/records`);
        assert.equal(records.status, 200);
    });

    it('doctor without consent cannot view a patient’s records', async () => {
        // dr_fatima has no consent for patient_khalid in seed.sql
        const { agent } = await loginAs('doctor2');
        const res = await agent.get('/api/v1/doctor/patients/95a0716d-7c74-4cf2-a764-e4fd26909594/records');
        assert.equal(res.status, 403);
    });

    it('doctor can create a new record for a consented patient, and it round-trips through encryption', async () => {
        const { agent, csrfToken } = await loginAs('doctor');
        const patients = await agent.get('/api/v1/doctor/patients');
        const patientId = patients.body.patients[0].id;

        const create = await agent.post('/api/v1/records').set('X-CSRF-Token', csrfToken).send({
            patientId,
            diagnosis: 'Test diagnosis for automated suite',
            treatment: 'Test treatment plan',
            prescriptions: 'Test prescription 10mg daily',
            testResults: 'Test results within normal limits',
        });
        assert.equal(create.status, 201);

        const fetched = await agent.get(`/api/v1/records/${create.body.recordId}`);
        assert.equal(fetched.status, 200);
        assert.equal(fetched.body.record.diagnosis, 'Test diagnosis for automated suite');
        assert.ok(fetched.body.record.digital_signature); // INT-05 signature generated
    });

    it('a patient cannot create a medical record', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const res = await agent.post('/api/v1/records').set('X-CSRF-Token', csrfToken).send({
            patientId: '95a0716d-7c74-4cf2-a764-e4fd26909594',
            diagnosis: 'Should not be allowed',
        });
        assert.equal(res.status, 403);
    });

    it('a patient cannot view another patient’s record by guessing its ID', async () => {
        // This is patient_khalid's seeded record (seed.sql); patient2 (patient_aisha) is a different patient.
        const khalidsRecordId = 'e1b431e9-c8a8-44f9-b7c2-f43ec0080891';

        const { agent: otherPatient } = await loginAs('patient2');
        const res = await otherPatient.get(`/api/v1/records/${khalidsRecordId}`);
        assert.equal(res.status, 403);
    });
});
