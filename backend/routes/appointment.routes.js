'use strict';

const express = require('express');
const router = express.Router();

const appointmentController = require('../controllers/appointment.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requirePatient, requireDoctor, requireAdmin } = require('../middleware/authorize');
const { validateAppointment, validateUuidParam } = require('../middleware/validate');

router.use(requireMfaComplete);

// POST /api/v1/appointments — UC-03: patient books appointment
router.post('/', requirePatient, validateAppointment, appointmentController.bookAppointment);

// GET /api/v1/appointments/my — patient's own appointments
router.get('/my', requirePatient, appointmentController.getMyAppointments);

// GET /api/v1/appointments/doctor — doctor's schedule
router.get('/doctor', requireDoctor, appointmentController.getDoctorAppointments);

// GET /api/v1/appointments/all — admin view of all appointments
router.get('/all', requireAdmin, appointmentController.getAllAppointments);

// DELETE /api/v1/appointments/:id — cancel appointment
router.delete('/:id', validateUuidParam, appointmentController.cancelAppointment);

module.exports = router;
