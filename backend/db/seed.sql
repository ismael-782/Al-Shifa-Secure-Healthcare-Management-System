-- ============================================================
-- As-Shifa Secure Healthcare Management System
-- Seed Data
-- NOTE: Passwords below are bcrypt hashes (saltRounds=12).
-- Run schema.sql first before this file.
-- ============================================================

-- ============================================================
-- USERS
-- admin_sara     → Admin@1234
-- dr_ahmad       → Doctor@1234
-- dr_fatima      → Doctor@1234
-- patient_khalid → Patient@1234
-- patient_aisha  → Patient@1234
-- patient_omar   → Patient@1234
-- insure_noor    → Insure@1234
-- admin_ismael   → Admin@5678
-- haitham        → Doctor@5678
-- ============================================================

INSERT INTO users (id, username, email, password_hash, role, mfa_enabled) VALUES
(
    '12fb0b77-a8b9-46b3-b424-c8b87e7df76c',
    'admin_sara',
    'sara.admin@asshifa.health',
    '$2b$12$ag.V15lPQeV8KQayV8n09uR9J92YikH86zABYKbm0B6v8odW86xjS',
    'admin',
    TRUE
),
(
    '309ec72f-34f1-4994-877c-23b1ffb4c31b',
    'dr_ahmad',
    'ahmad.cardiologist@asshifa.health',
    '$2b$12$RLET5XOBTXVEDaVibRUSFO0jn5dbGtwovNYzQr5o0i8aBiCTyrilq',
    'doctor',
    TRUE
),
(
    'cc6cc083-52d0-4bc7-8e3b-58cbf3103152',
    'dr_fatima',
    'fatima.neuro@asshifa.health',
    '$2b$12$RLET5XOBTXVEDaVibRUSFO0jn5dbGtwovNYzQr5o0i8aBiCTyrilq',
    'doctor',
    TRUE
),
(
    'f394d483-559d-4f23-96dd-5ef0fc4e2547',
    'patient_khalid',
    'khalid@example.com',
    '$2b$12$fZci9QD4/vrNK0XYcUfiwuZ/4Nw5MHoag1JDu4ibT1KerTloRPVwu',
    'patient',
    FALSE
),
(
    '96ff0689-874f-40b4-ad9f-487e36e8cdaf',
    'patient_aisha',
    'aisha@example.com',
    '$2b$12$fZci9QD4/vrNK0XYcUfiwuZ/4Nw5MHoag1JDu4ibT1KerTloRPVwu',
    'patient',
    FALSE
),
(
    'd02e98f3-e6df-4007-a33d-c85da49f966b',
    'patient_omar',
    'omar@example.com',
    '$2b$12$fZci9QD4/vrNK0XYcUfiwuZ/4Nw5MHoag1JDu4ibT1KerTloRPVwu',
    'patient',
    FALSE
),
(
    'cd03c06b-6533-4a31-acdd-3783a5419ca3',
    'insure_noor',
    'noor@nhic.health',
    '$2b$12$5oh/fJeyMAOpNt8xyiyXfuR7JQc.eMDOaknFVNSUXz6siXQVB7wFO',
    'insurance_provider',
    FALSE
),
(
    'a3f2e1d0-9b8c-4a7f-b6e5-3c2d1e0f9a8b',
    'admin_ismael',
    'ismael.admin@asshifa.health',
    '$2b$12$HzWHxHyExYGTHp3ANrgnDuELcPLTs2XjJY9Q55LCAz92rTUfmaozK',
    'admin',
    TRUE
),
(
    'b4c3d2e1-8a7b-4c6d-a5f4-2e1d0c9b8a7f',
    'haitham',
    'haitham.doctor@asshifa.health',
    '$2b$12$JxDbYQvOmWEpvf.QFST6p.ebFxQXU.dqTpFW3pZ/gVLpLDWZBsJAm',
    'doctor',
    TRUE
);

-- ============================================================
-- DOCTORS
-- availability_schedule: JSONB with day → array of time slots
-- ============================================================

INSERT INTO doctors (id, user_id, full_name, specialty, license_number, availability_schedule) VALUES
(
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',
    '309ec72f-34f1-4994-877c-23b1ffb4c31b',
    'Dr. Ahmad Al-Rashid',
    'Cardiology',
    'LIC-KSA-CARD-00423',
    '{
        "Monday":    ["09:00","10:00","11:00","14:00","15:00"],
        "Tuesday":   ["09:00","10:00","11:00","14:00","15:00"],
        "Wednesday": ["09:00","10:00","11:00"],
        "Thursday":  ["14:00","15:00","16:00"],
        "Sunday":    ["10:00","11:00","12:00"]
    }'
),
(
    '28625b97-f947-4512-8758-b9e6a86db4ea',
    'cc6cc083-52d0-4bc7-8e3b-58cbf3103152',
    'Dr. Fatima Al-Zahrani',
    'Neurology',
    'LIC-KSA-NEUR-00871',
    '{
        "Monday":    ["10:00","11:00","12:00"],
        "Tuesday":   ["14:00","15:00","16:00"],
        "Wednesday": ["09:00","10:00","11:00","14:00"],
        "Thursday":  ["09:00","10:00"],
        "Sunday":    ["14:00","15:00","16:00"]
    }'
);

