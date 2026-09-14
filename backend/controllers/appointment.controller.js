/**
 * Appointment Controller
 * UC-03: Schedule Appointment (patient books with a doctor)
 * AUD-01: All booking activity logged.
 */
'use strict';

const { query } = require('../config/db');
const auditService = require('../services/audit.service');

// ── Book an appointment (patient) ──────────────────────────────────────────

async function bookAppointment(req, res) {
    const { doctorId, appointmentTime } = req.body;
    const ip = req.ip;

    try {
        // Get patient profile
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient profile not found' });
        }
        const patientId = patientResult.rows[0].id;

        // Validate doctor exists
        const doctorResult = await query(
            `SELECT id, availability_schedule FROM doctors WHERE id = $1`,
            [doctorId]
        );
        if (doctorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        const doctor = doctorResult.rows[0];

        // Parse day and hour directly from the string so the check is not
        // sensitive to the server's local timezone offset.
        const [datePart, timePart] = appointmentTime.split('T');
        const [yr, mo, dy] = datePart.split('-').map(Number);
        const [hr, mn] = timePart.substring(0, 5).split(':').map(Number);
        const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        const dayOfWeek = dayNames[new Date(yr, mo - 1, dy).getDay()];
        const timeSlot = `${String(hr).padStart(2,'0')}:${String(mn).padStart(2,'0')}`;

        // Use a UTC-anchored timestamp for storage and conflict checks
        const requestedTime = new Date(`${datePart}T${timePart.substring(0, 5)}:00Z`);

        const schedule = doctor.availability_schedule || {};
        const availableSlots = schedule[dayOfWeek] || [];

        if (!availableSlots.includes(timeSlot)) {
            return res.status(409).json({ error: 'Requested time slot is not available for this doctor' });
        }

        // Check no existing non-cancelled appointment at the same time
        const conflict = await query(
            `SELECT id FROM appointments
             WHERE doctor_id = $1
               AND appointment_time = $2
               AND status NOT IN ('cancelled')`,
            [doctorId, requestedTime]
        );
        if (conflict.rows.length > 0) {
            return res.status(409).json({ error: 'Time slot already booked' });
        }

        const result = await query(
            `INSERT INTO appointments (patient_id, doctor_id, appointment_time, status)
             VALUES ($1, $2, $3, 'scheduled')
             RETURNING id, appointment_time, status`,
            [patientId, doctorId, requestedTime]
        );

        await auditService.log({
            userId: req.user.id,
            action: 'BOOK_APPOINTMENT',
            targetResource: `appointments/${result.rows[0].id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(201).json({
            message: 'Appointment scheduled successfully',
            appointment: result.rows[0],
        });

    } catch (err) {
        console.error('[AppointmentController.bookAppointment]', err.message);
        return res.status(500).json({ error: 'Could not schedule appointment' });
    }
}

// ── Get patient's appointments ─────────────────────────────────────────────

async function getMyAppointments(req, res) {
    try {
        const patientResult = await query(
            `SELECT id FROM patients WHERE user_id = $1`,
            [req.user.id]
        );
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        const result = await query(
            `SELECT a.id, a.appointment_time, a.status, a.created_at,
                    d.full_name AS doctor_name, d.specialty
             FROM appointments a
             JOIN doctors d ON d.id = a.doctor_id
             WHERE a.patient_id = $1
             ORDER BY a.appointment_time DESC`,
            [patientResult.rows[0].id]
        );

        return res.status(200).json({ appointments: result.rows });

    } catch (err) {
        console.error('[AppointmentController.getMyAppointments]', err.message);
        return res.status(500).json({ error: 'Could not retrieve appointments' });
    }
}

// ── Get doctor's appointments ──────────────────────────────────────────────

async function getDoctorAppointments(req, res) {
    try {
        const doctorResult = await query(
            `SELECT id FROM doctors WHERE user_id = $1`,
            [req.user.id]
        );
        if (doctorResult.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        const result = await query(
            `SELECT a.id, a.appointment_time, a.status, p.full_name AS patient_name
             FROM appointments a
             JOIN patients p ON p.id = a.patient_id
             WHERE a.doctor_id = $1
             ORDER BY a.appointment_time DESC`,
            [doctorResult.rows[0].id]
        );

        return res.status(200).json({ appointments: result.rows });

    } catch (err) {
        console.error('[AppointmentController.getDoctorAppointments]', err.message);
        return res.status(500).json({ error: 'Could not retrieve appointments' });
    }
}

// ── Cancel appointment (patient or admin) ──────────────────────────────────

async function cancelAppointment(req, res) {
    const { id } = req.params;
    const ip = req.ip;

    try {
        let whereClause = `id = $1 AND status = 'scheduled'`;
        const params = [id];

        // Patients can only cancel their own appointments
        if (req.user.role === 'patient') {
            const patientResult = await query(`SELECT id FROM patients WHERE user_id = $1`, [req.user.id]);
            if (patientResult.rows.length === 0) return res.status(403).json({ error: 'Forbidden' });
            whereClause += ` AND patient_id = $2`;
            params.push(patientResult.rows[0].id);
        }

        const result = await query(
            `UPDATE appointments SET status = 'cancelled', updated_at = NOW()
             WHERE ${whereClause} RETURNING id`,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Appointment not found or cannot be cancelled' });
        }

        await auditService.log({
            userId: req.user.id,
            action: 'CANCEL_APPOINTMENT',
            targetResource: `appointments/${id}`,
            ipAddress: ip,
            status: 'SUCCESS',
        });

        return res.status(200).json({ message: 'Appointment cancelled' });

    } catch (err) {
        console.error('[AppointmentController.cancelAppointment]', err.message);
        return res.status(500).json({ error: 'Could not cancel appointment' });
    }
}

// ── Get all appointments (admin) ───────────────────────────────────────────

async function getAllAppointments(req, res) {
    try {
        const result = await query(
            `SELECT a.id, a.appointment_time, a.status, a.created_at,
                    p.full_name AS patient_name, d.full_name AS doctor_name
             FROM appointments a
             JOIN patients p ON p.id = a.patient_id
             JOIN doctors d ON d.id = a.doctor_id
             ORDER BY a.appointment_time DESC
             LIMIT 200`
        );
        return res.status(200).json({ appointments: result.rows });
    } catch (err) {
        console.error('[AppointmentController.getAllAppointments]', err.message);
        return res.status(500).json({ error: 'Could not retrieve appointments' });
    }
}

module.exports = {
    bookAppointment,
    getMyAppointments,
    getDoctorAppointments,
    cancelAppointment,
    getAllAppointments,
};
