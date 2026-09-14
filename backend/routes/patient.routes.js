'use strict';

const express = require('express');
const router = express.Router();

const patientController = require('../controllers/patient.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requirePatient } = require('../middleware/authorize');
const { validateConsent, validateUuidRouteParam } = require('../middleware/validate');

// All patient routes require a valid session
router.use(requireMfaComplete);
router.use(requirePatient);

// GET /api/v1/patient/profile
router.get('/profile', patientController.getMyProfile);

// GET /api/v1/patient/records — own medical records (UC-04)
router.get('/records', patientController.getMyMedicalRecords);

// GET /api/v1/patient/consents — list granted consents (AUTHZ-05)
router.get('/consents', patientController.getMyConsents);

// POST /api/v1/patient/consents — grant consent to a doctor
router.post('/consents', validateConsent, patientController.grantConsent);

// DELETE /api/v1/patient/consents/:doctorId — revoke consent
router.delete('/consents/:doctorId', validateUuidRouteParam('doctorId'), patientController.revokeConsent);

module.exports = router;
