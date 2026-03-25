# Data Pipeline

This document describes the Parcela data pipeline end-to-end: how zoning ordinance PDFs are fetched, parsed, analyzed by Gemini, loaded into the database, and scored to produce Regulatory Impact Scores (RIS).

---

## Overview

The pipeline transforms unstructured zoning ordinance PDFs into structured, scored data:

```
PDF (GCS or local)
       |
  Stage 0: pipeline:parse    — fetch PDF and extract text (text mode or OCR mode)
       |
  Stage 1: pipeline:zones    — Gemini zone discovery → artifact → human approval gate
       |
  Stage 2: pipeline:extract  — Gemini field extraction per zone → artifact → human approval gate
       |
  Stage 3: pipeline:load     — upsert approved artifacts into database
       |
  Stage 4: pipeline:score    — compute RIS scores from loaded fields
       |
  data/artifacts/{slug}/{slug}_scores.json
```

Stages 1 and 2 write artifacts to the repo and require human review and approval before the next stage runs. This human-in-the-loop design ensures LLM output is reviewed before it enters the database.

---

## Per-Jurisdiction Configuration

Each jurisdiction has a configuration file at `data/config/<slug>.json` that controls where the source PDF comes from and which extraction method to use.

### Schema

```json
{
  "pdf_source": "gs://bucket/path/to/file.pdf",
  "pdf_extraction": "text" | "ocr",
  "ocr_source": "gs://bucket/path/to/ocr/"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `pdf_source` | Recommended | GCS URI of the source PDF. Used in `text` mode to fetch the PDF directly. Required in `ocr` mode to record the source document in the artifact. |
| `pdf_extraction` | No | `"text"` (default) or `"ocr"`. Text mode uses pdf-parse to extract the text layer from a searchable PDF. OCR mode reads pre-computed Cloud Vision output from GCS. |
| `ocr_source` | Required for OCR | GCS prefix where Cloud Vision OCR output JSON files are stored (e.g., `gs://bucket/zoning/slug/ocr/`). |

### Examples

```json
// fairfax_va.json — scanned PDF, uses Cloud Vision OCR
{
  "pdf_source": "gs://parcela-490518-raw-data/zoning/fairfax_va/fairfax_zoning_ordinance_2023_downloaded_20260316.pdf",
  "pdf_extraction": "ocr",
  "ocr_source": "gs://parcela-490518-raw-data/zoning/fairfax_va/ocr/"
}
```

```json
// arlington_va.json — searchable PDF, uses pdf-parse text extraction
{
  "pdf_source": "gs://parcela-490518-raw-data/zoning/arlington_va/arlington_zoning_ordinance.pdf",
  "pdf_extraction": "text"
}
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Use the Cloud SQL Auth Proxy URL in CI (`DATABASE_URL_MIGRATE`). |
| `GOOGLE_CLOUD_PROJECT` | Yes | GCP project ID. Required for Gemini/Vertex AI calls and GCS access. |
| `RAW_DATA_BUCKET` | No | GCS bucket name (e.g., `parcela-490518-raw-data`). If omitted, stages fall back to local `data/raw/` and `data/artifacts/`. |
| `GEMINI_MODEL` | No | Gemini model to use for extraction. Defaults to `gemini-2.0-flash-001`. Set to `gemini-2.5-flash` in CI for higher quality. |

---

## Stage 0 — Document Pre-processing (`pipeline:parse`)

**Script:** `scripts/parse.ts`

Fetches the source PDF for a jurisdiction and extracts its text into a parsed-pages artifact that all subsequent stages read.

### Two extraction modes

**Text mode** (`pdf_extraction: "text"` or not set):
- Fetches the PDF from GCS (or local `data/raw/zoning/<slug>/`) using `GcsFetcher` / `LocalFetcher`
- Parses it with `pdf-parse` to extract the text layer
- Works for digitally-created (searchable) PDFs

**OCR mode** (`pdf_extraction: "ocr"`):
- Reads pre-computed Cloud Vision API output from GCS (assembled by `ocr:pdf`, described below)
- Required for scanned PDFs where the text layer is absent or unusable
- OCR output JSON files are read from the `ocr_source` path in the jurisdiction config

### Output

- `data/artifacts/<slug>/<slug>_pages.json` (local)
- `gs://<RAW_DATA_BUCKET>/zoning/<slug>/artifacts/<slug>_pages.json` (GCS, if `RAW_DATA_BUCKET` is set)