INSERT INTO doctors (id, user_id, full_name, specialty, license_number, availability_schedule) VALUES
(
    'c5d4e3f2-7b6a-4d5e-b4c3-1f0e9d8c7b6a',
    'b4c3d2e1-8a7b-4c6d-a5f4-2e1d0c9b8a7f',
    'Dr. Haitham',
    'General Medicine',
    'LIC-KSA-GEN-00312',
    '{
        "Monday":    ["09:00","10:00","11:00","14:00"],
        "Tuesday":   ["09:00","10:00","11:00"],
        "Wednesday": ["14:00","15:00","16:00"],
        "Thursday":  ["09:00","10:00","11:00","14:00"],
        "Sunday":    ["10:00","11:00","12:00"]
    }'
);

-- ============================================================
-- PATIENTS
-- NOTE: insurance_policy_number values below are PLAINTEXT placeholders.
-- The application layer will encrypt them with AES-256-CBC before storing.
-- In a real seed, you would run the encrypt function and store ciphertext.
-- These are prefixed with PLAINTEXT: to signal the seed runner to encrypt.
-- For testing, seed.sql can be run with a helper script that encrypts first.
-- ============================================================

INSERT INTO patients (id, user_id, full_name, date_of_birth, contact_phone, contact_address, insurance_provider_name, insurance_policy_number) VALUES
(
    '95a0716d-7c74-4cf2-a764-e4fd26909594',
    'f394d483-559d-4f23-96dd-5ef0fc4e2547',
    'Khalid Al-Mansouri',
    '1985-03-12',
    '+966-50-111-2222',
    '45 King Fahd Road, Riyadh, KSA',
    'NHIC National Health',
    'ENCRYPTED_PLACEHOLDER_POL-2024-KM-0042'
),
(
    '73edc5b7-86c1-4359-b99c-2f635d55ccae',
    '96ff0689-874f-40b4-ad9f-487e36e8cdaf',
    'Aisha Al-Otaibi',
    '1992-07-28',
    '+966-55-333-4444',
    '12 Olaya Street, Riyadh, KSA',
    'Bupa Arabia',
    'ENCRYPTED_PLACEHOLDER_POL-2024-AA-0117'
),
(
    '212b02f8-eaa7-49d8-95d9-465b50ea9734',
    'd02e98f3-e6df-4007-a33d-c85da49f966b',
    'Omar Al-Ghamdi',
    '1978-11-05',
    '+966-56-555-6666',
    '88 Tahlia Street, Jeddah, KSA',
    'Tawuniya Insurance',
    'ENCRYPTED_PLACEHOLDER_POL-2024-OG-0203'
);

-- ============================================================
-- PATIENT CONSENT
-- Khalid consents to Dr. Ahmad; Aisha consents to both doctors.
-- ============================================================

