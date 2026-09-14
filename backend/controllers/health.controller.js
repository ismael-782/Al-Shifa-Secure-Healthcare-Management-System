/**
 * Health Controller
 * AVL-05: GET /api/v1/health — system uptime and DB connectivity status.
 * Admin-only endpoint to avoid leaking infrastructure details.
 */
'use strict';

const { pool } = require('../config/db');

const startTime = Date.now();

async function healthCheck(req, res) {
    let dbStatus = 'ok';
    let dbLatencyMs = null;

    try {
        const t0 = Date.now();
        await pool.query('SELECT 1');
        dbLatencyMs = Date.now() - t0;
    } catch (err) {
        dbStatus = 'error';
        console.error('[Health] DB check failed:', err.message);
    }

    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

    return res.status(dbStatus === 'ok' ? 200 : 503).json({
        status: dbStatus === 'ok' ? 'healthy' : 'degraded',
        uptime_seconds: uptimeSeconds,
        database: {
            status: dbStatus,
            latency_ms: dbLatencyMs,
        },
        timestamp: new Date().toISOString(),
    });
}

module.exports = { healthCheck };
