# As-Shifa Secure Healthcare Management System

A production-ready, HIPAA-aligned healthcare management platform implementing full **CIA + AAA** security requirements.

![Landing page](screenshots/01-landing-hero.png)

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | HTML5, CSS3, Vanilla JavaScript     |
| Backend   | Node.js + Express.js (REST API)     |
| Database  | PostgreSQL 14+                      |
| Auth      | bcrypt + express-session + MFA OTP  |
| Crypto    | AES-256-CBC (field encryption), HMAC-SHA256 (signatures) |

---

## Security Implementations

| Code     | Description |
|----------|-------------|
| AUTH-01–05 | Password login, bcrypt hashing, MFA, account lockout |
| AUTHZ-01–05 | RBAC middleware, doctor-patient consent model |
| INT-01–05 | Record versioning, checksums, HMAC signatures, parameterized queries |
| CONF-01–05 | AES-256 at-rest encryption, HTTPS, field masking, auto-logout |
| AVL-01–05 | Error handling, rate limiting, health endpoint, backup script |
| AUD-01–05 | Full audit trail, user identity logging, security alerts |

---

## Project Structure

```
as-shifa-healthcare/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── config/
│   │   ├── db.js              # PostgreSQL pool
│   │   └── security.js        # Crypto keys, session config
│   ├── middleware/
│   │   ├── authenticate.js    # Session + MFA guard
│   │   ├── authorize.js       # RBAC role checks
│   │   ├── validate.js        # Input validation rules
│   │   ├── rateLimiter.js     # Rate limiting (AVL-03)
│   │   └── auditLogger.js     # Request audit logging
│   ├── routes/                # Versioned API routes (/api/v1/...)
│   ├── controllers/           # Business logic per domain
│   ├── services/
│   │   ├── encryption.service.js  # AES-256-CBC
│   │   ├── mfa.service.js         # OTP generate/verify
│   │   ├── signature.service.js   # HMAC-SHA256
│   │   └── audit.service.js       # Audit log writer
│   └── db/
│       ├── schema.sql         # Full database schema
│       └── seed.sql           # Sample data
├── frontend/
│   ├── index.html             # Login page
│   ├── register.html          # Patient registration
│   ├── dashboard-patient.html
│   ├── dashboard-doctor.html
│   ├── dashboard-admin.html
│   ├── mfa.html               # MFA verification
│   ├── appointments.html      # Appointment booking
│   ├── medical-record.html    # Record viewer/editor
│   ├── insurance.html         # Claims management
│   ├── css/styles.css
│   └── js/
│       ├── utils.js           # Auto-logout, masking, fetch wrapper
│       ├── auth.js            # Login/register/MFA logic
│       ├── patient.js
│       ├── doctor.js
│       ├── admin.js
│       ├── appointments.js
│       ├── records.js
│       └── insurance.js
├── .env.example
├── package.json
└── README.md
```

---

## Screenshots

### Landing Page

The public marketing site: role overview and the security controls implemented under the hood.

![Landing hero](screenshots/01-landing-hero.png)
![Landing page — roles](screenshots/02-landing-roles.png)
![Landing page — security](screenshots/03-landing-security.png)

### Login & MFA

Doctor and admin accounts require a one-time email code on top of a password before a session is fully trusted.

![MFA verification screen](screenshots/04-mfa-verification.png)

### Admin

Full user directory and lifecycle management, appointment oversight, audit logs, and live security/system health monitoring.

![Admin dashboard overview](screenshots/05-admin-overview.png)
![Admin user management](screenshots/06-admin-users.png)
![Admin appointments view](screenshots/07-admin-appointments.png)

### Patient

Book and cancel appointments, view your own decrypted medical records, and grant or revoke a doctor's access to your chart.

![Patient dashboard overview](screenshots/08-patient-overview.png)
![Patient appointments](screenshots/09-patient-appointments.png)
![Patient booking flow](screenshots/10-patient-book-appointment.png)

### Doctor

See only patients who have actively consented to you, create and update versioned records with digitally signed prescriptions, manage appointments, and set your own weekly availability.