INSERT INTO patient_consent (patient_id, authorized_doctor_id, granted_at) VALUES
(
    '95a0716d-7c74-4cf2-a764-e4fd26909594',  -- Khalid
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    NOW() - INTERVAL '30 days'
),
(
    '73edc5b7-86c1-4359-b99c-2f635d55ccae',  -- Aisha
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    NOW() - INTERVAL '20 days'
),
(
    '73edc5b7-86c1-4359-b99c-2f635d55ccae',  -- Aisha
    '28625b97-f947-4512-8758-b9e6a86db4ea',  -- Dr. Fatima
    NOW() - INTERVAL '15 days'
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================

INSERT INTO appointments (id, patient_id, doctor_id, appointment_time, status) VALUES
(
    '60fca94a-5d2a-4e18-8a2e-0ac7d71bcd74',
    '95a0716d-7c74-4cf2-a764-e4fd26909594',  -- Khalid
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    NOW() - INTERVAL '10 days',
    'completed'
),
(
    '89621398-69aa-446d-a3cf-dc8bc0046adc',
    '73edc5b7-86c1-4359-b99c-2f635d55ccae',  -- Aisha
    '28625b97-f947-4512-8758-b9e6a86db4ea',  -- Dr. Fatima
    NOW() - INTERVAL '5 days',
    'completed'
),
(
    'cab4d803-5fae-42ba-bb92-e27d371d94ac',
    '95a0716d-7c74-4cf2-a764-e4fd26909594',  -- Khalid
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    NOW() + INTERVAL '3 days',
    'scheduled'
),
(
    '917dcaa0-dbb6-4aa4-ad96-cc7556d30be7',
    '212b02f8-eaa7-49d8-95d9-465b50ea9734',  -- Omar
    '28625b97-f947-4512-8758-b9e6a86db4ea',  -- Dr. Fatima
    NOW() + INTERVAL '7 days',
    'scheduled'
);

-- ============================================================
-- MEDICAL RECORDS
-- NOTE: Clinical fields (diagnosis, treatment, prescriptions, test_results)
-- are stored as ENCRYPTED_PLACEHOLDER here. The real encryption is done
-- by the application's encryption.service.js before insert.
-- ============================================================

INSERT INTO medical_records (id, patient_id, doctor_id, record_date, diagnosis, treatment, prescriptions, test_results, digital_signature, checksum, version) VALUES
(
    'e1b431e9-c8a8-44f9-b7c2-f43ec0080891',
    '95a0716d-7c74-4cf2-a764-e4fd26909594',  -- Khalid
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    NOW() - INTERVAL '10 days',
    'ENCRYPTED_PLACEHOLDER_Hypertension Stage 1',
    'ENCRYPTED_PLACEHOLDER_Lifestyle modification, low-sodium diet, regular exercise',
    'ENCRYPTED_PLACEHOLDER_Amlodipine 5mg once daily',
    'ENCRYPTED_PLACEHOLDER_BP: 145/92 mmHg, HR: 78 bpm, ECG: normal sinus rhythm',
    'HMAC_PLACEHOLDER_signature_amlodipine',
    'CHECKSUM_PLACEHOLDER_record_001',
    1
),
(
    '8be541d5-df7b-4e4b-877c-ea796ce45ba5',
    '73edc5b7-86c1-4359-b99c-2f635d55ccae',  -- Aisha
    '28625b97-f947-4512-8758-b9e6a86db4ea',  -- Dr. Fatima
    NOW() - INTERVAL '5 days',
    'ENCRYPTED_PLACEHOLDER_Migraine with aura',
    'ENCRYPTED_PLACEHOLDER_Avoid triggers, rest in dark room, hydration',
    'ENCRYPTED_PLACEHOLDER_Sumatriptan 50mg as needed, max 2 doses/day',
    'ENCRYPTED_PLACEHOLDER_MRI: No structural abnormality. EEG: within normal limits.',
    'HMAC_PLACEHOLDER_signature_sumatriptan',
    'CHECKSUM_PLACEHOLDER_record_002',
    1
);

-- ============================================================
-- INSURANCE CLAIMS
-- ============================================================

INSERT INTO insurance_claims (patient_id, doctor_id, appointment_id, claim_details, status, submitted_by, submitted_at) VALUES
(
    '95a0716d-7c74-4cf2-a764-e4fd26909594',  -- Khalid
    '1ba40875-a1e7-43dc-995f-b2b8d7b57321',  -- Dr. Ahmad
    '60fca94a-5d2a-4e18-8a2e-0ac7d71bcd74',  -- completed appointment
    'ENCRYPTED_PLACEHOLDER_Cardiology consultation, BP assessment, ECG. Diagnosis: Hypertension Stage 1. Treatment: medication prescribed.',
    'pending',
    'a3f2e1d0-9b8c-4a7f-b6e5-3c2d1e0f9a8b',  -- submitted by admin_ismael
    NOW() - INTERVAL '9 days'
);

-- ============================================================
-- SAMPLE AUDIT LOGS
-- ============================================================

INSERT INTO audit_logs (user_id, action, target_resource, ip_address, status) VALUES
('12fb0b77-a8b9-46b3-b424-c8b87e7df76c', 'LOGIN', 'auth/login', '10.0.0.1', 'SUCCESS'),
('309ec72f-34f1-4994-877c-23b1ffb4c31b', 'LOGIN', 'auth/login', '10.0.0.2', 'SUCCESS'),
('f394d483-559d-4f23-96dd-5ef0fc4e2547', 'LOGIN', 'auth/login', '10.0.0.3', 'SUCCESS'),
('309ec72f-34f1-4994-877c-23b1ffb4c31b', 'VIEW_RECORD', 'medical_records/e1b431e9-c8a8-44f9-b7c2-f43ec0080891', '10.0.0.2', 'SUCCESS'),
('a3f2e1d0-9b8c-4a7f-b6e5-3c2d1e0f9a8b', 'SUBMIT_CLAIM', 'insurance_claims', '10.0.0.1', 'SUCCESS');
