# Parcela — Zoning Land Use Policy Impact Simulator

An AI-powered housing regulatory and development feasibility intelligence platform built for the ACT-IAC AI Hackathon.

Parcela transforms unstructured municipal zoning documents into structured, comparable data — enabling policymakers and housing agency staff to quantify regulatory constraints, compare jurisdictions, and model the impact of potential policy changes.

> **Hackathon scope:** MVP targets 2–3 contrasting Virginia jurisdictions (Fairfax, Arlington, Loudoun counties). See [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) for the full user flow.

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
├── public/                     # Static assets
├── docs/                       # Project documentation
│   ├── USER_JOURNEY.md         # 4-step MVP user journey (policy maker persona)
│   ├── BACKLOG.md              # Full sprint backlog with epics, stories, and points
│   ├── DATA_SOURCES.md         # Public data sources, formats, and field mappings
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
| Deployment | Google Cloud Run |
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
4. Build and push Docker image to Artifact Registry
5. Deploy to Cloud Run

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `GCP_SA_KEY` | JSON content of the GCP service account key |
| `GCP_PROJECT_ID` | Your GCP project ID |
| `SNYK_TOKEN` | Snyk auth token (from Account Settings in Snyk dashboard) |
| `SONAR_TOKEN` | SonarCloud token (from My Account → Security in SonarCloud) |

---

## One-Time GCP Setup

**Enable required APIs:**
```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
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

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

**Generate the JSON key:**
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Paste the contents of `key.json` into the `GCP_SA_KEY` GitHub secret.

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
| [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) | End-to-end user journey for the policy maker persona |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Full product backlog — epics E0–E9, stories, acceptance criteria |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Public data sources, access URLs, formats, and field mappings |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Cloud SQL schema — all tables, columns, types, and relationships |
| [`docs/LLM_PROMPT_TEMPLATES.md`](docs/LLM_PROMPT_TEMPLATES.md) | ADK LlmAgent prompt templates, output schema, and validation rules |
| [`docs/adr/0001-platform-and-stack.md`](docs/adr/0001-platform-and-stack.md) | ADR: Google Cloud + Next.js/TypeScript |
| [`docs/adr/0002-google-adk-for-pipeline-orchestration.md`](docs/adr/0002-google-adk-for-pipeline-orchestration.md) | ADR: Google ADK for pipeline and LLM extraction |
