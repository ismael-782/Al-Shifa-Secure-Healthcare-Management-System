/**
 * As-Shifa Secure Healthcare Management System — Express Server
 *
 * Security stack applied at startup:
 *  - helmet:           HTTP security headers (XSS protection, HSTS, etc.)
 *  - cors:             Restrict origins to configured frontend domain
 *  - express-session:  httpOnly, secure, sameSite cookie-based sessions
 *  - rate limiting:    Applied per-router (see rateLimiter middleware)
 *  - global error handler: Never leaks stack traces to clients (AVL-04)
 */
'use strict';

require('dotenv').config();

const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const session  = require('express-session');
const path     = require('path');

const securityConfig  = require('./config/security');
const { requestAuditLogger } = require('./middleware/auditLogger');
const { apiLimiter }  = require('./middleware/rateLimiter');
const { requireCsrfToken } = require('./middleware/csrf');

// ── Route Modules ─────────────────────────────────────────────────────────
const authRoutes        = require('./routes/auth.routes');
const patientRoutes     = require('./routes/patient.routes');
const doctorRoutes      = require('./routes/doctor.routes');
const adminRoutes       = require('./routes/admin.routes');
const appointmentRoutes = require('./routes/appointment.routes');
const recordsRoutes     = require('./routes/records.routes');
const insuranceRoutes   = require('./routes/insurance.routes');
const healthRoutes      = require('./routes/health.routes');
const publicRoutes      = require('./routes/public.routes');

const app = express();

// ── Security Headers (helmet) ─────────────────────────────────────────────
// Applies CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc:     process.env.NODE_ENV === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            scriptSrcAttr: process.env.NODE_ENV === 'production' ? ["'none'"] : ["'unsafe-inline'"], // inline onclick handlers need this in dev
            styleSrc:   ["'self'", "'unsafe-inline'"], // CSS variables require inline styles
            imgSrc:     ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc:    ["'self'"],
            objectSrc:  ["'none'"],
            frameSrc:   ["'none'"],
            frameAncestors: ["'none'"], // clickjacking: this app may never be framed by anyone, including itself
        },
    },
    hsts: {
        maxAge: 31536000,          // 1 year
        includeSubDomains: true,
        preload: true,
    },
    frameguard: { action: 'deny' }, // X-Frame-Options fallback for browsers that ignore frame-ancestors
}));

// ── CORS ──────────────────────────────────────────────────────────────────
// Restrict to the configured frontend origin; allow credentials (cookies).
const allowedOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept'],
}));

// ── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));      // Prevent large-payload DoS
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ── Session (CONF-05, AUTH) ───────────────────────────────────────────────
app.use(session(securityConfig.session));

// ── Trust Proxy (for accurate IP addresses behind nginx/load balancer) ───
app.set('trust proxy', 1);

// ── Serve Static Frontend Files ───────────────────────────────────────────
// index:false — "/" is handled explicitly below (landing page) instead of
// static's default auto-serving frontend/index.html for it. Every named
// file (including /index.html, the actual login form) is unaffected.
app.use(express.static(path.join(__dirname, '..', 'frontend'), { index: false }));

// ── Audit Logger Middleware (AUD-01) ──────────────────────────────────────
// Must come after session middleware so req.session.userId is available.
app.use(requestAuditLogger);

// ── General API Rate Limiter (AVL-03) ────────────────────────────────────
app.use('/api/', apiLimiter);

// ── CSRF Protection ────────────────────────────────────────────────────────
// Requires a matching X-CSRF-Token header on state-changing requests for any
// session that has one issued (see middleware/csrf.js).
app.use('/api/', requireCsrfToken);

// ── API Routes (/api/v1/...) ──────────────────────────────────────────────
app.use('/api/v1/auth',         authRoutes);
app.use('/api/v1/patient',      patientRoutes);
app.use('/api/v1/doctor',       doctorRoutes);
app.use('/api/v1/admin',        adminRoutes);
app.use('/api/v1/appointments', appointmentRoutes);
app.use('/api/v1/records',      recordsRoutes);
app.use('/api/v1/insurance',    insuranceRoutes);
app.use('/api/v1/health',       healthRoutes);
app.use('/api/v1/public',       publicRoutes);

// ── Home page ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'landing.html'));
});

// ── Catch-all: serve frontend SPA for non-API routes ─────────────────────
app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ── 404 Handler for unknown API routes ───────────────────────────────────
app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// ── Global Error Handler (AVL-04) ────────────────────────────────────────
// Catches any unhandled errors from route handlers.
// NEVER returns stack traces or internal details to the client.
app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    console.error(`[GlobalErrorHandler] ${req.method} ${req.originalUrl}:`, err.message);

    // Only log full stack in development
    if (process.env.NODE_ENV === 'development') {
        console.error(err.stack);
    }

    return res.status(statusCode).json({ error: 'An unexpected error occurred' });
});

// ── Start Server ──────────────────────────────────────────────────────────
// Only bind a real port when this file is run directly (`node backend/server.js`
// / `npm start`) — not when it's `require()`d, e.g. by the test suite, which
// drives the app in-process via supertest and starts its own ephemeral listener.
if (require.main === module) {
    const PORT = parseInt(process.env.PORT, 10) || 3000;
    app.listen(PORT, () => {
        console.log(`[As-Shifa] Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
        console.log(`[As-Shifa] API base: http://localhost:${PORT}/api/v1`);
    });
}

module.exports = app; // for testing
