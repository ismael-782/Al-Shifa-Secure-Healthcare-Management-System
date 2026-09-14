/**
 * Shared test helpers.
 *
 * The app is driven in-process via supertest (no real port bound — see the
 * require.main guard in backend/server.js), so we can capture the MFA OTP
 * by temporarily intercepting console.log around a login call instead of
 * needing a real mailbox — see the mfa.service.js dev-mode behavior.
 */
'use strict';

// Load real secrets (DB password, SESSION_SECRET, etc. — never committed)
// from .env FIRST if present (local runs), then .env.test on top for
// test-only overrides (dotenv never overwrites a var that's already set).
// In CI there is no .env; DB credentials and dummy crypto secrets instead
// come from .github/workflows/ci.yml's step-level env vars. Must happen
// before anything requires backend/config/db.js (or server.js, which
// pulls it in transitively).
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

const request = require('supertest');
const app = require('../backend/server');

const DEMO = {
    admin:   { username: 'admin_sara',     password: 'Admin@1234' },
    doctor:  { username: 'dr_ahmad',       password: 'Doctor@1234' },
    doctor2: { username: 'dr_fatima',      password: 'Doctor@1234' },
    patient: { username: 'patient_khalid', password: 'Patient@1234' },
    patient2:{ username: 'patient_aisha',  password: 'Patient@1234' },
    insurer: { username: 'insure_noor',    password: 'Insure@1234' },
};

/** Runs fn() while capturing anything written via console.log; returns the captured lines. */
async function captureConsole(fn) {
    const lines = [];
    const original = console.log;
    console.log = (...args) => { lines.push(args.join(' ')); original.apply(console, args); };
    try {
        await fn();
    } finally {
        console.log = original;
    }
    return lines;
}

function extractOtp(lines) {
    for (const line of lines) {
        const m = line.match(/\[MFA DEV\] OTP for .*?:\s*(\d{6})/);
        if (m) return m[1];
    }
    return null;
}

/**
 * Logs in as one of the DEMO accounts (or {username,password}) on a fresh
 * supertest agent (so the session cookie persists across calls), completes
 * MFA automatically if required, and returns { agent, csrfToken, role }.
 */
async function loginAs(userOrKey) {
    const creds = typeof userOrKey === 'string' ? DEMO[userOrKey] : userOrKey;
    const agent = request.agent(app);

    let res;
    const lines = await captureConsole(async () => {
        res = await agent.post('/api/v1/auth/login').send(creds);
    });

    if (res.status !== 200) {
        throw new Error(`login failed for ${creds.username}: ${res.status} ${JSON.stringify(res.body)}`);
    }

    if (res.body.mfaRequired) {
        const otp = extractOtp(lines);
        if (!otp) throw new Error(`no OTP captured from console for ${creds.username}`);
        const mfaRes = await agent.post('/api/v1/auth/mfa').send({ otp });
        if (mfaRes.status !== 200) {
            throw new Error(`mfa verify failed for ${creds.username}: ${mfaRes.status} ${JSON.stringify(mfaRes.body)}`);
        }
        return { agent, csrfToken: mfaRes.body.csrfToken, role: mfaRes.body.role };
    }

    return { agent, csrfToken: res.body.csrfToken, role: res.body.role };
}

/** supertest's agent methods (post/put/delete) don't take custom headers as
 *  fluently as plain requests when chained with .send(); this wraps that. */
function withCsrf(req, csrfToken) {
    return req.set('X-CSRF-Token', csrfToken);
}

module.exports = { app, request, DEMO, loginAs, withCsrf, captureConsole, extractOtp };
