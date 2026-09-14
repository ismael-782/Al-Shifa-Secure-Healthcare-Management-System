'use strict';

const express = require('express');
const router = express.Router();

const publicController = require('../controllers/public.controller');

// GET /api/v1/public/stats — landing page data (no auth required)
router.get('/stats', publicController.getPublicStats);

module.exports = router;
