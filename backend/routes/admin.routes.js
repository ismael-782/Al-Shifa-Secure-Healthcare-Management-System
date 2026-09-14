'use strict';

const express = require('express');
const router = express.Router();

const adminController = require('../controllers/admin.controller');
const { requireMfaComplete } = require('../middleware/authenticate');
const { requireAdmin } = require('../middleware/authorize');
const { validateUuidParam } = require('../middleware/validate');

// All admin routes require admin role + MFA (AUTHZ-04)
router.use(requireMfaComplete);
router.use(requireAdmin);

// GET /api/v1/admin/users
router.get('/users', adminController.listUsers);

// GET /api/v1/admin/patients — patients.id (profile PK), for claim submission etc.
router.get('/patients', adminController.listPatients);

// PUT /api/v1/admin/users/:id/unlock — AUTH-04
router.put('/users/:id/unlock', validateUuidParam, adminController.unlockUser);

// DELETE /api/v1/admin/users/:id
router.delete('/users/:id', validateUuidParam, adminController.deleteUser);

// GET /api/v1/admin/audit-logs — AUD-04 with query params: userId, action, status, from, to
router.get('/audit-logs', adminController.getAuditLogs);

// GET /api/v1/admin/security-alerts — AUD-05
router.get('/security-alerts', adminController.getSecurityAlerts);

module.exports = router;
