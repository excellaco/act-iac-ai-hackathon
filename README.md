# Parcella — Zoning Land Use Policy Impact Simulator

An AI-powered housing regulatory and development feasibility intelligence platform built for the ACT-IAC AI Hackathon.

Parcela transforms unstructured municipal zoning documents into structured, comparable data — enabling policymakers and housing agency staff to quantify regulatory constraints, compare jurisdictions, and model the impact of potential policy changes.

> **Hackathon scope:** MVP targets 2–3 contrasting Virginia jurisdictions (Fairfax, Arlington, Loudoun counties). See [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) for the full user flow.
>
> **Live demo:** https://excella-ai-hackathon-w53o5h2jra-uc.a.run.app

---

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure

```
act-iac-ai-hackathon/
├── app/                        # Next.js app router pages and layouts
├── __tests__/                  # Jest + React Testing Library test suite
│   ├── fixtures/zoning/        # E2-0 gold fixtures for LLM extraction evaluation
│   ├── pipeline/               # Unit tests for E0 pipeline modules
│   └── extractors/             # Unit tests for E2 Gemini extractors
├── lib/
│   ├── pipeline/               # E0/E1 pipeline — runner, chunker, fetchers, parser, normalizer, validator
│   └── extractors/             # E2 Gemini extractors — one per regulatory field
├── db/
│   ├── schema.ts               # Drizzle schema (all 6 tables)
│   ├── migrations/             # Auto-generated SQL migrations
│   └── seeds/                  # Seed scripts for jurisdictions, scores, market data
├── scripts/
│   └── run-pipeline.ts         # CLI: npm run pipeline:run [jurisdictionId]
├── public/                     # Static assets
├── infra/                      # Terraform — GCS bucket and IAM (see infra/README.md)
├── data/
│   └── raw/                    # Local dev fallback for source documents (see data/raw/README.md)
│       └── zoning/             # Zoning ordinance PDFs — primary storage is GCS (gitignored)
├── docs/                       # Project documentation
│   ├── ARCHITECTURE.md         # System architecture diagram and layer descriptions
│   ├── PERSONA.md              # Primary user persona — Valentina Reyes (Val)
│   ├── USER_JOURNEY.md         # 4-step MVP user journey (policy maker persona)
│   ├── BACKLOG.md              # Full sprint backlog with epics, stories, and points
│   ├── DATA_SOURCES.md         # Public data sources, formats, and field mappings
│   ├── DATABASE_SCHEMA.md      # Cloud SQL schema — all tables, columns, relationships
│   ├── LLM_PROMPT_TEMPLATES.md # ADK LlmAgent prompt templates and validation rules
│   └── adr/
│       ├── 0001-platform-and-stack.md              # Google Cloud + Next.js/TypeScript decision
│       └── 0002-google-adk-for-pipeline-orchestration.md  # ADK usage decision
├── Dockerfile                  # Container image for Cloud Run deployment
└── .github/workflows/          # CI/CD pipeline (quality + deploy jobs)
```

---

## Architecture Overview

Parcela is a five-layer system:

```
Zoning PDFs + Public Datasets
        ↓
[ E0/E1 ] Ingestion & Extraction Pipeline  (Google ADK — SequentialAgent)
        ↓
[ E2    ] LLM Field Extraction             (Google ADK — ParallelAgent + LlmAgent)
        ↓
[ E3    ] RIS Scoring Engine               (TypeScript — deterministic calculation)
        ↓
[ E9    ] Backend API                      (Next.js API routes → Cloud SQL)
        ↓
[ E5–E8 ] Dashboard UI                     (Next.js / React — search, map, compare, simulate)
```

The ingestion pipeline runs as a **pre-processing batch job** before the demo. The live application is a data visualization layer on top of pre-computed scores. See [`docs/adr/0002-google-adk-for-pipeline-orchestration.md`](docs/adr/0002-google-adk-for-pipeline-orchestration.md) for the ADK decision rationale.

---

## User Journey (Summary)

1. **Search** — policy maker types their county into a search bar; autocomplete returns matching jurisdictions
2. **View RIS** — map zooms to selected county; accordion score panel shows Regulatory Impact Score and sub-scores with inline confidence badges and data source attribution
3. **Compare** — add 1–2 more counties for side-by-side comparison with a summary ranking bar
4. **Simulate** — toggle "What-If" mode; adjust regulatory constraint sliders; scores and feasibility outputs update in real time

Full details: [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md)

---

## Regulatory Impact Score (RIS)

