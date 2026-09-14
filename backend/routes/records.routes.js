'use strict';

const express = require('express');
const router = express.Router();

const recordsController = require('../controllers/records.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requireDoctorOrAdmin, requireRole } = require('../middleware/authorize');
const { validateMedicalRecord, validateUuidParam } = require('../middleware/validate');

router.use(requireMfaComplete);

// GET /api/v1/records/:id — UC-04: view record (patient, doctor w/consent, admin)
router.get('/:id', validateUuidParam, recordsController.getRecord);

// POST /api/v1/records — UC-05: create or update record (doctor only, INT-01)
router.post('/', requireDoctorOrAdmin, validateMedicalRecord, recordsController.createOrUpdateRecord);

// GET /api/v1/records/:id/history — view version history (doctor, admin)
router.get('/:id/history', validateUuidParam, requireDoctorOrAdmin, recordsController.getRecordHistory);

module.exports = router;
