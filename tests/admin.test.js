'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loginAs } = require('./helpers');

describe('Admin', () => {
    it('lists users', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/admin/users');
        assert.equal(res.status, 200);
        assert.ok(res.body.users.some((u) => u.username === 'patient_khalid'));
    });

    it('lists patients with the correct patients.id (not users.id) — the fix for the claim-submission bug', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/admin/patients');
        assert.equal(res.status, 200);
        const khalid = res.body.patients.find((p) => p.username === 'patient_khalid');
        assert.ok(khalid);
        assert.equal(khalid.id, '95a0716d-7c74-4cf2-a764-e4fd26909594'); // patients.id from seed.sql, not users.id
    });

    it('non-admin roles cannot reach admin endpoints', async () => {
        const { agent } = await loginAs('doctor');
        const res = await agent.get('/api/v1/admin/users');
        assert.equal(res.status, 403);
    });

    it('unlocks a locked account', async () => {
        // Lock a disposable account first.
        const username = `admin_unlock_test_${Date.now()}`;
        const { app, request } = require('./helpers');
        await request(app).post('/api/v1/auth/register').send({
            username, email: `${username}@example.com`, password: 'Test@1234',
            fullName: 'Unlock Test', dateOfBirth: '1990-01-01',
        });
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/v1/auth/login').send({ username, password: 'wrong' });
        }
        const locked = await request(app).post('/api/v1/auth/login').send({ username, password: 'Test@1234' });
        assert.equal(locked.status, 423);

        const { agent, csrfToken } = await loginAs('admin');
        const usersRes = await agent.get('/api/v1/admin/users');
        const targetId = usersRes.body.users.find((u) => u.username === username).id;

        const unlock = await agent.put(`/api/v1/admin/users/${targetId}/unlock`).set('X-CSRF-Token', csrfToken);
        assert.equal(unlock.status, 200);

        const retryLogin = await request(app).post('/api/v1/auth/login').send({ username, password: 'Test@1234' });
        assert.equal(retryLogin.status, 200);
    });

    it('views audit logs', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/admin/audit-logs');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.logs));
        assert.ok(res.body.total >= res.body.logs.length);
    });

    it('views security alerts', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/admin/security-alerts');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.lockedAccounts));
    });
});
