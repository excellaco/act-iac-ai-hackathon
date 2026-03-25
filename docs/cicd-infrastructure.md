# CI/CD and Infrastructure Pipelines

This document describes the GitHub Actions workflows and Terraform infrastructure pipeline for Parcela.

---

## Overview

Parcela has two categories of automated workflows:

1. **CI/CD** (`ci-cd.yml`) — triggered on every push to `main`; runs quality checks then deploys to Cloud Run
2. **Data pipeline** (`pipeline-*.yml`) — manually triggered; runs individual stages of the zoning data extraction pipeline
3. **Infrastructure** (`infra.yml`) — triggered on PRs touching `infra/` or manually; plans/applies Terraform

---

## CI/CD Workflow (`ci-cd.yml`)

**Trigger:** Push to `main`, or manual dispatch (`workflow_dispatch`)

**Jobs:** `quality` → `deploy` (sequential; deploy only runs if quality passes)

### `quality` job

Validates code correctness, style, security, and coverage before any deployment occurs.

| Step | Command / Action | Purpose |
|------|-----------------|---------|
| Checkout | `actions/checkout@v5` | Fetch source code |
| Setup Node | `actions/setup-node@v5` (Node 20, npm cache) | Install Node.js runtime |
| Install deps | `npm ci` | Install exact dependency versions |
| Type check | `npx tsc --noEmit` | Fail on TypeScript type errors |
| Lint | `npm run lint` | Fail on ESLint violations |
| Test | `npm test` | Run Jest unit and component tests |
| Snyk scan | `snyk/actions/node@master` (`--severity-threshold=high`) | Fail on high/critical dependency vulnerabilities |
| Snyk monitor | `snyk/actions/node@master` (`command: monitor`) | Send dependency snapshot to Snyk dashboard |
| SonarCloud | `SonarSource/sonarqube-scan-action@v6` | Run static analysis; results visible in SonarCloud |

**Secrets required:** `SNYK_TOKEN`, `SONAR_TOKEN`

### `deploy` job

Builds and deploys the application to Cloud Run after `quality` passes.

| Step | Command / Action | Purpose |
|------|-----------------|---------|
| Checkout | `actions/checkout@v5` | Fetch source code |
| Setup Node | `actions/setup-node@v5` (Node 20, npm cache) | Install Node.js runtime |
| Install deps | `npm ci` | Install exact dependency versions |
| Build | `npm run build` | Build Next.js production bundle |
| GCP Auth | `google-github-actions/auth@v2` | Authenticate via Workload Identity Federation |
| Setup gcloud | `google-github-actions/setup-gcloud@v2` | Install `gcloud` CLI |
| Cloud SQL Auth Proxy | curl + start proxy | Open tunnel to Cloud SQL on port 5432 |
| DB migrations | `npm run db:migrate` | Apply any pending Drizzle migrations to Cloud SQL |
| DB seed | `npm run db:seed:all` | Seed jurisdictions, scores, market data |
| Check GCS bucket | `scripts/check-gcs-bucket.sh` | Verify the raw data bucket is accessible; fail with instructions if not |
| Configure Docker | `gcloud auth configure-docker` | Authenticate Docker to Artifact Registry |
| Build image | `docker build` + `docker push` | Build container image tagged with commit SHA and push to Artifact Registry |
| Deploy | `gcloud run deploy` | Deploy the new image to Cloud Run (us-central1, unauthenticated access) |

**Secrets required:** `GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `DATABASE_URL`, `DATABASE_URL_MIGRATE`

**Cloud Run environment variables set at deploy time:** `DATABASE_URL`, `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `RAW_DATA_BUCKET`, `CHAT_MODEL`

---

## Data Pipeline Workflows

All pipeline workflows are triggered manually via **Actions → [workflow name] → Run workflow**. Each prompts for a jurisdiction slug and (where applicable) a zone code.

### Pipeline — Document Pre-processing (`pipeline-parse.yml`)

**Trigger:** Manual dispatch — select jurisdiction (`fairfax_va`, `arlington_va`, `loudoun_va`)

**Purpose:** Fetches and parses the source PDF for a jurisdiction and writes a parsed-pages artifact to GCS. This is Stage 0 of the data pipeline and must run before any other pipeline stage.

| Step | Purpose |
|------|---------|
| Checkout, Node setup, `npm ci` | Standard setup |
| GCP Auth + setup-gcloud | Authenticate to GCP for GCS access |
| Start Cloud SQL Auth Proxy | Open tunnel to Cloud SQL |
| Run `pipeline:parse <jurisdiction>` | Fetch PDF (or read OCR output) and write pages artifact to GCS |

