'use strict';

const express = require('express');
const router = express.Router();

const doctorController = require('../controllers/doctor.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requireDoctor, requireAnyRole } = require('../middleware/authorize');
const { validateUuidRouteParam, validateAvailabilitySchedule } = require('../middleware/validate');

// Public-ish: any logged-in user can list doctors (for booking appointments)
router.get('/list', requireMfaComplete, requireAnyRole, doctorController.listAllDoctors);

// All doctor-management routes require doctor role + MFA
router.use(requireMfaComplete);
router.use(requireDoctor);

// GET /api/v1/doctor/profile
router.get('/profile', doctorController.getMyProfile);

// GET /api/v1/doctor/patients — assigned (consented) patients (AUTHZ-02)
router.get('/patients', doctorController.getAssignedPatients);

// GET /api/v1/doctor/patients/:patientId/records — UC-04 (doctor view)
router.get('/patients/:patientId/records', validateUuidRouteParam('patientId'), doctorController.getPatientRecords);

// PUT /api/v1/doctor/availability
router.put('/availability', validateAvailabilitySchedule, doctorController.updateAvailability);

module.exports = router;
