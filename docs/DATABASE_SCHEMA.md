# Parcela — Database Schema

This document defines the Cloud SQL (PostgreSQL) schema for the Parcela platform. All tables are created and owned by the backend API (E9). The ingestion pipeline writes to `jurisdictions`, `extracted_fields`, and `pipeline_runs`. The scoring engine reads from those tables and writes to `ris_scores`. The API serves from all four.

> **Table creation order:** Due to foreign key dependencies, tables must be created in this order: `jurisdictions` → `pipeline_runs` → `extracted_fields` → `ris_scores` → `feasibility_outputs`.

---

## Tables

### `jurisdictions`

The master list of jurisdictions supported by the platform. Seeded manually for the three MVP demo jurisdictions.

```sql
CREATE TABLE jurisdictions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,                  -- e.g. "Fairfax County"
  state         TEXT NOT NULL,                  -- e.g. "VA"
  fips_state    CHAR(2) NOT NULL,               -- e.g. "51"
  fips_county   CHAR(3) NOT NULL,               -- e.g. "059"
  display_name  TEXT NOT NULL,                  -- e.g. "Fairfax County, VA"
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fips_state, fips_county)
);
```

**Seed data (MVP):**

| name | state | fips_state | fips_county | display_name |
|------|-------|------------|-------------|--------------|
| Fairfax County | VA | 51 | 059 | Fairfax County, VA |
| Arlington County | VA | 51 | 013 | Arlington County, VA |
| Loudoun County | VA | 51 | 107 | Loudoun County, VA |

---

### `extracted_fields`

Stores the structured regulatory fields extracted by the LLM pipeline for each jurisdiction. One row per field per jurisdiction. Updated on each pipeline run.

```sql
CREATE TYPE confidence_tier AS ENUM ('high', 'medium', 'low');

CREATE TABLE extracted_fields (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id     UUID NOT NULL REFERENCES jurisdictions(id),
  field_name          TEXT NOT NULL,            -- e.g. "min_lot_size_sqft"
  field_value         NUMERIC,                  -- extracted numeric value
  field_value_text    TEXT,                     -- raw extracted text (for display)
  unit                TEXT,                     -- e.g. "sqft", "ft", "units_per_acre"
  confidence          confidence_tier NOT NULL,
  source_document     TEXT,                     -- e.g. "aczo_2023.pdf"
  source_section      TEXT,                     -- e.g. "Article 2, Section 2.1.4"
  district_context    TEXT,                     -- e.g. "RA4-30 Multifamily"
  pipeline_run_id     UUID REFERENCES pipeline_runs(id),
  extracted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, field_name)
);
```

**Field names (E2 stories):**

| field_name | Unit | Story | Description |
|---|---|---|---|
| `min_lot_size_sqft` | sqft | E2-1 | Minimum lot size in square feet |
| `height_limit_ft` | ft | E2-2 | Maximum building height in feet |
| `density_limit_units_per_acre` | units_per_acre | E2-3 | Maximum dwelling units per acre |
| `parking_min_spaces_per_unit` | spaces_per_unit | E2-4 | Required parking spaces per dwelling unit |
| `setback_front_ft` | ft | E2-5 | Minimum front setback in feet |
| `setback_side_ft` | ft | E2-5 | Minimum side setback in feet |
| `setback_rear_ft` | ft | E2-5 | Minimum rear setback in feet |

---

### `pipeline_runs`

A record of each pipeline execution per jurisdiction, used to surface data freshness in the UI (E6-4) and support re-runs (E0-6).

```sql
CREATE TYPE pipeline_status AS ENUM ('running', 'completed', 'failed', 'partial');

CREATE TABLE pipeline_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id     UUID NOT NULL REFERENCES jurisdictions(id),
  status              pipeline_status NOT NULL DEFAULT 'running',
  fields_extracted    INTEGER NOT NULL DEFAULT 0,
  fields_failed       INTEGER NOT NULL DEFAULT 0,
  source_document     TEXT,                     -- filename of zoning PDF processed
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  error_message       TEXT                      -- populated on failure
);
```

---

### `ris_scores`

Stores the computed Regulatory Impact Score and all sub-scores for each jurisdiction. Updated by the scoring engine after each pipeline run. One row per jurisdiction — upserted on each scoring run.