**Outputs:** `gs://parcela-490518-raw-data/zoning/<slug>/artifacts/<slug>_pages.json`

**Next step:** Run `pipeline-zones.yml` for the same jurisdiction.

---

### Pipeline — Zone Discovery (`pipeline-zones.yml`)

**Trigger:** Manual dispatch — select jurisdiction

**Purpose:** Reads the pages artifact, calls Gemini to discover all residential zoning districts, writes a zones artifact to GCS, syncs it to the repo, and opens a PR for human review. This is Stage 1.

**Prerequisite:** `pipeline-parse.yml` must have run successfully for the jurisdiction (checks for the pages artifact in GCS and exits with an error if not found).

| Step | Purpose |
|------|---------|
| Checkout, Node setup, `npm ci` | Standard setup |
| GCP Auth + setup-gcloud | Authenticate to GCP |
| Start Cloud SQL Auth Proxy | Open tunnel to Cloud SQL |
| Check pages artifact exists | Verify prerequisite; fail fast with instructions if missing |
| Run `pipeline:zones <jurisdiction>` | Discover zones via Gemini; write zones artifact to GCS |
| Sync artifacts from GCS | Download zones artifact from GCS to `data/artifacts/<slug>/` |
| Create PR | Commit zones artifact to a branch `artifacts/<slug>/zones-<run_id>` and open a PR for review |

**PR checklist (presented to reviewer):**
- Open `data/artifacts/<slug>/<slug>_zones.json`
- Review discovered zones for accuracy
- Set `"approved": true` on each zone to include in extraction
- Commit change to the PR branch and merge

**Outputs:** PR with `data/artifacts/<slug>/<slug>_zones.json`

**Next step:** After PR is merged with approved artifact, run `pipeline-extract.yml`.

---

### Pipeline — Field Extraction (`pipeline-extract.yml`)

**Trigger:** Manual dispatch — select jurisdiction; optionally specify a single zone code (leave blank to process all approved zones)

**Purpose:** Reads approved zones artifact, calls Gemini to extract regulatory fields for each zone, writes field artifacts, syncs them to the repo, and opens a PR for human review. This is Stage 2.

| Step | Purpose |
|------|---------|
| Checkout, Node setup, `npm ci` | Standard setup |
| GCP Auth + setup-gcloud | Authenticate to GCP |
| Run `pipeline:extract <jurisdiction> [zone]` | Extract fields via Gemini for all approved zones (or a single zone); write field artifacts to GCS |
| Sync artifacts from GCS | Download field artifacts from GCS to `data/artifacts/<slug>/` |
| Create PR | Commit field artifacts to a branch `artifacts/<slug>/extract-<run_id>` and open a PR for review |

**PR checklist (presented to reviewer):**
- Review each zone fields JSON file under `data/artifacts/<slug>/`
- Verify extracted field values against the source ordinance
- Set `"approved": true` in each zone fields file that is ready to load
- Commit changes to the PR branch and merge

**Outputs:** PR with `data/artifacts/<slug>/<slug>_<zone-slug>_fields.json` (one per zone)

**Next step:** After PR is merged with approved field artifacts, run `pipeline-load.yml`.

---

### Pipeline — Load to Database (`pipeline-load.yml`)

**Trigger:** Manual dispatch — select jurisdiction; optionally specify a single zone code

**Purpose:** Reads approved zone field artifacts from the repo and upserts them into the Cloud SQL database. This is Stage 3.

**Note:** This workflow intentionally omits `setup-gcloud` — the load stage reads only from the local repo (`LocalArtifactStore`) and never touches GCS. GCP auth is used only for the Cloud SQL Auth Proxy.

| Step | Purpose |
|------|---------|
| Checkout, Node setup, `npm ci` | Standard setup |
| GCP Auth | Authenticate to GCP (for Cloud SQL Auth Proxy only) |
| Start Cloud SQL Auth Proxy | Open tunnel to Cloud SQL |
| Run `pipeline:load <jurisdiction> [zone]` | Read approved artifacts and upsert zone fields into `zone_extracted_fields` |

**Outputs:** Rows in `zone_extracted_fields`, `pipeline_runs` tables in Cloud SQL

**Next step:** Run `pipeline-score.yml`.

---

### Pipeline — Scoring (`pipeline-score.yml`)

