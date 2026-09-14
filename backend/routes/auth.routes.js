'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { authLimiter } = require('../middleware/rateLimiter');
const { validateRegister, validateLogin, validateMfa } = require('../middleware/validate');

// POST /api/v1/auth/register — UC-01 (AVL-03 rate limited)
router.post('/register', authLimiter, validateRegister, authController.register);

// POST /api/v1/auth/login — UC-02 step 1 (AVL-03 rate limited)
router.post('/login', authLimiter, validateLogin, authController.login);

// POST /api/v1/auth/mfa — UC-02 step 2 MFA verification
router.post('/mfa', authLimiter, validateMfa, authController.verifyMfa);

// POST /api/v1/auth/logout
router.post('/logout', authController.logout);

// GET /api/v1/auth/status — check session state (used by frontend on load)
router.get('/status', authController.sessionStatus);

module.exports = router;