### Usage

```bash
npm run pipeline:parse fairfax_va
npm run pipeline:parse arlington_va
npm run pipeline:parse loudoun_va
```

### Next step

Run `pipeline:zones` after this stage completes.

---

## Stage 1 — Zone Discovery (`pipeline:zones`)

**Script:** `scripts/zones.ts`

Reads the parsed-pages artifact and calls Gemini to identify all residential zoning districts in the document. Produces a zones artifact that requires human review and approval before Stage 2 can proceed.

### What it does

1. Reads `<slug>_pages.json` from the artifact store
2. Chunks the full text into manageable segments
3. Calls Gemini (zone-discovery extractor) on each chunk in parallel to identify zone codes, zone names, and multifamily classification
4. Deduplicates and merges results across chunks
5. Resolves source pages for each zone code (which pages mention that zone code)
6. Writes the zones artifact with `approved: false`

### Output

- `data/artifacts/<slug>/<slug>_zones.json`

The zones artifact structure:

```json
{
  "jurisdictionId": "uuid",
  "slug": "fairfax_va",
  "sourceDocument": "gs://...",
  "extractedAt": "2026-03-20T12:00:00Z",
  "approved": false,
  "include_in_extraction": true,
  "include_in_load": true,
  "zones": [
    {
      "zone_code": "PDH-4",
      "zone_name": "Planned Development Housing",
      "multifamily_classification": "primary",
      "source_pages": [42, 43, 44],
      "include_in_extraction": true,
      "include_in_load": true
    }
  ]
}
```

### Approval gate

After the artifact is written, a reviewer must:

1. Open `data/artifacts/<slug>/<slug>_zones.json`
2. Review the discovered zones for accuracy and completeness
3. Set `"approved": true` at the top level of the artifact
4. Optionally set `"include_in_extraction": false` on individual zones to skip them in Stage 2
5. Commit the approved artifact to the repo

The pipeline:zones script will refuse to re-run if an artifact already exists with `approved: false` (to avoid overwriting a partially-reviewed artifact). Delete or rename the file to start over.

### Usage

```bash
npm run pipeline:zones fairfax_va
```

### Next step

Review and approve the zones artifact, then run `pipeline:extract`.

---

## Stage 2 — Field Extraction (`pipeline:extract`)

**Script:** `scripts/extract.ts`

Reads the approved zones artifact and, for each zone marked `include_in_extraction: true`, calls Gemini to extract regulatory fields from the relevant pages of the zoning ordinance. Produces one field artifact per zone.

### What it does

For each approved zone:
1. Looks up the zone's source pages from the zones artifact
2. Extracts the relevant page text from the pages artifact
3. Calls Gemini (field extraction LlmAgent) to extract structured regulatory fields
4. Writes a zone fields artifact with `approved: false`

### Extracted fields

| Field name | Description |
|-----------|-------------|
| `min_lot_size_sqft` | Minimum lot size in square feet |
| `height_limit_ft` | Maximum building height in feet |
| `density_limit_units_per_acre` | Maximum dwelling units per acre |
| `parking_min_spaces_per_unit` | Minimum parking spaces per dwelling unit |
| `setback_front_ft` | Front setback in feet |
| `setback_side_ft` | Side setback in feet |
| `setback_rear_ft` | Rear setback in feet |
| `discretionary_review_required` | Type of review required (`by_right`, `conditional_use_permit`, `special_use_permit`) |

### Output

- `data/artifacts/<slug>/<slug>_<zone-slug>_fields.json` — one file per zone

Example: `data/artifacts/fairfax_va/fairfax_va_pdh-4_fields.json`

The fields artifact structure:

