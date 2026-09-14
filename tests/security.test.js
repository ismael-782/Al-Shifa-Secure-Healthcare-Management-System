'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, loginAs } = require('./helpers');

describe('Security — SQL injection', () => {
    it('a classic SQLi payload in the login form is treated as a literal, non-matching username', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({
            username: "admin' OR '1'='1",
            password: "anything' OR '1'='1",
        });
        // Must behave exactly like any other wrong login — not a 500, not a bypass.
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Invalid credentials');
    });

    it('an SQLi payload as a UUID route param is rejected by validation, never reaches the query', async () => {
        const { agent, csrfToken } = await loginAs('admin');
        const res = await agent
            .get(`/api/v1/insurance/claims/${encodeURIComponent("1' OR '1'='1")}`)
            .set('X-CSRF-Token', csrfToken);
        assert.equal(res.status, 400); // validator rejects it as "Invalid ID format", not a DB error
    });
});

describe('Security — XSS', () => {
    it('a script-tag payload in registration fields is accepted as literal text (escaped on render, not on write)', async () => {
        const username = `xss_test_${Date.now()}`;
        const res = await request(app).post('/api/v1/auth/register').send({
            username,
            email: `${username}@example.com`,
            password: 'Test@1234',
            fullName: '<script>alert(1)</script>',
            dateOfBirth: '1990-01-01',
        });
        assert.equal(res.status, 201);

        const { agent } = await loginAs({ username, password: 'Test@1234' });
        const profile = await agent.get('/api/v1/patient/profile');
        // The API returns raw data (that's correct — it's not HTML); the
        // frontend's escapeHtml() is what neutralizes it at render time
        // (see SECURITY.md). This assertion just confirms the payload
        // round-trips intact rather than being silently mangled or
        // breaking the JSON response.
        assert.equal(profile.body.full_name, '<script>alert(1)</script>');
    });

    it('doctor availability rejects non-time-slot values (the fix for the stored-XSS in the booking page)', async () => {
        const { agent, csrfToken } = await loginAs('doctor');
        const res = await agent
            .put('/api/v1/doctor/availability')
            .set('X-CSRF-Token', csrfToken)
            .send({ availabilitySchedule: { Monday: ['<img src=x onerror=alert(1)>'] } });
        assert.equal(res.status, 400);
    });

    it('doctor availability rejects unknown "day" keys too', async () => {
        const { agent, csrfToken } = await loginAs('doctor');
        const res = await agent
            .put('/api/v1/doctor/availability')
            .set('X-CSRF-Token', csrfToken)
            .send({ availabilitySchedule: { '<script>': ['09:00'] } });
        assert.equal(res.status, 400);
    });

    it('a valid availability update still works', async () => {
        const { agent, csrfToken } = await loginAs('doctor2');
        const res = await agent
            .put('/api/v1/doctor/availability')
            .set('X-CSRF-Token', csrfToken)
            .send({ availabilitySchedule: { Monday: ['10:00', '11:00'] } });
        assert.equal(res.status, 200);
    });
});

describe('Security — CSRF', () => {
    it('rejects a state-changing request with no CSRF token', async () => {
        const { agent } = await loginAs('patient2');
        const res = await agent.post('/api/v1/patient/consents').send({ doctorId: '1ba40875-a1e7-43dc-995f-b2b8d7b57321' });
        assert.equal(res.status, 403);
        assert.match(res.body.error, /CSRF/i);
    });

    it('rejects a state-changing request with a wrong/forged CSRF token', async () => {
        const { agent } = await loginAs('patient2');
        const res = await agent
            .post('/api/v1/patient/consents')
            .set('X-CSRF-Token', 'not-the-real-token')
            .send({ doctorId: '1ba40875-a1e7-43dc-995f-b2b8d7b57321' });
        assert.equal(res.status, 403);
    });

    it('accepts a state-changing request with the correct token', async () => {
        const { agent, csrfToken } = await loginAs('patient2');
        const res = await agent
            .post('/api/v1/patient/consents')
            .set('X-CSRF-Token', csrfToken)
            .send({ doctorId: '1ba40875-a1e7-43dc-995f-b2b8d7b57321' });
        assert.equal(res.status, 200);
    });

    it('GET requests need no CSRF token', async () => {
        const { agent } = await loginAs('patient2');
        const res = await agent.get('/api/v1/patient/profile');
        assert.equal(res.status, 200);
    });
});

describe('Security — input validation', () => {
    it('rejects a non-UUID doctorId when booking an appointment', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const res = await agent
            .post('/api/v1/appointments')
            .set('X-CSRF-Token', csrfToken)
            .send({ doctorId: 'not-a-uuid', appointmentTime: '2027-01-01T09:00:00' });
        assert.equal(res.status, 400);
        assert.match(res.body.error, /doctor/i);
    });

    it('rejects an appointment time in the past', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const res = await agent
            .post('/api/v1/appointments')
            .set('X-CSRF-Token', csrfToken)
            .send({ doctorId: '1ba40875-a1e7-43dc-995f-b2b8d7b57321', appointmentTime: '2020-01-01T09:00:00' });
        assert.equal(res.status, 400);
    });

    it('rejects a malformed UUID route param (e.g. revoking consent)', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const res = await agent
            .delete('/api/v1/patient/consents/not-a-uuid')
            .set('X-CSRF-Token', csrfToken);
        assert.equal(res.status, 400);
    });

    it('unauthenticated requests to protected routes are rejected, not just filtered', async () => {
        const res = await request(app).get('/api/v1/patient/profile');
        assert.equal(res.status, 401);
    });
});