**Trigger:** Manual dispatch — select jurisdiction

**Purpose:** Reads zone fields from the database, computes RIS sub-scores and composite scores, writes results to the database, and commits a scores artifact to the repo. This is Stage 4. Scores are fully pipeline-generated so the PR is merged automatically.

| Step | Purpose |
|------|---------|
| Checkout, Node setup, `npm ci` | Standard setup |
| GCP Auth + setup-gcloud | Authenticate to GCP |
| Start Cloud SQL Auth Proxy | Open tunnel to Cloud SQL |
| Run `pipeline:score <jurisdiction>` | Read zone fields from DB, compute RIS scores, write to `zone_ris_scores` / `ris_scores` / `feasibility_outputs`, write scores artifact |
| Commit scores and auto-merge PR | Commit `<slug>_scores.json` to `artifacts/<slug>/scores-<run_id>`, open PR, immediately merge with `--squash --auto` |

**Outputs:**
- Database tables: `zone_ris_scores`, `ris_scores`, `feasibility_outputs`
- `data/artifacts/<slug>/<slug>_scores.json` (auto-merged to main)

---

### Deprecated: Extraction Pipeline (`pipeline.yml`)

This workflow is superseded by the four stage-specific workflows above. It remains in the repo during the migration period for backwards compatibility. Use the stage-specific workflows for all new pipeline runs.

---

## Infrastructure Workflow (`infra.yml`)

**Trigger:**
- Automatically on pull requests that touch files under `infra/`
- Manually via **Actions → Infrastructure → Run workflow** (choose `plan` or `apply`)

**Purpose:** Validates and applies Terraform infrastructure changes for the Parcela GCP environment. Infrastructure is defined in the `infra/` directory.

| Step | Purpose |
|------|---------|
| Checkout | Fetch source code |
| GCP Auth | Authenticate via Workload Identity Federation |
| Setup Terraform | Install Terraform ~1.5 |
| `terraform init` | Initialize Terraform providers and backend |
| `terraform validate` | Validate configuration syntax |
| `terraform plan` | Generate and display execution plan (always runs) |
| `terraform apply` | Apply changes (only runs on manual dispatch with `action: apply`) |

**Working directory:** `infra/`

**Default behavior on PRs:** Runs init, validate, and plan. Plan output is visible in the Actions run log. No changes are applied.

**To apply infrastructure changes:** Trigger manually via **Actions → Infrastructure → Run workflow**, select `apply`.

**Secrets required:** `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_PROJECT_ID`

---

## GitHub Secrets Reference

| Secret | Used by | Description |
|--------|---------|-------------|
| `GCP_PROJECT_ID` | All GCP workflows | GCP project ID (`parcela-490518`) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | All GCP workflows | Workload Identity Federation provider URI |
| `DATABASE_URL` | `ci-cd.yml` (deploy) | Cloud SQL Unix socket URL for Cloud Run runtime |
| `DATABASE_URL_MIGRATE` | `ci-cd.yml` (deploy), pipeline workflows | Cloud SQL TCP URL for CI migrations and pipeline runs (via Cloud SQL Auth Proxy) |
| `SNYK_TOKEN` | `ci-cd.yml` (quality) | Snyk auth token for dependency scanning |
| `SONAR_TOKEN` | `ci-cd.yml` (quality) | SonarCloud token for static analysis |

---

## GCP Authentication

All workflows authenticate to GCP using **Workload Identity Federation** — no service account JSON key is stored in GitHub. The `GCP_WORKLOAD_IDENTITY_PROVIDER` secret contains the provider URI that GitHub Actions uses to obtain short-lived GCP credentials.

See the README for one-time GCP setup instructions.

---

## Cloud Run Deployment Details

The `deploy` job in `ci-cd.yml` deploys to:

- **Service:** `excella-ai-hackathon`
- **Region:** `us-central1`
- **Image:** `us-central1-docker.pkg.dev/<project>/excella-ai-hackathon/excella-ai-hackathon:<commit-sha>`
- **Access:** `--allow-unauthenticated` (public)
- **Cloud SQL:** Connected via Unix socket (`--add-cloudsql-instances <project>:us-central1:parcela`)

The `DATABASE_URL_MIGRATE` secret (TCP connection via Cloud SQL Auth Proxy) is used during CI for migrations and seeding. The `DATABASE_URL` secret (Unix socket) is injected at deploy time as the runtime database URL for the Cloud Run service.