![Doctor patient list](screenshots/11-doctor-my-patients.png)
![Doctor patient records view](screenshots/12-doctor-patient-records.png)
![Doctor appointments](screenshots/13-doctor-appointments.png)
![Doctor availability schedule](screenshots/14-doctor-schedule.png)

### Insurance Provider

Insurance providers review claims submitted for completed appointments and approve or reject them with processor notes. Claim details are encrypted end to end, and the role has no access to clinical records, only claims.

*(Screenshots for this role are not yet captured.)*

---

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

### 2. Clone and Install

```bash
git clone <repo-url> as-shifa-healthcare
cd as-shifa-healthcare
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `DB_*` — PostgreSQL credentials
- `SESSION_SECRET` — 64+ random bytes (see comment in .env.example)
- `ENCRYPTION_KEY` — exactly 64 hex chars (32 bytes for AES-256)
- `HMAC_SECRET` — random secret for prescription signatures
- `SMTP_*` — email config for MFA OTP (optional in dev mode)

**Generate secure values:**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Set Up Database

```bash
# Create DB and user in PostgreSQL
psql -U postgres -c "CREATE USER asshifa_user WITH PASSWORD 'YOUR_PASSWORD';"
psql -U postgres -c "CREATE DATABASE asshifa_db OWNER asshifa_user;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE asshifa_db TO asshifa_user;"

# Run schema
psql postgresql://asshifa_user:YOUR_PASSWORD@localhost:5432/asshifa_db -f backend/db/schema.sql

# (Optional) Load sample data
psql postgresql://asshifa_user:YOUR_PASSWORD@localhost:5432/asshifa_db -f backend/db/seed.sql
```

### 5. Run the Server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server starts on `http://localhost:3000` (or `PORT` env var).

---

## Test Accounts

> **These are demo/seed accounts for local development only — never reuse
> these passwords, or any password shown here, for anything real.**

| Username        | Password       | Role               | MFA Required |
|-----------------|----------------|--------------------|--------------|
| admin_sara      | Admin@1234     | admin              | Yes          |
| admin_ismael    | Admin@5678     | admin              | Yes          |
| dr_ahmad        | Doctor@1234    | doctor             | Yes          |
| dr_fatima       | Doctor@1234    | doctor             | Yes          |
| haitham         | Doctor@5678    | doctor             | Yes          |
| patient_khalid  | Patient@1234   | patient            | No           |
| patient_aisha   | Patient@1234   | patient            | No           |
| patient_omar    | Patient@1234   | patient            | No           |
| insure_noor     | Insure@1234    | insurance_provider | No           |

All accounts above come from `backend/db/seed.sql`. Any account you
register yourself through the app (e.g. via `/register.html`) only exists
in your own local database — it's never part of this repo.

> **MFA note:** Admin and doctor accounts require a one-time OTP sent to their registered email after the password step. Make sure SMTP is configured in `.env`, or set `SMTP_*` to a test mailbox.

---

## API Reference

Base URL: `http://localhost:3000/api/v1`

### Auth
| Method | Endpoint           | Description              |
|--------|--------------------|--------------------------|
| POST   | /auth/register     | UC-01: Patient register  |
| POST   | /auth/login        | UC-02: Login step 1      |
| POST   | /auth/mfa          | UC-02: MFA step 2        |
| POST   | /auth/logout       | Logout                   |
| GET    | /auth/status       | Session status           |

### Patient
| Method | Endpoint                          | Description           |
|--------|-----------------------------------|-----------------------|
| GET    | /patient/profile                  | Own profile           |
| GET    | /patient/records                  | UC-04: Own records    |
| GET    | /patient/consents                 | AUTHZ-05: Consents    |
| POST   | /patient/consents                 | Grant consent         |
| DELETE | /patient/consents/:doctorId       | Revoke consent        |

### Doctor
| Method | Endpoint                              | Description           |
|--------|----------------------------------------|-----------------------|
| GET    | /doctor/list                          | All doctors (any role)|
| GET    | /doctor/patients                      | Assigned patients     |
| GET    | /doctor/patients/:id/records          | UC-04: Patient records|
| PUT    | /doctor/availability                  | Update schedule       |

