# SanitovaCredits

**Environmental health compliance workflow MVP with a working local Canton integration.**

The web application supports local Canton issuance, inspection, recipient-accepted custody transfer, issuer cancellation, and party-scoped durable records. PostgreSQL holds a checkpointed ledger projection alongside the separate legacy asset database. This is not a public-network deployment or a production-ready regulatory system.

For the ledger-backed workflow, follow [local Canton setup](canton/README.md), [live workflow](canton/LIVE_WORKFLOW.md), and [projection worker setup](canton/PROJECTION.md). Start `node backend/scripts/start-local-canton.js` instead of the plain API, plus `node backend/scripts/sync-canton.js` in a separate terminal. Do not run two APIs on port 4000. The Quick Start below otherwise starts the database-only workflow.

Submission materials: [business brief](BUSINESS_BRIEF.md) · [pilot plan](PILOT_PLAN.md) · [pitch](PITCH.md) · [demo script](DEMO.md) · [checklist](SUBMISSION_CHECKLIST.md). Session verification is not a fresh-machine installation test.

SanitovaCredits helps enterprises, inspectors, and regulators issue, update, transfer, and audit
compliance assets tied to verified sanitation and WASH inspection data.

- **Hackathon:** HackCanton Season 3
- **Network:** Canton Network
- **Track:** Real-World Asset (RWA) & Business Workflows
- **Stack:** JavaScript, React, Node.js, PostgreSQL

---

## Quick Start

### Prerequisites

- Node.js >= 20
- PostgreSQL >= 14
- Docker (optional, for DB)

### 1. Install dependencies

```bash
# From the project root
npm install
npm install --prefix frontend
```

Or from the project root:

```bash
npm run install:all
```

### 2. Set up the database

```bash
# Option A: PostgreSQL locally
createdb sanitova   # or CREATE DATABASE sanitova;

# Option B: Docker
docker run --name sanitova-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sanitova -p 5432:5432 -d postgres:16
```

Set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD in the process environment if your database differs from the local defaults.

### 3. Run migrations

```bash
cd backend
node src/db/init.js
```

### 4. Seed demo data

```bash
node scripts/seed.js
```

This creates 4 demo users and 4 compliance assets with full event history.

### 5. Start the backend

```bash
# From the project root
npm run start:api
# or for dev:
npm run dev:api
```

API runs on `http://localhost:4000`.

### 6. Start the frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173` with API proxy to backend.

### 7. Login with demo accounts

| Role       | Email                | Password   |
|------------|----------------------|------------|
| Issuer     | alice@sanitova.com   | demo123    |
| Holder     | bob@sanitova.com     | demo123    |
| Inspector  | clara@sanitova.com   | demo123    |
| Regulator  | david@sanitova.com   | demo123    |

---

## Project Structure

```
sanitovacredits/
├── backend/
│   ├── src/
│   │   ├── index.js          # Express app entry
│   │   ├── middleware/
│   │   │   ├── auth.js       # JWT auth + role checks
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js       # Register, login, me
│   │   │   ├── assets.js     # CRUD, transfer, status
│   │   │   ├── audit.js      # Event log + export
│   │   │   └── dashboard.js  # Stats + recent activity
│   │   └── db/
│   │       ├── index.js      # PostgreSQL pool + helpers
│   │       └── init.js       # Migration runner
│   ├── scripts/
│   │   ├── 00_schema.sql     # Full schema
│   │   └── seed.js           # Demo data seeder
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── main.jsx          # React entry
│   │   ├── App.jsx           # Router
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── components/
│   │   │   └── Layout.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Assets.jsx
│   │   │   ├── AssetDetail.jsx
│   │   │   ├── CreateAsset.jsx
│   │   │   └── AuditTrail.jsx
│   │   └── styles/
│   │       └── index.css
│   └── vite.config.js
├── package.json
└── README.md
```

---

## API Endpoints

### Authentication

| Method | Path                  | Description              | Roles        |
|--------|-----------------------|--------------------------|--------------|
| POST   | `/api/auth/register`  | Register new user        | —            |
| POST   | `/api/auth/login`     | Login, get JWT           | —            |
| GET    | `/api/auth/me`        | Current user profile     | All          |
| GET    | `/api/auth/roles`     | Available roles          | —            |

### Assets

