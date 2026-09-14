/**
 * Resets the isolated test-schema database (see .env.test / DB_SCHEMA) by
 * running backend/db/reset.js as a child process with the test env loaded.
 * Run as its own process (not required in-process) because reset.js calls
 * process.exit() when done, which would kill whatever required it.
 * Invoked automatically before `npm test` via the "pretest" script.
 */
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

// Real secrets first (local runs only — never committed), then test-only
// overrides on top. In CI, .env doesn't exist; DB credentials and dummy
// crypto secrets come from the workflow's step-level env vars instead.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

const result = spawnSync(
    process.execPath,
    [path.join(__dirname, '..', 'backend', 'db', 'reset.js')],
    { stdio: 'inherit', env: process.env }
);

process.exit(result.status ?? 1);