### Records
| Method | Endpoint            | Description                        |
|--------|---------------------|-------------------------------------|
| GET    | /records/:id        | UC-04: View record                 |
| POST   | /records            | UC-05: Create/update record        |
| GET    | /records/:id/history| Version history (INT-02)           |

### Appointments
| Method | Endpoint              | Description              |
|--------|------------------------|--------------------------|
| POST   | /appointments         | UC-03: Book appointment  |
| GET    | /appointments/my      | Patient's appointments   |
| GET    | /appointments/doctor  | Doctor's appointments    |
| GET    | /appointments/all     | Admin: all appointments  |
| DELETE | /appointments/:id     | Cancel                   |

### Insurance
| Method | Endpoint                       | Description            |
|--------|----------------------------------|------------------------|
| POST   | /insurance/claims              | UC-06: Submit claim    |
| GET    | /insurance/claims              | List claims            |
| GET    | /insurance/claims/:id          | Claim details          |
| PUT    | /insurance/claims/:id/process  | Approve/reject         |

### Admin
| Method | Endpoint                    | Description           |
|--------|------------------------------|-----------------------|
| GET    | /admin/users                | List all users        |
| PUT    | /admin/users/:id/unlock     | Unlock account        |
| DELETE | /admin/users/:id            | Delete user           |
| GET    | /admin/audit-logs           | AUD-04: Audit viewer  |
| GET    | /admin/security-alerts      | AUD-05: Alerts        |

### Health
| Method | Endpoint      | Description           |
|--------|---------------|-----------------------|
| GET    | /health       | AVL-05: System health |

---

## Database Backup (AVL-02)

Schedule automated backups with pg_dump:

```bash
# Add to crontab (daily at 2am)
0 2 * * * pg_dump postgresql://asshifa_user:PASSWORD@localhost:5432/asshifa_db \
  --format=custom --compress=9 \
  --file=/backups/asshifa_$(date +\%Y\%m\%d).dump

# Retain last 30 days
0 3 * * * find /backups -name "asshifa_*.dump" -mtime +30 -delete
```

---

## Production Deployment Notes

1. **HTTPS**: Use nginx as a reverse proxy with Let's Encrypt certificates. Set `NODE_ENV=production`.
2. **Session store**: Replace in-memory sessions with `connect-pg-simple` for multi-instance deployments.
3. **Secrets**: Use a secrets manager (AWS Secrets Manager, HashiCorp Vault) instead of `.env` files.
4. **Logging**: Pipe stdout to a log aggregator (ELK, Datadog).
5. **Rate limiting**: Consider Redis-backed rate limiting for multi-instance setups.
6. **Database**: Enable PostgreSQL SSL (`ssl: { rejectUnauthorized: true }` is set in production).

---

## Changelog

### Bug Fixes (2026-05-07)

**1. Seed passwords were invalid (all seeded accounts returned "Invalid credentials")**
- The original `seed.sql` used a single incorrect bcrypt hash for all users that matched none of the intended passwords.
- Fixed by generating fresh bcrypt hashes (12 rounds) for each role's password and updating `seed.sql`.
- Re-run `npm run db:reset` to apply.

**2. Appointment booking returned "Valid doctor ID required"**
- Seeded doctor/patient/appointment IDs used placeholder UUIDs with version nibble `0` (e.g. `aa000000-0000-0000-0000-000000000001`).  
  `express-validator` v7 / `validator.js` v13 enforces UUID version `1–5` and proper variant bits — these IDs failed that check.
- Fixed by replacing all seeded IDs with proper v4 UUIDs in `seed.sql`.
- Re-run `npm run db:reset` to apply.

**3. Appointment time-slot check failed across timezones**
- The frontend converted the user-selected time to UTC (`toISOString()`), but the backend extracted the hour using `Date.getHours()` (server local time), causing a mismatch.
- Fixed in `frontend/js/appointments.js` (send local datetime string directly) and `backend/controllers/appointment.controller.js` (parse day/hour from string components, not from `Date` object methods).

---

## Security Contacts

Report vulnerabilities to: `security@asshifa.health`
