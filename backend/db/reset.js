/**
 * One-command, portable database reset.
 *
 * `npm run db:reset` used to shell out to `psql $DATABASE_URL -f ...`, which
 * needs `psql` on PATH and a POSIX-style shell to expand $DATABASE_URL —
 * neither holds by default on Windows (npm's default script-shell there is
 * cmd.exe, which doesn't expand $VARS and don't put psql on PATH). It also
 * left a manual step (re-encrypting seed data — see fix_seed_encryption.js)
 * that was easy to forget after a reset, which is exactly what broke
 * "view medical record" after the first reset of this DB.
 *
 * This script does the whole pipeline in one Node process, using the same
 * `pg` driver and .env config the app itself uses, so it works the same way
 * regardless of OS/shell and can never skip the encryption-repair step:
 *   1. drop all app tables/types/functions (reset_tables.sql)
 *   2. rebuild schema (schema.sql)
 *   3. load seed data (seed.sql)
 *   4. re-encrypt/re-sign the placeholder seed fields (fix_seed_encryption.js)
 *
 * Schema isolation (DB_SCHEMA, e.g. from .env.test): when set, everything
 * above runs against a dedicated Postgres *schema* inside the same database
 * rather than `public` — this is how the test suite gets its own sandbox
 * without needing CREATEDB privileges for a separate database. The drop
 * step deliberately runs with search_path set to ONLY that schema (no
 * `public` fallback), so an unqualified `DROP TABLE IF EXISTS users` can
 * never resolve to — and destroy — the real dev/demo `public.users`, even
 * on the very first run before the isolated schema has any tables of its
 * own yet. `public` is added back afterward only so schema.sql's
 * `gen_random_uuid()` column defaults can resolve pgcrypto's function
 * (installed in `public`).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const { pool: appPool } = require('../config/db');
const { fixSeedEncryption } = require('./fix_seed_encryption');

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function readSql(filename) {
    return fs.readFileSync(path.join(__dirname, filename), 'utf8');
}

async function main() {
    const schema = process.env.DB_SCHEMA;
    if (schema && !VALID_IDENTIFIER.test(schema)) {
        throw new Error(`Invalid DB_SCHEMA value: ${schema}`);
    }

    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        database: process.env.DB_NAME || 'asshifa_db',
        user: process.env.DB_USER || 'asshifa_user',
        password: process.env.DB_PASSWORD,
    });
    await client.connect();

    try {
        if (schema) {
            console.log(`--- isolating to schema "${schema}" (dev/demo data in "public" is untouched) ---`);
            await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
            await client.query(`SET search_path TO "${schema}"`); // no "public" — drop step can only ever hit our own schema
        }

        console.log('--- drop existing objects ---');
        await client.query(readSql('reset_tables.sql'));

        if (schema) {
            await client.query(`SET search_path TO "${schema}", public`); // public back for gen_random_uuid() defaults
        }

        console.log('--- apply schema ---');
        await client.query(readSql('schema.sql'));

        console.log('--- load seed data ---');
        await client.query(readSql('seed.sql'));
    } finally {
        await client.end();
    }

    console.log('--- re-encrypt/re-sign placeholder seed fields ---');
    await fixSeedEncryption(); // uses config/db.js's pool, which already applies DB_SCHEMA via poolConfig.options

    console.log('Database reset complete.');
}

main()
    .then(() => appPool.end())
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('DB reset failed:', err);
        appPool.end().finally(() => process.exit(1));
    });
