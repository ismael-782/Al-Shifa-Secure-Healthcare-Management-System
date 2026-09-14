'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loginAs } = require('./helpers');

const DOCTOR_ID  = '1ba40875-a1e7-43dc-995f-b2b8d7b57321'; // dr_ahmad
const PATIENT_ID = '95a0716d-7c74-4cf2-a764-e4fd26909594'; // patient_khalid (patients.id, not users.id)

describe('Insurance Claims', () => {
    it('admin submits a claim using the correct patients.id and it round-trips through encryption', async () => {
        const { agent, csrfToken } = await loginAs('admin');
        const submit = await agent.post('/api/v1/insurance/claims').set('X-CSRF-Token', csrfToken).send({
            patientId: PATIENT_ID,
            doctorId: DOCTOR_ID,
            claimDetails: 'Automated test claim',
        });
        assert.equal(submit.status, 201);

        const view = await agent.get(`/api/v1/insurance/claims/${submit.body.claim.id}`);
        assert.equal(view.status, 200);
        assert.equal(view.body.claim.claim_details, 'Automated test claim');
    });

    it('rejects a claim submitted with a users.id instead of a patients.id (the original bug)', async () => {
        const { agent, csrfToken } = await loginAs('admin');
        const usersRes = await agent.get('/api/v1/admin/users');
        const khalidUserId = usersRes.body.users.find((u) => u.username === 'patient_khalid').id;

        const res = await agent.post('/api/v1/insurance/claims').set('X-CSRF-Token', csrfToken).send({
            patientId: khalidUserId, // wrong table's ID on purpose
            doctorId: DOCTOR_ID,
            claimDetails: 'Should fail',
        });
        assert.equal(res.status, 404);
        assert.match(res.body.error, /patient/i);
    });

    it('non-admin cannot submit a claim', async () => {
        const { agent, csrfToken } = await loginAs('doctor');
        const res = await agent.post('/api/v1/insurance/claims').set('X-CSRF-Token', csrfToken).send({
            patientId: PATIENT_ID, doctorId: DOCTOR_ID, claimDetails: 'Should be forbidden',
        });
        assert.equal(res.status, 403);
    });

    it('insurance provider can list and process a pending claim', async () => {
        const { agent: adminAgent, csrfToken: adminCsrf } = await loginAs('admin');
        const submit = await adminAgent.post('/api/v1/insurance/claims').set('X-CSRF-Token', adminCsrf).send({
            patientId: PATIENT_ID, doctorId: DOCTOR_ID, claimDetails: 'For provider processing',
        });
        const claimId = submit.body.claim.id;

        const { agent: insurerAgent, csrfToken: insurerCsrf } = await loginAs('insurer');
        const list = await insurerAgent.get('/api/v1/insurance/claims');
        assert.equal(list.status, 200);
        assert.ok(list.body.claims.some((c) => c.id === claimId));

        const process = await insurerAgent.put(`/api/v1/insurance/claims/${claimId}/process`)
            .set('X-CSRF-Token', insurerCsrf)
            .send({ status: 'approved' });
        assert.equal(process.status, 200);
    });
});
