-- ============================================================
-- As-Shifa Secure Healthcare Management System
-- Database Schema
-- HIPAA-aligned, implementing CIA + AAA security model
-- ============================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin', 'insurance_provider');
CREATE TYPE appointment_status AS ENUM ('scheduled', 'rescheduled', 'cancelled', 'completed');
CREATE TYPE claim_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE audit_status AS ENUM ('SUCCESS', 'FAILURE');

-- ============================================================
-- TABLE: users
-- Stores authentication and identity for all system users.
-- CONF-01: Passwords stored as bcrypt hashes only (never plaintext).
-- AUTH-04: Tracks failed login attempts and account lock state.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,          -- bcrypt hash, saltRounds=12 (AUTH-05)
    role user_role NOT NULL DEFAULT 'patient',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,  -- AUTH-04: lock after 5
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,          -- AUTH-04: account lockout flag
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,        -- AUTH-02: MFA requirement flag
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- TABLE: patients
-- Patient-specific profile data.
-- CONF-01: insurance_policy_number stored as AES-256-CBC ciphertext.
-- ============================================================

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    contact_phone VARCHAR(50),
    contact_address TEXT,
    insurance_provider_name VARCHAR(255),
    insurance_policy_number TEXT,                 -- AES-256-CBC encrypted (CONF-01)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_patients_user_id ON patients(user_id);

-- ============================================================
-- TABLE: doctors
-- Doctor-specific profile and availability data.
-- ============================================================

CREATE TABLE IF NOT EXISTS doctors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    availability_schedule JSONB DEFAULT '{}',     -- Structured availability slots
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_doctors_user_id ON doctors(user_id);

-- ============================================================
-- TABLE: medical_records
-- Core health data for patients.
-- CONF-01: All clinical fields encrypted with AES-256-CBC.
-- INT-02: Version counter for optimistic locking and history.
-- INT-05: Digital signature (HMAC-SHA256) on prescriptions.
-- ============================================================

CREATE TABLE IF NOT EXISTS medical_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    record_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diagnosis TEXT,                               -- AES-256-CBC encrypted (CONF-01)
    treatment TEXT,                               -- AES-256-CBC encrypted (CONF-01)
    prescriptions TEXT,                           -- AES-256-CBC encrypted (CONF-01)
    test_results TEXT,                            -- AES-256-CBC encrypted (CONF-01)
    digital_signature VARCHAR(512),               -- HMAC-SHA256 of prescriptions (INT-05)
    checksum VARCHAR(64),                         -- SHA-256 of full record for INT-04
    version INTEGER NOT NULL DEFAULT 1,           -- INT-02: record versioning
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_medical_records_patient_id ON medical_records(patient_id);
CREATE INDEX idx_medical_records_doctor_id ON medical_records(doctor_id);

-- ============================================================
-- TABLE: medical_record_history
-- Immutable versioned snapshots of every record update.
-- INT-02: Every change is captured here before overwrite.
-- ============================================================

CREATE TABLE IF NOT EXISTS medical_record_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_id UUID NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    snapshot_data TEXT NOT NULL,                  -- AES-256-CBC encrypted JSON snapshot
    version_number INTEGER NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_history_record_id ON medical_record_history(record_id);

-- ============================================================
-- TABLE: appointments
-- Scheduling between patients and doctors.
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    appointment_time TIMESTAMPTZ NOT NULL,
    status appointment_status NOT NULL DEFAULT 'scheduled',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appointments_patient_id ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX idx_appointments_time ON appointments(appointment_time);

-- ============================================================
-- TABLE: insurance_claims
-- Claims submitted by admin to insurance providers.
-- CONF-01: claim_details encrypted at rest.
-- ============================================================

CREATE TABLE IF NOT EXISTS insurance_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
    doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
    appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
    claim_details TEXT,                           -- AES-256-CBC encrypted (CONF-01)
    status claim_status NOT NULL DEFAULT 'pending',
    submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processor_notes TEXT
);

CREATE INDEX idx_claims_patient_id ON insurance_claims(patient_id);
CREATE INDEX idx_claims_status ON insurance_claims(status);

-- ============================================================
-- TABLE: patient_consent
-- Explicit patient authorization for doctor record access.
-- AUTHZ-05: Consent must be granted; can be revoked.
-- ============================================================

CREATE TABLE IF NOT EXISTS patient_consent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    authorized_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,                       -- NULL = currently active consent
    UNIQUE(patient_id, authorized_doctor_id)
);

CREATE INDEX idx_consent_patient_id ON patient_consent(patient_id);
CREATE INDEX idx_consent_doctor_id ON patient_consent(authorized_doctor_id);

-- ============================================================
-- TABLE: audit_logs
-- Immutable activity journal for all system actions.
-- AUD-01: Every action logged. AUD-02: User identity recorded.
-- AUD-03: ISO 8601 timestamp on every entry.
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- AUD-02: who acted
    action VARCHAR(100) NOT NULL,                           -- e.g. LOGIN, VIEW_RECORD
    target_resource VARCHAR(255),                           -- resource acted upon
    ip_address INET,                                        -- client IP
    user_agent TEXT,                                        -- browser/client info
    request_method VARCHAR(10),
    request_path VARCHAR(500),
    status audit_status NOT NULL DEFAULT 'SUCCESS',         -- SUCCESS or FAILURE
    error_message TEXT,                                     -- sanitized error, no internals
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()            -- AUD-03: ISO 8601
);

CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_status ON audit_logs(status);

-- ============================================================
-- TABLE: mfa_tokens
-- One-time passwords for doctor and admin MFA (AUTH-02).
-- Tokens are hashed before storage; short TTL enforced.
-- ============================================================

CREATE TABLE IF NOT EXISTS mfa_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,             -- bcrypt hash of the OTP
    expires_at TIMESTAMPTZ NOT NULL,              -- short TTL (e.g. 10 minutes)
    used BOOLEAN NOT NULL DEFAULT FALSE,          -- single-use enforcement
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mfa_user_id ON mfa_tokens(user_id);
CREATE INDEX idx_mfa_expires_at ON mfa_tokens(expires_at);

-- ============================================================
-- TRIGGER: auto-update updated_at timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_medical_records_updated_at
    BEFORE UPDATE ON medical_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at
    BEFORE UPDATE ON appointments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- TRIGGER: INT-04 — detect unauthorized modification via checksum
-- Logs a FAILURE audit event when a record's checksum doesn't match
-- on a direct DB-level UPDATE (bypassing the application layer).
-- The application always recomputes checksum before saving.
-- ============================================================

CREATE OR REPLACE FUNCTION flag_unauthorized_record_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- If checksum field was not updated alongside data fields,
    -- it indicates a potential unauthorized direct DB modification.
    IF OLD.diagnosis IS DISTINCT FROM NEW.diagnosis
       OR OLD.treatment IS DISTINCT FROM NEW.treatment
       OR OLD.prescriptions IS DISTINCT FROM NEW.prescriptions
    THEN
        IF NEW.checksum = OLD.checksum THEN
            INSERT INTO audit_logs (action, target_resource, status, error_message)
            VALUES (
                'UNAUTHORIZED_RECORD_MODIFICATION',
                'medical_records:' || NEW.id::TEXT,
                'FAILURE',
                'Checksum mismatch detected — possible unauthorized direct DB modification'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_record_integrity
    BEFORE UPDATE ON medical_records
    FOR EACH ROW EXECUTE FUNCTION flag_unauthorized_record_modification();
