'use strict';

const express = require('express');
const router = express.Router();

const healthController = require('../controllers/health.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');

// GET /api/v1/health — admin-only, AVL-05
router.get('/', requireMfaComplete, requireAdmin, healthController.healthCheck);

module.exports = router;
