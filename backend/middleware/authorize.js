/**
 * Authorization Middleware — Role-Based Access Control (RBAC)
 * AUTHZ-01: Every protected route checks role before granting access.
 * CONF-03: Unauthorized users get 403 Forbidden — zero data leaked.
 */
'use strict';

/**
 * Factory: returns a middleware that allows only the specified roles.
 * @param {...string} roles - allowed roles, e.g. 'admin', 'doctor'
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        next();
    };
}

/**
 * Specific role shortcuts for cleaner route definitions.
 */
const requireAdmin          = requireRole('admin');
const requireDoctor         = requireRole('doctor');
const requirePatient        = requireRole('patient');
const requireDoctorOrAdmin  = requireRole('doctor', 'admin');
const requireAnyRole        = requireRole('patient', 'doctor', 'admin', 'insurance_provider');

module.exports = {
    requireRole,
    requireAdmin,
    requireDoctor,
    requirePatient,
    requireDoctorOrAdmin,
    requireAnyRole,
};
