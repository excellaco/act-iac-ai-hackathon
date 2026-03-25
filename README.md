# Parcella — AI-Powered Housing Regulatory Intelligence Platform

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An AI-powered housing regulatory and development feasibility intelligence platform built for the ACT-IAC AI Hackathon.

Parcella transforms unstructured municipal zoning documents into structured, comparable data — enabling policymakers and housing agency staff to quantify regulatory constraints, compare jurisdictions, and model the impact of potential policy changes.

> **Live demo:** https://excella-ai-hackathon-w53o5h2jra-uc.a.run.app

---

## Hackathon Submission

### The Problem

Housing affordability in the United States is heavily shaped by local zoning regulations — minimum lot sizes, height limits, parking requirements, density caps, and discretionary review processes that add cost, time, and uncertainty to every multifamily development project. These regulations exist across thousands of municipal zoning ordinances, each hundreds of pages long, each in a different format. There is no systematic way to compare them, model their impact, or understand how a policy change in one jurisdiction might affect housing supply.

Federal housing agencies and state-level housing finance agencies lack the tools to quantify regulatory constraints at scale. Policy analysts spend weeks manually reading zoning ordinances. There is no feedback loop between regulatory choices and housing outcomes.

### Our Solution

Parcella is an AI-powered Regulatory Impact Scoring (RIS) platform that solves this problem end-to-end:

1. **AI-Powered Extraction** — A five-stage pipeline fetches zoning ordinance PDFs, parses them (text or OCR), and uses Gemini 2.5 Flash to identify all residential zoning districts and extract key regulatory fields for each: minimum lot size, height limits, density caps, parking requirements, setbacks, and discretionary review type. Extractions include confidence tiers and verbatim source citations with page-level links back to the original document.

2. **Regulatory Impact Scoring** — A deterministic TypeScript scoring engine computes a 0–100 Regulatory Impact Score (RIS) and four weighted sub-scores for each jurisdiction, based on extracted fields and market data from public APIs (HUD, Census, BLS). The formula, weights, and data sources are fully transparent and displayed inline.

3. **Cross-Jurisdiction Comparison** — Side-by-side comparison of up to three jurisdictions with ranked sub-scores, field-level data, development feasibility metrics, and geographic context maps.

4. **What-If Policy Simulation** — Slider-based simulation that recalculates scores and feasibility outputs in real time as the user adjusts regulatory parameters — answering "what would happen if we reduced parking minimums from 2.0 to 1.0 spaces per unit?"

5. **Conversational Policy Chat** — An AI chat agent (Google ADK `LlmAgent`) lets analysts ask natural language questions about the zoning data: "Why is Fairfax's parking score so high?", "What does the ordinance say about ADUs?", "What if density limits were doubled?" The agent retrieves jurisdiction data, reads the source PDF, and runs feasibility calculations using declared tools.

### What Makes It Innovative

- **LLM + deterministic hybrid**: Gemini handles the hard part (reading unstructured PDFs and extracting structured data) while a transparent, deterministic TypeScript engine does the scoring. This means the RIS is reproducible and auditable, not a black box.
- **Human-in-the-loop pipeline**: Every Gemini extraction is gated behind a human approval step before data enters the database. Reviewers see verbatim citations, confidence scores, and source page references.
- **Responsible AI by design**: Confidence badges, verbatim citations, and a methodology disclosure modal are built into the UI. The RIS is explicitly framed as descriptive, not prescriptive.
- **Real public data**: Market inputs (Fair Market Rents, building permits, ACS housing data) are pulled live from HUD, Census, and BLS APIs.

### Real-World Impact

Parcella is designed for HUD policy analysts and state housing finance agency staff who need to:

- Identify which jurisdictions have the most restrictive zoning and quantify by how much
- Model the impact of specific policy reforms (e.g., "what if Fairfax County eliminated parking minimums?")
- Generate data-backed recommendations for zoning reform that could increase housing supply

