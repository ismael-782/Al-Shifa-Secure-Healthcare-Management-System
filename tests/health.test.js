'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, loginAs } = require('./helpers');

describe('Health Check', () => {
    it('requires admin + MFA', async () => {
        const { agent } = await loginAs('patient');
        const res = await agent.get('/api/v1/health');
        assert.equal(res.status, 403);
    });

    it('is unreachable with no session at all', async () => {
        const res = await request(app).get('/api/v1/health');
        assert.equal(res.status, 401);
    });

    it('reports ok status + DB connectivity for admin', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/health');
        assert.equal(res.status, 200);
        assert.equal(res.body.database.status, 'ok');
    });
});

describe('Unknown routes / static app', () => {
    it('returns a clean 404 JSON for an unknown API route', async () => {
        const res = await request(app).get('/api/v1/does-not-exist');
        assert.equal(res.status, 404);
    });

    it('serves the frontend SPA shell for a non-API path', async () => {
        const res = await request(app).get('/some-client-route');
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /html/);
    });
});