```sql
CREATE TABLE ris_scores (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id     UUID NOT NULL REFERENCES jurisdictions(id) UNIQUE,
  ris_composite       NUMERIC(5,2) NOT NULL,    -- 0–100 weighted composite
  dci                 NUMERIC(5,2) NOT NULL,    -- Density Constraint Index (30%)
  dcoi                NUMERIC(5,2) NOT NULL,    -- Development Cost Impact (25%)
  pci                 NUMERIC(5,2) NOT NULL,    -- Permitting Complexity Indicator (20%)
  crp                 NUMERIC(5,2) NOT NULL,    -- Comparative Restrictiveness Percentile (25%)
  peer_set            TEXT[],                   -- jurisdiction IDs used for normalization
  scored_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  pipeline_run_id     UUID REFERENCES pipeline_runs(id)
);
```

**RIS composite formula:**
```
ris_composite = (dci × 0.30) + (dcoi × 0.25) + (pci × 0.20) + (crp × 0.25)
```

---

### `feasibility_outputs`

Stores the feasibility modeling outputs for each jurisdiction (E4). Updated alongside RIS scores. One row per jurisdiction — upserted on each scoring run.

```sql
CREATE TABLE feasibility_outputs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id             UUID NOT NULL REFERENCES jurisdictions(id) UNIQUE,
  max_units_per_acre          NUMERIC(8,2),     -- theoretical unit yield
  parking_footprint_pct       NUMERIC(5,2),     -- % of lot consumed by parking
  cost_per_sqft               NUMERIC(8,2),     -- USD/sqft: national_baseline × regional_cost_multiplier
  estimated_cost_per_unit     NUMERIC(10,2),    -- USD: cost_per_sqft × unit_size_sqft + parking_cost_uplift
  regional_cost_multiplier    NUMERIC(4,3),     -- (0.55 × BLS OES labor index) + (0.45 × BEA RPP goods index)
  fmr_2br                     NUMERIC(8,2),     -- HUD 2BR FMR used in calculation (monthly, USD)
  rent_feasibility_ratio      NUMERIC(6,3),     -- (fmr_2br × 12) / estimated_cost_per_unit; >1.0 = rents can support construction cost
  scored_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  pipeline_run_id             UUID REFERENCES pipeline_runs(id)
);
```

---

## Entity Relationship Summary

```
jurisdictions
  ├── extracted_fields  (one jurisdiction → many fields)
  ├── pipeline_runs     (one jurisdiction → many runs)
  ├── ris_scores        (one jurisdiction → one current score)
  └── feasibility_outputs (one jurisdiction → one current output)

pipeline_runs
  ├── extracted_fields  (one run → many fields)
  ├── ris_scores        (one run → one score)
  └── feasibility_outputs (one run → one output)
```

---

## Notes

- All IDs use `UUID` with `gen_random_uuid()` — requires the `pgcrypto` extension on Cloud SQL PostgreSQL.
- The `extracted_fields` table uses `UNIQUE (jurisdiction_id, field_name)` — pipeline re-runs upsert rather than insert to avoid duplicates.
- The `ris_scores` and `feasibility_outputs` tables use `UNIQUE (jurisdiction_id)` for the same reason.
- `peer_set` on `ris_scores` stores the array of jurisdiction IDs used for min-max normalization — important for reproducing scores and explaining the CRP sub-score to users.
- `regional_cost_multiplier` on `feasibility_outputs` is derived from BLS OES (labor, 55% weight) and BEA RPP Goods component (materials, 45% weight) — not RSMeans. See `docs/DATA_SOURCES.md` sections 5 and 6 for the full formula.
- `cost_per_sqft` is stored as an intermediate value (`national_baseline_cost × regional_cost_multiplier`) to support UI display and debugging independently of unit size assumptions.
- `rent_feasibility_ratio` = `(fmr_2br × 12) / estimated_cost_per_unit` — the gross rent-to-cost ratio. A ratio above ~1.0 indicates annual rents can theoretically cover construction cost (ignoring financing, land, and operating costs). This is the primary output for E4-4 and gives Val a single number to cite when comparing jurisdictions on development viability.
- **Storage model: latest-state only.** `extracted_fields`, `ris_scores`, and `feasibility_outputs` store one current row per jurisdiction, upserted on each pipeline run. `pipeline_runs` provides the audit trail. Historical per-run snapshots are out of scope for MVP.
- No soft deletes — the MVP does not need audit history beyond what `pipeline_runs` provides.
