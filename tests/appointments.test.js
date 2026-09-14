'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loginAs } = require('./helpers');

// Dr. Ahmad (seed data) is available Monday 09:00/10:00/11:00/14:00/15:00.
// Pick the next Monday at least a week out so it's always in the future
// and always lands on an available slot regardless of when tests run.
function nextMonday() {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + 7); // a Monday, next week or later
    return d.toISOString().split('T')[0];
}

const DOCTOR_ID = '1ba40875-a1e7-43dc-995f-b2b8d7b57321'; // dr_ahmad (seed.sql)

describe('Appointments', () => {
    it('lists doctors for booking', async () => {
        const { agent } = await loginAs('patient');
        const res = await agent.get('/api/v1/doctor/list');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.doctors));
        assert.ok(res.body.doctors.some((d) => d.id === DOCTOR_ID));
    });

    it('books, lists, and cancels an appointment end-to-end', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const appointmentTime = `${nextMonday()}T09:00:00`;

        const book = await agent
            .post('/api/v1/appointments')
            .set('X-CSRF-Token', csrfToken)
            .send({ doctorId: DOCTOR_ID, appointmentTime });
        assert.equal(book.status, 201);
        const id = book.body.appointment.id;

        const mine = await agent.get('/api/v1/appointments/my');
        assert.ok(mine.body.appointments.some((a) => a.id === id));

        const cancel = await agent.delete(`/api/v1/appointments/${id}`).set('X-CSRF-Token', csrfToken);
        assert.equal(cancel.status, 200);

        const mineAfter = await agent.get('/api/v1/appointments/my');
        assert.equal(mineAfter.body.appointments.find((a) => a.id === id).status, 'cancelled');
    });

    it('rejects double-booking the same doctor/slot', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const appointmentTime = `${nextMonday()}T10:00:00`;

        const first = await agent.post('/api/v1/appointments').set('X-CSRF-Token', csrfToken)
            .send({ doctorId: DOCTOR_ID, appointmentTime });
        assert.equal(first.status, 201);

        const { agent: agent2, csrfToken: csrf2 } = await loginAs('patient2');
        const second = await agent2.post('/api/v1/appointments').set('X-CSRF-Token', csrf2)
            .send({ doctorId: DOCTOR_ID, appointmentTime });
        assert.equal(second.status, 409);
    });

    it('rejects a time slot the doctor does not offer', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        // Dr. Ahmad has no Friday availability at all (see seed.sql schedule).
        const d = new Date();
        d.setDate(d.getDate() + ((12 - d.getDay()) % 7 || 7) + 7); // a Friday
        const appointmentTime = `${d.toISOString().split('T')[0]}T09:00:00`;

        const res = await agent.post('/api/v1/appointments').set('X-CSRF-Token', csrfToken)
            .send({ doctorId: DOCTOR_ID, appointmentTime });
        assert.equal(res.status, 409);
    });

    it('a patient cannot cancel another patient’s appointment', async () => {
        const { agent, csrfToken } = await loginAs('patient');
        const appointmentTime = `${nextMonday()}T11:00:00`;
        const book = await agent.post('/api/v1/appointments').set('X-CSRF-Token', csrfToken)
            .send({ doctorId: DOCTOR_ID, appointmentTime });
        const id = book.body.appointment.id;

        const { agent: other, csrfToken: otherCsrf } = await loginAs('patient2');
        const res = await other.delete(`/api/v1/appointments/${id}`).set('X-CSRF-Token', otherCsrf);
        assert.equal(res.status, 404); // scoped to own appointments — looks like "not found", not "forbidden" (no leak)
    });

    it('doctor can see their own appointments', async () => {
        const { agent } = await loginAs('doctor');
        const res = await agent.get('/api/v1/appointments/doctor');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.appointments));
    });

    it('admin can see all appointments', async () => {
        const { agent } = await loginAs('admin');
        const res = await agent.get('/api/v1/appointments/all');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.body.appointments));
    });

    it('a patient cannot view the admin all-appointments endpoint', async () => {
        const { agent } = await loginAs('patient');
        const res = await agent.get('/api/v1/appointments/all');
        assert.equal(res.status, 403);
    });
});