```json
{
  "jurisdictionId": "uuid",
  "slug": "fairfax_va",
  "zoneCode": "PDH-4",
  "zoneName": "Planned Development Housing",
  "multifamilyClassification": "primary",
  "sourceDocument": "gs://...",
  "extractedAt": "2026-03-20T12:00:00Z",
  "approved": false,
  "fields": {
    "min_lot_size_sqft": {
      "raw_value": "6000",
      "raw_unit": "sq ft",
      "field_value": 6000,
      "field_value_text": null,
      "unit": "sqft",
      "confidence": 0.92,
      "source_section": "Section 4-301",
      "source_page": 43,
      "reasoning": "Found 'minimum lot area: 6,000 square feet' in Section 4-301"
    }
  }
}
```

### Approval gate

After extraction, a reviewer must:

1. Open each `<slug>_<zone-slug>_fields.json` artifact
2. Verify the extracted field values against the source ordinance (source section and page are provided for each field)
3. Set `"approved": true` on each zone fields artifact that is ready to load
4. Commit the approved artifacts to the repo

Only artifacts with `approved: true` will be loaded into the database by Stage 3.

### Usage

```bash
# Extract all approved zones for a jurisdiction
npm run pipeline:extract fairfax_va

# Extract a single specific zone
npm run pipeline:extract fairfax_va PDH-4
```

### Next step

Review and approve field artifacts, then run `pipeline:load`.

---

## Stage 3 — Load to Database (`pipeline:load`)

**Script:** `scripts/load.ts`

Reads approved zone fields artifacts from the local repo and upserts each zone's fields into the `zone_extracted_fields` table. Always reads from the local repo (never from GCS).

### What it does

1. Reads the zones artifact to get the canonical list of zones
2. Finds all `<slug>_<zone-slug>_fields.json` files in `data/artifacts/<slug>/`
3. Skips zones where:
   - The fields artifact has `approved: false`
   - The zone has `include_in_load: false` in the zones artifact
   - The field file does not correspond to a known zone
4. For each approved zone, normalizes and validates the field values, then upserts into `zone_extracted_fields`
5. Records a pipeline run in the `pipeline_runs` table

### Usage

```bash
# Load all approved zones for a jurisdiction
npm run pipeline:load fairfax_va

# Load a single zone
npm run pipeline:load fairfax_va PDH-4
```

Note: Always run `pipeline:load` against the cloud database (using `DATABASE_URL_MIGRATE`), not a local database. The scoring engine in Stage 4 will read from the same database.

### Next step

Run `pipeline:score`.

---

## Stage 4 — Scoring (`pipeline:score`)

**Script:** `scripts/score.ts`

Reads zone fields from the database and computes Regulatory Impact Scores (RIS) for each zone and for the jurisdiction as a whole. Writes results to the database and produces a scores artifact.

### What it does

1. Loads all `zone_extracted_fields` rows for the jurisdiction from the database
2. Groups fields by zone code
3. For each zone with classification `primary` or `permitted`, computes:
   - **DCI** (Density Constraint Index, 30%) — based on lot size, height limits, density caps
   - **DCOI** (Development Cost Impact, 25%) — based on parking requirements and setbacks
   - **PCI** (Permitting Complexity Indicator, 20%) — based on permit approval rates and discretionary review type
   - **CRP** (Comparative Restrictiveness Percentile, 25%) — ranking within the peer jurisdiction set
4. Averages zone scores to produce jurisdiction-level composite scores
5. Upserts zone scores to `zone_ris_scores`, jurisdiction scores to `ris_scores`, and feasibility outputs to `feasibility_outputs`
6. Writes a scores artifact to `data/artifacts/<slug>/<slug>_scores.json`

### Output

- `data/artifacts/<slug>/<slug>_scores.json`
- Database tables: `zone_ris_scores`, `ris_scores`, `feasibility_outputs`

### Usage

```bash
npm run pipeline:score fairfax_va
```

---

## Supporting Scripts

### `ocr:pdf` — Cloud Vision OCR

**Script:** `scripts/ocr-pdf.ts`

Runs Google Cloud Vision OCR on a zoning ordinance PDF and writes output JSON files to GCS. Use this as a prerequisite for `pipeline:parse` in OCR mode.

```bash
npm run ocr:pdf fairfax_va
```

