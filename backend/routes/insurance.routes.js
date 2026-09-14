'use strict';

const express = require('express');
const router = express.Router();

const insuranceController = require('../controllers/insurance.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requireAdmin, requireRole } = require('../middleware/authorize');
const { validateInsuranceClaim, validateUuidParam } = require('../middleware/validate');
const { body } = require('express-validator');
const { handleValidationErrors } = require('../middleware/validate');

router.use(requireMfaComplete);

// POST /api/v1/insurance/claims — UC-06: admin submits claim
router.post('/claims', requireAdmin, validateInsuranceClaim, insuranceController.submitClaim);

// GET /api/v1/insurance/claims — list claims (admin: all; insurance_provider: pending)
router.get('/claims', requireRole('admin', 'insurance_provider'), insuranceController.listClaims);

// GET /api/v1/insurance/claims/:id
router.get('/claims/:id', validateUuidParam, requireRole('admin', 'insurance_provider'), insuranceController.getClaim);

// PUT /api/v1/insurance/claims/:id/process — insurance provider approves/rejects
router.put(
    '/claims/:id/process',
    validateUuidParam,
    requireRole('admin', 'insurance_provider'),
    [
        body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
        body('processorNotes').optional().trim().isLength({ max: 2000 }),
        handleValidationErrors,
    ],
    insuranceController.processClaim
);

module.exports = router;
