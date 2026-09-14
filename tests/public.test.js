'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { app, request } = require('./helpers');

describe('Public (landing page) endpoints', () => {
    it('GET /api/v1/public/stats requires no auth and returns doctor name+specialty and a patient count only', async () => {
        const res = await request(app).get('/api/v1/public/stats');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.doctors));
        assert.ok(res.body.doctors.length > 0);

        const doctor = res.body.doctors[0];
        assert.ok(doctor.full_name);
        assert.ok(doctor.specialty);
        // Nothing beyond name/specialty should ever be exposed here (no id,
        // license_number, availability_schedule, etc. — see public.controller.js).
        assert.deepEqual(Object.keys(doctor).sort(), ['full_name', 'specialty']);

        assert.equal(typeof res.body.totalPatients, 'number');
        assert.ok(res.body.totalPatients >= 0);
    });

    it('GET / serves the landing page, not the login form', async () => {
        const res = await request(app).get('/');
        assert.equal(res.status, 200);
        assert.match(res.text, /Secure Healthcare Management/);
    });

    it('GET /index.html still serves the login form directly', async () => {
        const res = await request(app).get('/index.html');
        assert.equal(res.status, 200);
        assert.match(res.text, /login-form/);
    });
});