The platform could be extended to cover all Virginia jurisdictions, then all 50 states, providing a national-scale regulatory intelligence layer for federal housing programs.

---

### Team

**Team name:** Excella

**Designated team lead:** Jeff Gallimore

| Name | Role |
|------|------|
| Jeff Gallimore | Team Lead, Architect & Lead AI Engineer |
| Kathy Chiao | Market Research & Engagement |
| Mimi Chen | UX Designer |
| Charles Fiery | AI Engineer |
| Jay Jemal | AI Engineer |

---

### AI Tools Used

**In the solution:**
- **Google Gemini 2.5 Flash** (via Vertex AI) — zone discovery, regulatory field extraction from zoning ordinance PDFs, chat agent responses
- **Google ADK for TypeScript** (`@google/adk` v0.5.0) — LlmAgent orchestration for the chat interface with declared tools

**In development (per team member):**

| Name | AI Tools |
|------|----------|
| Jeff Gallimore | Claude Desktop (Sonnet 4.6, Opus 4.6), Claude Code (agent teams), OpenAI Codex, Gemini 2.5 Flash, Vertex AI, GitHub Copilot, Snyk |
| Kathy Chiao | Claude, ChatGPT, Adobe Photoshop (Firefly & Nano Banana) |
| Mimi Chen | Figma (Design & Figma Make), Claude Sonnet 4.6 |
| Charles Fiery | Claude Code (Opus 4.6), GitHub Copilot Code Review, OpenAI Codex (GPT-5.4) |
| Jay Jemal | VS Code Copilot, Claude Sonnet 4.6 Desktop, GPT 5.4, Google Colab, Gemini 2.5 Flash |

---

### Open-Source Libraries & Tools

Key dependencies and tools (full list in `package.json`):

| Library / Tool | Purpose |
|----------------|---------|
| Next.js 16 | Application framework and API routes |
| React 19 | UI rendering |
| TypeScript 5 | Type-safe development |
| Drizzle ORM | Database schema, migrations, and queries |
| PostgreSQL (pg) | Database driver |
| Leaflet + React Leaflet | Interactive choropleth maps (no API key required) |
| pdf-parse | PDF text layer extraction |
| `@google-cloud/storage` | GCS SDK for PDF and artifact storage |
| `@google-cloud/vertexai` | Vertex AI SDK for Gemini extraction |
| `@google-cloud/vision` | Cloud Vision SDK for OCR on scanned PDFs |
| p-limit | Concurrency control for Gemini API calls |
| Jest + React Testing Library | Unit and component tests (590+ tests) |
| ESLint | Code quality linting |
| SonarCloud | Static analysis and coverage gates |
| Snyk | Dependency vulnerability scanning |
| Terraform | Infrastructure as Code (GCS bucket, IAM) |

---

## How AI Is Used

Parcella uses AI at two distinct layers — both designed for transparency and traceability:

### Extraction Pipeline (Batch, Pre-Processing)

The ingestion pipeline runs Gemini 2.5 Flash against full zoning ordinance PDFs to extract structured regulatory data. This is not a simple summarization — it's a targeted, field-by-field extraction with:

- **Per-zone district discovery** — the LLM first identifies all residential zoning districts in the ordinance, then extracts field values for each district independently
- **Structured output schemas** — each extraction returns a typed JSON object with value, unit, confidence tier, verbatim source quote, and section citation
- **Confidence tiers** (High / Medium / Low) — assigned by the LLM based on how clearly the value appears in the text, displayed to the user as badges
- **Gold fixture validation** — extraction prompts are evaluated against a hand-curated set of test cases with known correct answers
- **Deterministic post-processing** — raw LLM outputs pass through normalization (unit conversion) and validation (plausibility range checks) before entering the database

### Chat Agent (Real-Time, Interactive)

The chat agent uses Google ADK's `LlmAgent` with three declared tools:

