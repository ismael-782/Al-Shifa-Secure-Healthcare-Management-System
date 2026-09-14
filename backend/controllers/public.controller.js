/**
 * Public Controller
 * Unauthenticated, marketing-safe data for the landing page: the doctor
 * directory (name + specialty only) and an aggregate patient count (never
 * names or any other patient detail). No session/role required.
 */
'use strict';

const { query } = require('../config/db');

async function getPublicStats(req, res) {
    try {
        const doctorsResult = await query(
            `SELECT full_name, specialty FROM doctors ORDER BY specialty, full_name`
        );
        const patientCountResult = await query(`SELECT COUNT(*) AS count FROM patients`);

        return res.status(200).json({
            doctors: doctorsResult.rows,
            totalPatients: parseInt(patientCountResult.rows[0].count, 10),
        });
    } catch (err) {
        console.error('[PublicController.getPublicStats]', err.message);
        return res.status(500).json({ error: 'Could not retrieve stats' });
    }
}

module.exports = { getPublicStats };
