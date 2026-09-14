/**
 * Input Validation Middleware — express-validator rule sets
 * INT-03: All user inputs validated and sanitized server-side.
 * Parameterized queries elsewhere prevent SQL injection; this catches
 * format violations before they reach business logic.
 */
'use strict';

const { body, param, query, validationResult } = require('express-validator');
const { passwordPolicy } = require('../config/security');

/**
 * Middleware: run after validator chains.
 * Returns 400 with first error message if validation fails.
 * Never exposes internal field names in production.
 */
function handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
}

// ── Validation Rule Sets ──────────────────────────────────────

const validateRegister = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 50 }).withMessage('Username must be 3–50 characters')
        .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username may only contain letters, numbers, underscores'),

    body('email')
        .trim()
        .isEmail().withMessage('Valid email required')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(passwordPolicy).withMessage('Password must contain uppercase, lowercase, number, and special character'),

    body('fullName')
        .trim()
        .isLength({ min: 2, max: 255 }).withMessage('Full name required'),

    body('dateOfBirth')
        .isISO8601().withMessage('Valid date of birth required (YYYY-MM-DD)')
        .isBefore(new Date().toISOString()).withMessage('Date of birth must be in the past'),

    body('contactPhone')
        .optional()
        .trim()
        .isLength({ max: 50 }),

    body('contactAddress')
        .optional()
        .trim()
        .isLength({ max: 500 }),

    body('insuranceProviderName')
        .optional()
        .trim()
        .isLength({ max: 255 }),

    body('insurancePolicyNumber')
        .optional()
        .trim()
        .isLength({ max: 100 }),

    handleValidationErrors,
];

const validateLogin = [
    body('username')
        .trim()
        .notEmpty().withMessage('Username required')
        .isLength({ max: 50 }),

    body('password')
        .notEmpty().withMessage('Password required')
        .isLength({ max: 200 }),

    handleValidationErrors,
];

const validateMfa = [
    body('otp')
        .trim()
        .isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits')
        .isNumeric().withMessage('OTP must be numeric'),

    handleValidationErrors,
];

const validateAppointment = [
    body('doctorId')
        .trim()
        .isUUID().withMessage('Valid doctor ID required'),

    body('appointmentTime')
        .isISO8601().withMessage('Valid appointment time required')
        .isAfter(new Date().toISOString()).withMessage('Appointment must be in the future'),

    handleValidationErrors,
];

const validateMedicalRecord = [
    body('patientId')
        .trim()
        .isUUID().withMessage('Valid patient ID required'),

    body('diagnosis')
        .optional()
        .trim()
        .isLength({ max: 5000 }),

    body('treatment')
        .optional()
        .trim()
        .isLength({ max: 5000 }),

    body('prescriptions')
        .optional()
        .trim()
        .isLength({ max: 5000 }),

    body('testResults')
        .optional()
        .trim()
        .isLength({ max: 10000 }),

    handleValidationErrors,
];

const validateInsuranceClaim = [
    body('patientId')
        .trim()
        .isUUID().withMessage('Valid patient ID required'),

    body('doctorId')
        .trim()
        .isUUID().withMessage('Valid doctor ID required'),

    body('appointmentId')
        .optional()
        .trim()
        .isUUID().withMessage('Valid appointment ID required'),

    body('claimDetails')
        .trim()
        .notEmpty().withMessage('Claim details required')
        .isLength({ max: 10000 }),

    handleValidationErrors,
];

const validateUuidParam = [
    param('id')
        .isUUID().withMessage('Invalid ID format'),

    handleValidationErrors,
];

/**
 * Factory: validates an arbitrary :paramName route param as a UUID.
 * (validateUuidParam above only covers the conventional `:id` name.)
 */
function validateUuidRouteParam(paramName) {
    return [
        param(paramName)
            .isUUID().withMessage(`Invalid ${paramName}`),

        handleValidationErrors,
    ];
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOT_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // strict 24h HH:MM

const validateAvailabilitySchedule = [
    body('availabilitySchedule')
        .isObject().withMessage('availabilitySchedule must be an object')
        .custom((schedule) => {
            for (const [day, slots] of Object.entries(schedule)) {
                if (!DAY_NAMES.includes(day)) {
                    throw new Error(`Invalid day: ${day}`);
                }
                if (!Array.isArray(slots) || !slots.every((s) => typeof s === 'string' && TIME_SLOT_RE.test(s))) {
                    throw new Error(`Invalid time slot for ${day} (expected HH:MM, 24h)`);
                }
            }
            return true;
        }),

    handleValidationErrors,
];

const validateConsent = [
    body('doctorId')
        .trim()
        .isUUID().withMessage('Valid doctor ID required'),

    handleValidationErrors,
];

module.exports = {
    handleValidationErrors,
    validateRegister,
    validateLogin,
    validateMfa,
    validateAppointment,
    validateMedicalRecord,
    validateInsuranceClaim,
    validateUuidParam,
    validateUuidRouteParam,
    validateAvailabilitySchedule,
    validateConsent,
};
