/**
 * Rate Limiting Middleware
 * AVL-03: Max 10 requests/minute on auth endpoints to prevent brute force.
 * AUTH-04: Complements account lockout by limiting request volume.
 */
'use strict';

const rateLimit = require('express-rate-limit');
const { rateLimit: cfg } = require('../config/security');

/**
 * Strict limiter for authentication and registration endpoints.
 * Returns a generic 429 without revealing server internals.
 */
const authLimiter = rateLimit({
    windowMs: cfg.windowMs,   // Default: 60 seconds
    max: cfg.max,             // Default: 10 requests per window
    standardHeaders: true,    // Send RateLimit-* headers
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    skipSuccessfulRequests: false, // Count ALL requests, not just failures
});

/**
 * Looser limiter for general API endpoints.
 * Protects against accidental DDoS without blocking normal usage.
 */
const apiLimiter = rateLimit({
    windowMs: cfg.windowMs,
    max: cfg.max * 10, // 100 req/min for general API
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded. Please slow down.' },
    skipSuccessfulRequests: true,
});

module.exports = { authLimiter, apiLimiter };