The RIS is a composite 0–100 index measuring regulatory constraint. It is **descriptive, not prescriptive** — it quantifies regulatory complexity without making normative policy judgments.

| Sub-score | Weight | What it measures |
|-----------|--------|-----------------|
| Density Constraint Index (DCI) | 30% | Lot size, height limits, density limits |
| Development Cost Impact (DCOI) | 25% | Parking requirements, construction cost inputs |
| Permitting Complexity Indicator (PCI) | 20% | Permit approval rates, discretionary review |
| Comparative Restrictiveness Percentile (CRP) | 25% | Ranking within peer jurisdiction set |

Higher score = more restrictive regulatory environment.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend & API | Next.js 16 + TypeScript |
| AI Pipeline | Google ADK for TypeScript |
| LLM | Gemini (via Vertex AI) |
| Database | Cloud SQL (PostgreSQL) |
| Raw PDF Storage | Google Cloud Storage (`parcela-490518-raw-data`) |
| Deployment | Google Cloud Run |
| Infrastructure as Code | Terraform (`infra/`) |
| CI/CD | GitHub Actions |
| Code Quality | ESLint, SonarCloud, Snyk |

See [`docs/adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) for the full rationale.

---

## Testing

Tests use [Jest](https://jestjs.io/) and [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/). Tests live in `__tests__/`.

```bash
npm test
```

---

## Database

Parcela uses PostgreSQL (Cloud SQL in production) managed via [Drizzle ORM](https://orm.drizzle.team/).

### Local development

```bash
# Start local PostgreSQL (port 5433)
docker compose up -d

# Push the schema
npm run db:push

# Seed all data (jurisdictions, scores, synthetic peers, market data)
npm run db:seed:all
```

Individual seed scripts:

| Script | What it seeds |
|--------|--------------|
| `npm run db:seed` | 3 real jurisdictions |
| `npm run db:seed:scores` | Pre-computed RIS scores for real jurisdictions |
| `npm run db:seed:synthetic` | ~7 synthetic peer jurisdictions for CRP |
| `npm run db:seed:market` | FMR, ACS, and building permit data from public APIs |
| `npm run db:seed:all` | All of the above in sequence |

### Migrations

```bash
# Generate a new migration file from schema changes
npm run db:generate

# Apply pending migrations (run against Cloud SQL in CI)
npm run db:migrate
```

### Environment variables

Copy `.env.example` to `.env.local` and set:

```bash
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/parcela
GOOGLE_CLOUD_PROJECT=parcela-490518   # required for Gemini/Vertex AI calls

# Optional
GEMINI_MODEL=gemini-2.0-flash-001     # defaults to gemini-2.0-flash-001
RAW_DATA_BUCKET=parcela-490518-raw-data  # omit to use local data/raw/ fallback
HUD_API_TOKEN=<token>                 # omit to use hardcoded FY2025 FMR fallbacks
```

For Cloud Run, use the Cloud SQL Unix socket form:

```
DATABASE_URL=postgresql://USER:PASSWORD@/parcela?host=/cloudsql/PROJECT:REGION:INSTANCE
```

### pgcrypto extension

`gen_random_uuid()` (used by Drizzle's `.defaultRandom()`) requires the `pgcrypto` extension. Enable it once on Cloud SQL:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### GitHub Secret required

| Secret | Description |
|--------|-------------|
| `DATABASE_URL` | Cloud SQL connection string for CI migrations |

---

## Running the Extraction Pipeline

The pipeline fetches zoning PDFs, parses them, and calls Gemini to extract regulatory fields into the database. Run it locally after setting up the database and Google Cloud credentials.

### Prerequisites

```bash
# Authenticate with Google Cloud (required for Gemini calls)
gcloud auth application-default login

# Start local database and seed it
docker compose up -d
npm run db:seed:all
```

### Run

```bash
# All 3 jurisdictions
npm run pipeline:run

# Single jurisdiction
npm run pipeline:run arlington_va
npm run pipeline:run fairfax_va
npm run pipeline:run loudoun_va
```

Uses local PDFs from `data/raw/zoning/` when `RAW_DATA_BUCKET` is not set, or fetches from GCS when it is.

### Verify results

```bash
npm run db:studio   # browse extracted_fields table in Drizzle Studio (localhost:4983)
npm run dev         # run the app — search for a jurisdiction to see the score panel
```

---

## CI/CD Pipeline

The pipeline triggers on every push to `main` and runs two jobs:

### quality job
Runs first and must pass before deployment:
1. Install dependencies
2. TypeScript type check (`tsc --noEmit`)
3. Lint (`eslint`)
4. Tests (`jest`) with coverage report
5. Snyk dependency vulnerability scan (fails on high/critical)
6. Snyk monitor (sends snapshot to Snyk dashboard for ongoing tracking)
7. SonarCloud code quality analysis

### deploy job
Runs after `quality` passes:
1. Install dependencies
2. Build the Next.js app
3. Authenticate to GCP
4. Check GCS raw data bucket is accessible (fails with instructions if not)
5. Build and push Docker image to Artifact Registry
6. Deploy to Cloud Run

### infra workflow
Triggered on PRs touching `infra/` or manually via **Actions → Infrastructure → Run workflow**:
- **On PR:** runs `terraform init`, `terraform validate`, `terraform plan` — plan output visible in the PR
- **On manual dispatch:** choose `plan` (default) or `apply` to provision/update infrastructure

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | GCP project ID (`parcela-490518`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation provider ID — see One-Time GCP Setup below |
| `DATABASE_URL` | Cloud SQL Unix socket connection string for Cloud Run |
| `DATABASE_URL_MIGRATE` | Cloud SQL TCP connection string for CI migrations via Cloud SQL Auth Proxy |
| `SNYK_TOKEN` | Snyk auth token (from Account Settings in Snyk dashboard) |
| `SONAR_TOKEN` | SonarCloud token (from My Account → Security in SonarCloud) |

---

## One-Time GCP Setup

GCP project: `parcela-490518`. CI/CD authenticates via **Workload Identity Federation** — no service account JSON key is needed or used.

**Enable required APIs:**
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com \
  sqladmin.googleapis.com storage.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com
```

**Create the Artifact Registry repository:**
```bash
gcloud artifacts repositories create excella-ai-hackathon \
  --repository-format=docker \
  --location=us-central1
```

**Create a service account and grant roles:**
```bash
gcloud iam service-accounts create github-actions

for role in roles/run.admin roles/artifactregistry.writer roles/iam.serviceAccountUser \
            roles/cloudsql.client roles/storage.admin roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding parcela-490518 \
    --member="serviceAccount:github-actions@parcela-490518.iam.gserviceaccount.com" \
    --role="$role"
done
```

**Configure Workload Identity Federation:**
```bash
gcloud iam workload-identity-pools create "github-actions-pool" \
  --location="global" --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
  --location="global" \
  --workload-identity-pool="github-actions-pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == 'excellaco/act-iac-ai-hackathon'"

PROJECT_NUMBER=$(gcloud projects describe parcela-490518 --format="value(projectNumber)")
gcloud iam service-accounts add-iam-policy-binding \
  github-actions@parcela-490518.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions-pool/attribute.repository/excellaco/act-iac-ai-hackathon"
```

Set the `GCP_WORKLOAD_IDENTITY_PROVIDER` secret to:
```
projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider
```

---

## One-Time Security Tools Setup

**Snyk:**
1. Sign up at [snyk.io](https://snyk.io) using your GitHub account
2. Copy your auth token from **Account Settings → Auth Token**
3. Add it as the `SNYK_TOKEN` GitHub secret

**SonarCloud:**
1. Sign up at [sonarcloud.io](https://sonarcloud.io) using your GitHub account
2. Create a new project linked to this repo — note the project key and organization key
3. Generate a token from **My Account → Security**
4. Add it as the `SONAR_TOKEN` GitHub secret
5. Disable **Automatic Analysis** under **Administration → Analysis Method** in your SonarCloud project

---

## Documentation Index

| Document | Description |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture diagram and layer descriptions |
| [`docs/PERSONA.md`](docs/PERSONA.md) | Primary user persona — Valentina Reyes (Val), Housing Policy Analyst |
| [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) | End-to-end user journey for the policy maker persona |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Full product backlog — epics E0–E9, stories, acceptance criteria |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Public data sources, access URLs, formats, and field mappings |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Cloud SQL schema — all tables, columns, types, and relationships |
| [`docs/LLM_PROMPT_TEMPLATES.md`](docs/LLM_PROMPT_TEMPLATES.md) | ADK LlmAgent prompt templates, output schema, and validation rules |
| [`docs/adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) | ADR: Google Cloud + Next.js/TypeScript |
| [`docs/adr/0002-google-adk-for-pipeline-orchestration.md`](docs/adr/0002-google-adk-for-pipeline-orchestration.md) | ADR: Google ADK for pipeline and LLM extraction |
| [`docs/adr/0003-database-access-and-migrations.md`](docs/adr/0003-database-access-and-migrations.md) | ADR: Drizzle ORM, Docker Compose local dev, auto-apply migrations |
