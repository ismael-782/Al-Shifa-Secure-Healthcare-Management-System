'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, DEMO, loginAs, captureConsole, extractOtp } = require('./helpers');

describe('Auth — registration', () => {
    it('registers a new patient successfully', async () => {
        const username = `test_user_${Date.now()}`;
        const res = await request(app).post('/api/v1/auth/register').send({
            username,
            email: `${username}@example.com`,
            password: 'Test@1234',
            fullName: 'Test User',
            dateOfBirth: '1990-01-01',
        });
        assert.equal(res.status, 201);

        // and can immediately log in with it
        const login = await request(app).post('/api/v1/auth/login').send({ username, password: 'Test@1234' });
        assert.equal(login.status, 200);
        assert.equal(login.body.role, 'patient');
    });

    it('rejects a duplicate username', async () => {
        const res = await request(app).post('/api/v1/auth/register').send({
            username: 'patient_khalid', // already exists in seed data
            email: 'someoneelse@example.com',
            password: 'Test@1234',
            fullName: 'Someone Else',
            dateOfBirth: '1990-01-01',
        });
        assert.equal(res.status, 409);
    });

    it('rejects a weak password', async () => {
        const res = await request(app).post('/api/v1/auth/register').send({
            username: `weak_${Date.now()}`,
            email: `weak_${Date.now()}@example.com`,
            password: 'abc123', // no uppercase/special char, too short-ish
            fullName: 'Weak Pw',
            dateOfBirth: '1990-01-01',
        });
        assert.equal(res.status, 400);
    });
});

describe('Auth — login', () => {
    it('logs a patient in directly (no MFA)', async () => {
        const { role } = await loginAs('patient');
        assert.equal(role, 'patient');
    });

    it('requires MFA for doctor and admin roles', async () => {
        const doctor = await loginAs('doctor');
        assert.equal(doctor.role, 'doctor');
        const admin = await loginAs('admin');
        assert.equal(admin.role, 'admin');
    });

    it('rejects a wrong password with a generic error', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ username: 'patient_khalid', password: 'wrong-password' });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Invalid credentials');
    });

    it('rejects an unknown username with the same generic error (no user enumeration)', async () => {
        const res = await request(app).post('/api/v1/auth/login').send({ username: 'no_such_user_xyz', password: 'whatever' });
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Invalid credentials');
    });

    it('rejects a malformed/expired MFA code', async () => {
        const agent = request.agent(app);
        const res = await agent.post('/api/v1/auth/login').send(DEMO.doctor2);
        assert.equal(res.body.mfaRequired, true);
        const bad = await agent.post('/api/v1/auth/mfa').send({ otp: '000000' });
        assert.equal(bad.status, 400);
    });

    it('locks the account after 5 consecutive failed attempts (AUTH-04)', async () => {
        // Uses a disposable registered account so we don't lock a shared demo login.
        const username = `lockout_test_${Date.now()}`;
        await request(app).post('/api/v1/auth/register').send({
            username,
            email: `${username}@example.com`,
            password: 'Test@1234',
            fullName: 'Lockout Test',
            dateOfBirth: '1990-01-01',
        });

        let last;
        for (let i = 0; i < 5; i++) {
            last = await request(app).post('/api/v1/auth/login').send({ username, password: 'wrong-password' });
        }
        assert.equal(last.status, 423);

        // Even the correct password is now rejected.
        const stillLocked = await request(app).post('/api/v1/auth/login').send({ username, password: 'Test@1234' });
        assert.equal(stillLocked.status, 423);
    });
});

describe('Auth — session status & logout', () => {
    it('reports unauthenticated with no session', async () => {
        const res = await request(app).get('/api/v1/auth/status');
        assert.equal(res.body.authenticated, false);
    });

    it('reports authenticated + role + csrfToken after login', async () => {
        const { agent } = await loginAs('patient');
        const res = await agent.get('/api/v1/auth/status');
        assert.equal(res.body.authenticated, true);
        assert.equal(res.body.role, 'patient');
        assert.ok(res.body.csrfToken);
    });

    it('logout destroys the session', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const logout = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken);
        assert.equal(logout.status, 200);
        const status = await agent.get('/api/v1/auth/status');
        assert.equal(status.body.authenticated, false);
    });
});
