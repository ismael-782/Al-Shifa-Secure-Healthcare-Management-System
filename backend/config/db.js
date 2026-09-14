/**
 * PostgreSQL Connection Pool Configuration
 * Uses environment variables to avoid hardcoded credentials (CONF-02).
 * Pool reuse prevents connection exhaustion under load (AVL-01).
 */
'use strict';

const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME     || 'asshifa_db',
    user:     process.env.DB_USER     || 'asshifa_user',
    password: process.env.DB_PASSWORD,
    max: 20,                  // max pool connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: true }
        : false,
};

// Optional schema isolation (used by the test suite — see .env.test /
// DB_SCHEMA — to keep test data out of the dev/demo `public` schema
// without needing CREATEDB privileges for a whole separate database).
// `public` stays in the path as a fallback so extension functions
// (e.g. pgcrypto's gen_random_uuid()) installed there remain visible.
if (process.env.DB_SCHEMA) {
    poolConfig.options = `-c search_path=${process.env.DB_SCHEMA},public`;
}

const pool = new Pool(poolConfig);

// Emit pool-level errors so the process doesn't silently lose DB access
pool.on('error', (err) => {
    console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Convenience query helper — always uses parameterized queries (INT-03).
 * Callers must NEVER interpolate user data into the query string.
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client for multi-statement transactions.
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