This is a long-running operation (several minutes for large PDFs). The script:
1. Finds the source PDF in `gs://<RAW_DATA_BUCKET>/zoning/<slug>/`
2. Submits an async OCR job to Cloud Vision
3. Waits for completion
4. Downloads and assembles the output JSON files

After OCR completes, configure `data/config/<slug>.json` with `"pdf_extraction": "ocr"` and `"ocr_source"` pointing to the GCS output prefix, then run `pipeline:parse`.

### `pipeline:purge` — Clear Jurisdiction Data

**Script:** `scripts/purge.ts`

Removes all pipeline data for a jurisdiction from the database (extracted fields, scores, feasibility outputs, pipeline runs). Use before re-running the full pipeline from scratch.

```bash
npm run pipeline:purge fairfax_va
```

### `artifacts:sync` — Sync Artifacts from GCS

Syncs artifact JSON files from GCS to the local `data/artifacts/` directory. Used automatically by the pipeline GitHub Actions workflows after zone discovery and field extraction.

```bash
npm run artifacts:sync fairfax_va
```

---

## Running the Full Pipeline Locally

### Prerequisites

```bash
# Authenticate with Google Cloud
gcloud auth application-default login

# Set required environment variables
export DATABASE_URL="postgresql://postgres:postgres@localhost:5433/parcela"
export GOOGLE_CLOUD_PROJECT="parcela-490518"
export RAW_DATA_BUCKET="parcela-490518-raw-data"   # omit to use local data/raw/

# Start local database
docker compose up -d
npm run db:seed:all
```

### Run each stage in sequence

```bash
# Stage 0 — parse the PDF
npm run pipeline:parse fairfax_va

# Stage 1 — discover zones (then review and approve data/artifacts/fairfax_va/fairfax_va_zones.json)
npm run pipeline:zones fairfax_va

# Stage 2 — extract fields (then review and approve each data/artifacts/fairfax_va/*_fields.json)
npm run pipeline:extract fairfax_va

# Stage 3 — load approved artifacts to database
npm run pipeline:load fairfax_va

# Stage 4 — compute scores
npm run pipeline:score fairfax_va
```

---

## Running the Pipeline via GitHub Actions

Each pipeline stage has a dedicated GitHub Actions workflow triggered manually via `workflow_dispatch`:

| Workflow | File | Trigger |
|----------|------|---------|
| Pipeline — Document Pre-processing | `pipeline-parse.yml` | Manual — choose jurisdiction |
| Pipeline — Zone Discovery | `pipeline-zones.yml` | Manual — choose jurisdiction |
| Pipeline — Field Extraction | `pipeline-extract.yml` | Manual — choose jurisdiction and optional zone |
| Pipeline — Load to Database | `pipeline-load.yml` | Manual — choose jurisdiction and optional zone |
| Pipeline — Scoring | `pipeline-score.yml` | Manual — choose jurisdiction |

Stages 1 (zones) and 2 (extract) automatically open a PR with the artifact results after the workflow completes. Merge the PR after reviewing and approving the artifacts to make them available for the next stage.

See [`docs/cicd-infrastructure.md`](cicd-infrastructure.md) for full workflow details.

---

## Artifact Approval Workflow Summary

```
pipeline:zones runs
       |
       v
fairfax_va_zones.json written (approved: false)
       |
       v
Pipeline — Zone Discovery workflow opens a PR
       |
       v
Reviewer opens the PR, edits fairfax_va_zones.json:
  - Checks zone codes and names are correct
  - Sets "approved": true
  - Optionally sets include_in_extraction: false on zones to skip
       |
       v
PR merged — artifact is now approved in main
       |
       v
pipeline:extract runs (reads approved zones artifact)
       |
       v
One fields JSON file written per zone (approved: false each)
       |
       v
Pipeline — Field Extraction workflow opens a PR
       |
       v
Reviewer opens the PR, edits each fields JSON file:
  - Verifies field values against source ordinance
  - Sets "approved": true on each file that is ready
       |
       v
PR merged — approved field artifacts are in main
       |
       v
pipeline:load runs — only approved artifacts are loaded
       |
       v
pipeline:score runs
```