| Method   | Path                    | Description                          | Roles                    |
|----------|-------------------------|--------------------------------------|--------------------------|
| GET      | `/api/assets`           | List assets (filtered by role)       | All                      |
| GET      | `/api/assets/:id`       | Asset detail + history               | All                      |
| POST     | `/api/assets`           | Create new asset                     | issuer                   |
| PATCH    | `/api/assets/:id`       | Update status / transfer / metadata  | issuer, holder, inspector|
| DELETE   | `/api/assets/:id`       | Mark asset as expired                | issuer                   |
| GET      | `/api/assets/:id/events`| Asset-specific event log             | All                      |
| GET      | `/api/assets/types`     | Available asset types                | All                      |
| GET      | `/api/assets/statuses`  | Available statuses                   | —                        |

### Audit

| Method   | Path                    | Description                          |
|----------|-------------------------|--------------------------------------|
| GET      | `/api/audit`            | Full event log (filtered)            |
| GET      | `/api/audit/summary`    | Event counts by type                 |
| GET      | `/api/audit/export`     | Download full audit log as JSON      |

### Dashboard

| Method   | Path                    | Description                          |
|----------|-------------------------|--------------------------------------|
| GET      | `/api/dashboard/stats`  | KPI stats + status breakdowns        |
| GET      | `/api/dashboard/recent-events` | Recent activity feed       |

---

## Verification

With the API and frontend running, run from the project root:

```bash
node backend/scripts/smoke-test.js
node --test backend/scripts/workflow-test.js
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npx playwright test tests/workflow.spec.js --workers=1
```

The browser test creates a demo asset and exercises issuer transfer, inspector verification, and regulator read-only history. Smoke/browser tests leave their demo records in the local database. The holder selector loads real active holder accounts rather than placeholder IDs.

## Workflow

The MVP supports the full compliance lifecycle:

```
Issuer creates asset
    ↓
Inspector updates status (pending_review → verified / in_review)
    ↓
Issuer transfers asset to holder
    ↓
Regulator audits via full event log (exportable)
```

Every state change is recorded in the `asset_events` table and the
`asset_status_history` table. The audit trail is visible in the UI
and exportable as JSON.

---

## Data Model

### compliance_assets

| Field            | Type      | Description                        |
|------------------|-----------|------------------------------------|
| id               | UUID      | Unique asset ID                    |
| asset_type       | VARCHAR   | e.g. Sanitation Inspection Cert    |
| title            | VARCHAR   | Human-readable title               |
| description      | TEXT      | Full description                   |
| issuer_id        | UUID FK   | User who created the asset         |
| current_holder_id| UUID FK   | Current owner of the asset         |
| status           | VARCHAR   | created / pending_review / ...     |
| location         | VARCHAR   | Geographic location                |
| metadata         | JSONB     | Structured inspection data         |
| issued_at        | TIMESTAMPTZ | When the asset was issued        |
| created_at       | TIMESTAMPTZ | Row creation timestamp           |

### asset_events (Audit Log)

| Field          | Type      | Description                      |
|----------------|-----------|----------------------------------|
| id             | UUID      | Event ID                         |
| asset_id       | UUID FK   | Which asset this event belongs to|
| event_type     | VARCHAR   | created / status_changed / transferred |
| event_description | TEXT | Human-readable description       |
| actor_id       | UUID FK   | Who triggered the event          |
| actor_role     | VARCHAR   | Role of the actor at that moment |
| metadata       | JSONB     | Additional context               |
| created_at     | TIMESTAMPTZ | When the event occurred        |

---

## Demo Script

See [DEMO.md](./DEMO.md) for a step-by-step live demo script.

## Pitch Outline

See [PITCH.md](./PITCH.md) for a structured pitch outline.

## Business Brief

See [BUSINESS_BRIEF.md](./BUSINESS_BRIEF.md) for a 1-page ICP, use case,
payer, Canton rationale, and pilot plan.

---

## Product Readiness

See [PRODUCT_READINESS.md](./PRODUCT_READINESS.md) for implemented capabilities, release blockers, and the next engineering priorities. The application is not ready for public production deployment.

## Canton integration status

Implemented locally: `ComplianceAsset` and `TransferProposal` Daml templates; Express command submission with server-assigned parties; issuer, inspector and holder UI actions; checkpointed PostgreSQL projection; party-scoped Canton Records and create/archive evidence.

The legacy `compliance_assets`, `asset_events` and dashboard are separate from the `canton_*` read model. The legacy export is not a ledger export. Contract stakeholders share the contract payload; field-level confidentiality is not implemented.

Remaining gates: production identity and participant authentication, write-command outcome reconciliation, evidence integrations, legal review and verified network onboarding. See [PRODUCT_READINESS.md](PRODUCT_READINESS.md).

---

## License

MIT © SanitovaCredits — HackCanton Season 3