| Tool | What It Does |
|------|-------------|
| `get_jurisdiction_data` | Retrieves scores, extracted fields, feasibility metrics, and market data from the database |
| `get_pdf_text` | Fetches and returns the full parsed text of the zoning ordinance PDF (50–150K tokens via Gemini's 1M context window — no RAG needed) |
| `compute_feasibility` | Runs live what-if feasibility calculations with modified parameters |

The agent is instructed to cite source sections, never make policy recommendations, and note when data is illustrative rather than extracted from a real document.

---

## Explainability & Responsible AI

Parcella is designed for a government audience that needs to **trust and defend** the outputs. Every design decision prioritizes transparency:

| Practice | How It's Implemented |
|----------|---------------------|
| **Transparent scoring** | RIS formula, sub-score weights, and rationale are documented and displayed in the UI via "About this score" |
| **Source attribution** | Every extracted field links to the specific page and section of the source ordinance PDF |
| **Confidence badges** | High / Medium / Low tiers on every data point — users see where the AI is confident and where it isn't |
| **Verbatim quotes** | Extracted fields include the exact text from the ordinance, not paraphrases |
| **No policy recommendations** | The platform quantifies regulatory constraint — it does not recommend changes. A persistent disclaimer states: *"This score measures regulatory constraint and does not recommend policy positions."* |
| **Descriptive, not prescriptive** | The RIS is explicitly framed as a descriptive index, not a normative judgment |
| **Public data sources** | All market data (HUD FMR, Census ACS, Census Building Permits) comes from publicly accessible federal datasets with documented vintage and methodology |
| **Synthetic data clearly labeled** | Illustrative peer jurisdictions used for comparative scoring are flagged as "Illustrative data — not from official sources" in the UI |

---

## Feasibility for Government Adoption

Parcella is built with a realistic path to production deployment in a federal environment:

- **Google Cloud (FedRAMP-authorized)** — deployed on Cloud Run, Cloud SQL, and Vertex AI — all available in Google's FedRAMP-authorized environment
- **No proprietary data dependencies** — all data sources are publicly available federal datasets (HUD, Census Bureau, BLS, BEA)
- **Infrastructure as Code** — Terraform manages cloud resources; CI/CD via GitHub Actions with Workload Identity Federation (no static keys)
- **Scalable architecture** — adding a new jurisdiction requires uploading a PDF and running the extraction pipeline. No code changes needed.
- **Security posture** — Snyk dependency scanning, SonarCloud code quality analysis, automated linting and type checking on every commit

### Path from MVP to Production

| MVP (Current) | Production |
|---------------|-----------|
| 10 jurisdictions (VA/MD) | National coverage via automated PDF ingestion |
| Manual pipeline trigger | Scheduled pipeline with document change monitoring |
| No authentication | Federated SSO (PIV/CAC for federal users) |
| Single Cloud Run instance | Multi-region with defined RTO/RPO |
| Inline confidence badges | Formal ATO with NIST 800-53 controls |

---

## Regulatory Impact Score (RIS)

The RIS is a composite 0–100 index measuring regulatory constraint. Higher score = more restrictive.

| Sub-score | Weight | What It Measures |
|-----------|--------|-----------------|
| Density Constraint Index (DCI) | 30% | Lot size, height limits, density limits, setbacks |
| Development Cost Impact (DCOI) | 25% | Parking requirements, regional construction costs |
| Permitting Complexity Indicator (PCI) | 20% | Discretionary review requirements, permit volume |
| Comparative Restrictiveness Percentile (CRP) | 25% | Ranking within peer jurisdiction set |

All sub-scores are normalized 0–100 using min-max normalization against the peer set. The formula, weights, and rationale are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Architecture

```
Zoning PDFs + Public Datasets (HUD, Census, BLS, BEA)
        |
[ Ingestion & Extraction Pipeline ]  Gemini 2.5 Flash via Vertex AI
  Fetch PDF → Parse → Discover zones → Extract per-zone fields → Normalize → Validate → Store
        |
[ Scoring Engine ]                   Deterministic TypeScript
  DCI + DCOI + PCI + CRP → RIS composite → Feasibility modeling
        |
[ API Layer ]                        Next.js API routes → Cloud SQL (PostgreSQL)
  /api/jurisdictions, /api/.../score, /api/.../chat, /api/.../pdf
        |
[ Dashboard UI ]                     Next.js / React on Cloud Run
  Search + Map → Score Panel → Compare → What-If → Chat Agent
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full layer-by-layer breakdown, and [`docs/adr/`](docs/adr/) for architectural decision records.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend & API | Next.js 16 + TypeScript |
| AI — Extraction | Gemini 2.5 Flash via `@google-cloud/vertexai` |
| AI — Chat Agent | Google ADK `LlmAgent` via `@google/adk` |
| Database | Cloud SQL (PostgreSQL) via Drizzle ORM |
| PDF Storage | Google Cloud Storage |
| Deployment | Google Cloud Run |
| Infrastructure | Terraform |
| CI/CD | GitHub Actions (Workload Identity Federation — no static keys) |
| Code Quality | ESLint, SonarCloud, Snyk, Jest (590+ tests) |

---

## Data Sources

All data is sourced from publicly available federal datasets:

| Source | Data | Vintage |
|--------|------|---------|
| Municipal zoning ordinance PDFs | Regulatory field values | Current as of download |
| HUD Fair Market Rents | 2BR FMR for rent feasibility | FY2025 |
| Census ACS (B25001/B25002) | Housing units, population | 2020–2024 5-year |
| Census Building Permits Survey | Permit volume by structure type | 2023 annual |
| BLS Occupational Employment Statistics | Regional labor costs | May 2024 |
| BEA Regional Price Parities | Regional cost multipliers | 2023 |

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for download URLs, formats, and field mappings.

---

## Live Demo

**URL:** https://excella-ai-hackathon-w53o5h2jra-uc.a.run.app

**Try it:**
1. Search for "Fairfax County" and select it
2. Review the RIS score, sub-scores, and confidence badges
3. Expand a sub-score accordion to see source citations — click "View source" to see the original PDF
4. Click "Compare Peers" to add Arlington or Loudoun
5. Toggle "What-If Simulation" and adjust parking minimums
6. Expand "Ask about Fairfax County, VA" and ask: "Why is the parking score so high?"

---

## Running Locally

```bash
# Prerequisites: Node.js 20+, Docker

# Start local PostgreSQL
docker compose up -d

# Install dependencies and seed the database
npm install
npm run db:push
npm run db:seed:all

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The map, scores, comparison, and what-if features work locally. The chat agent requires GCP credentials (`gcloud auth application-default login`).

---

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture diagram and layer descriptions |
| [`docs/PERSONA.md`](docs/PERSONA.md) | Primary user persona — Valentina Reyes (Val), Housing Policy Analyst |
| [`docs/USER_JOURNEY.md`](docs/USER_JOURNEY.md) | End-to-end user journey for the policy maker persona |
| [`docs/BACKLOG.md`](docs/BACKLOG.md) | Full product backlog — epics E0–E9, stories, acceptance criteria |
| [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) | Public data sources, access URLs, formats, and field mappings |
| [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) | Cloud SQL schema — all tables, columns, types, and relationships |
| [`docs/LLM_PROMPT_TEMPLATES.md`](docs/LLM_PROMPT_TEMPLATES.md) | ADK LlmAgent prompt templates, output schema, and validation rules |
| [`docs/data-pipeline.md`](docs/data-pipeline.md) | End-to-end data pipeline — stages, commands, artifact approval workflow |
| [`docs/cicd-infrastructure.md`](docs/cicd-infrastructure.md) | GitHub Actions CI/CD workflows and infrastructure pipeline |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Post-hackathon next steps and improvement opportunities |
| [`docs/RETROSPECTIVE.md`](docs/RETROSPECTIVE.md) | Team learnings from the hackathon build |
| [`docs/research/`](docs/research/) | User research — interviews and findings |
| [`docs/adr/`](docs/adr/) | Architectural Decision Records (ADR-0001 through ADR-0006) |
