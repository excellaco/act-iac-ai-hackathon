# Parcela — Product Backlog (MVP)

**Hackathon Timeline:** 2 weeks
**Demo Scope:** 2–3 contrasting municipalities (e.g., Fairfax, Arlington, Loudoun counties, VA)
**Primary Persona:** City/County Policy Maker

---

## Epics

| ID | Epic | Description |
|----|------|-------------|
| E0 | Ingestion & Extraction Pipeline | End-to-end batch pipeline orchestrating document fetch, chunking, LLM extraction, validation, and DB write |
| E1 | Data Ingestion | Ingest and process zoning documents and public datasets |
| E2 | LLM Extraction | Extract structured regulatory fields from unstructured zoning text |
| E3 | RIS Scoring Engine | Compute Regulatory Impact Score and sub-scores |
| E4 | Feasibility Modeling | Model unit yield, buildable area, and cost per unit |
| E5 | Search & Map UI | Search-first entry point with contextual national heat map |
| E6 | Score Panel UI | County RIS accordion panel with inline AI disclosures |
| E7 | Comparison View | Side-by-side multi-jurisdiction comparison panels |
| E8 | What-If Simulation | Slider-based policy simulation with live score updates |
| E9 | Infrastructure | Backend API, data pipeline, cloud deployment |

---

## Sprint 1 (Days 1–5): Data, Extraction & Scoring Core

### E0 — Ingestion & Extraction Pipeline

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E0-1 | As a developer, I need a pipeline runner that executes the full ingestion-to-extraction sequence for a given jurisdiction so that I can process all 3 demo jurisdictions in a single batch run | Pipeline accepts a jurisdiction ID; runs fetch → parse → chunk → extract → validate → store in sequence; logs pass/fail per stage | P0 | 3 |
| E0-2 | As a developer, I need zoning PDF text chunked into processable segments so that LLM prompts receive relevant context without exceeding token limits | Text split into overlapping chunks of ≤4000 tokens; chunk boundaries respect section headers where possible | P0 | 2 |
| E0-3 | As a developer, I need the pipeline to handle LLM extraction failures gracefully so that a single bad field doesn't block the whole run | Failed extraction for a field logs the error, sets confidence tier to Low, and continues; pipeline completes with partial results | P0 | 2 |
| E0-4 | As a developer, I need extraction outputs validated before they are written to the database so that bad data doesn't silently corrupt scores | Validation checks: field is present, value is within plausible range, confidence tier is set; failures logged and flagged | P0 | 2 |
| E0-5 | As a developer, I need a pipeline run record stored per jurisdiction so that the UI can display when data was last processed | Run record stores: jurisdiction ID, run timestamp, fields extracted, fields failed, overall status; queryable by jurisdiction | P0 | 1 |
| E0-6 | As a developer, I need the pipeline to be re-runnable for a jurisdiction so that I can refresh data or fix extraction errors before the demo | Re-run overwrites existing extracted fields and updates the run record; prior run record retained in history | P1 | 1 |
| E0-7 | As a developer, I need a deterministic post-extraction normalization step that converts raw extracted values to canonical units so that conversion logic is testable independently of the LLM | Converts raw_value/raw_unit → field_value/unit for all 5 field types (lot size, height, density, parking, setbacks); unit tests cover all conversions; unrecognized raw_unit downgrades confidence to Low | P0 | 2 |

---

### E1 — Data Ingestion

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E1-1 | As a developer, I need zoning code PDFs for 3 municipalities ingested so that the LLM pipeline has source material | PDFs for Fairfax, Arlington, Loudoun downloaded, uploaded to GCS (`parcela-raw-data`), and fetchable by the pipeline; text extracted via PDF parser | P0 | 2 |
| E1-1a | As a developer, I need the zoning ordinance PDFs for Fairfax, Arlington, and Loudoun downloaded and uploaded to GCS so that the pipeline has source material to process | PDFs downloaded per `docs/DATA_SOURCES.md` section 1; uploaded to `gs://parcela-raw-data/zoning/{jurisdiction}/` following naming convention in `data/raw/README.md`; download date recorded. **See also:** #74 (E9-9) — GCS bucket must exist first. | P0 | 2 |
| E1-2 | As a developer, I need FMR data for target jurisdictions loaded so that cost modeling is possible | HUD FMR CSV ingested for target zip codes; queryable by jurisdiction | P0 | 1 |
| E1-3 | As a developer, I need ACS data (population, housing units) loaded so that density context is available | ACS tables B25001/B25002 loaded for target counties | P0 | 1 |
| E1-4 | As a developer, I need building permit data loaded so that permitting complexity can be scored | Census building permit data loaded for target jurisdictions | P1 | 2 |

### E2 — LLM Extraction

> **Note on acceptance criteria:** E2-1 and E2-7 reference "≥80% of gold fixture test cases". The fixture set is defined in E2-0 and must be completed before E2-1 through E2-7 are testable.

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E2-0 | As a developer, I need a gold fixture set of zoning text snippets with known correct answers so that LLM extraction prompts can be evaluated against a concrete benchmark | Fixtures stored in `__tests__/fixtures/zoning/`; 3–5 fixtures per field (E2-1 through E2-7); each fixture includes: source jurisdiction, raw zoning text snippet, expected extracted value, expected confidence tier; covers at least one easy case, one ambiguous case, and one edge case (e.g. value not stated) per field. **Rationale:** "≥80% of test cases" is unverifiable without a defined fixture set. Fixtures also serve as regression tests when prompts are tuned, and are versioned in the repo so the benchmark is reproducible. | P0 | 2 |
| E2-1 | As a developer, I need an LLM prompt that extracts minimum lot size from zoning text so that DCI can be computed | Prompt correctly extracts lot size for ≥80% of gold fixture test cases (E2-0); returns value + confidence tier | P0 | 3 |
| E2-2 | As a developer, I need an LLM prompt that extracts height limits so that DCI can be computed | Returns height limit in feet + confidence tier; ≥80% accuracy against gold fixture test cases (E2-0) | P0 | 2 |
| E2-3 | As a developer, I need an LLM prompt that extracts density limits (units/acre) so that DCI can be computed | Returns units/acre figure + confidence tier; ≥80% accuracy against gold fixture test cases (E2-0) | P0 | 2 |
| E2-4 | As a developer, I need an LLM prompt that extracts parking minimums so that DCOI can be computed | Returns spaces/unit figure + confidence tier; ≥80% accuracy against gold fixture test cases (E2-0) | P0 | 2 |
| E2-5 | As a developer, I need an LLM prompt that extracts setback requirements so that DCI can be computed | Returns front/side/rear setbacks + confidence tier; ≥80% accuracy against gold fixtures (E2-0) | P1 | 2 |
| E2-6 | As a developer, I need extracted fields stored in a structured schema so that the scoring engine can consume them | JSON output per jurisdiction: all fields + confidence tiers + source citation | P0 | 2 |
| E2-7 | As a developer, I need an LLM prompt that extracts the discretionary review requirement for multifamily housing so that PCI can be computed | Returns one of: by-right, conditional use permit required, or special use permit required; plus confidence tier; ≥80% accuracy against gold fixtures (E2-0). **Rationale:** Permit approval rates are not reliably available from public data at county level. The by-right vs. conditional/special use permit distinction is extractable from zoning text and is a real, policy-relevant signal — a jurisdiction that requires a special use permit for multifamily is meaningfully more complex than one that allows it by-right. This field, combined with Census permit volume, gives PCI a defensible public-data foundation without coding against missing inputs. | P0 | 2 |

### E3 — RIS Scoring Engine

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E3-1 | As a developer, I need the Density Constraint Index (DCI) calculated so that it contributes to the RIS | DCI computed using min-max normalization against peer set; returns 0–100 score | P0 | 3 |
| E3-2 | As a developer, I need the Development Cost Impact (DCOI) calculated so that it contributes to the RIS | DCOI uses parking space cost multiplier + regional cost multiplier derived from BLS OES labor wages and BEA Regional Price Parities (Goods component); returns 0–100 | P0 | 3 |
| E3-3 | As a developer, I need the Permitting Complexity Indicator (PCI) calculated so that it contributes to the RIS | PCI uses Census permit volume (E1-4) + discretionary review flag extracted from zoning text (E2-7); returns 0–100. Permit approval rates dropped for MVP — not reliably available from public data. By-right vs. conditional/special use permit distinction (E2-7) replaces it as the complexity signal. **Rationale:** This keeps PCI implementable against data we actually have while preserving the policy relevance of the sub-score. The by-right vs. conditional distinction is well-understood by policy makers and directly affects development timelines and risk. | P1 | 3 |
| E3-4 | As a developer, I need the Comparative Restrictiveness Percentile (CRP) calculated so that jurisdictions can be ranked | CRP places jurisdiction within a peer comparison set of ~10 jurisdictions (3 real + ~7 synthetic seed data) and returns a normalized 0–100 score. **Rationale:** With only 3 real jurisdictions, a percentile collapses to a rank of 1/2/3 and is too weak to carry 25% of the composite RIS. Rather than defer CRP or reduce its weight, the peer set is expanded using a synthetic seed dataset of ~7 additional plausible-but-illustrative jurisdictions (see E9-5). This makes CRP statistically meaningful for the demo while keeping the score structure intact for when real data is added. Synthetic jurisdictions are clearly labeled in the UI and data source attribution. | P1 | 2 |
| E3-5 | As a developer, I need the composite RIS computed as a weighted sum so that a single score is surfaced | RIS = 0.30×DCI + 0.25×DCOI + 0.20×PCI + 0.25×CRP; returns 0–100. Weight rationale: DCI 30% — density constraints are the most direct regulatory barrier to housing supply; DCOI 25% — cost impacts directly affect financial feasibility; CRP 25% — comparative ranking provides peer context that makes the score actionable; PCI 20% — permitting complexity is partially reflected in CRP and harder to extract reliably, so weighted lower | P0 | 1 |
| E3-6 | As a developer, I need scores stored per jurisdiction so that the API can serve them to the frontend | Scores + sub-scores + confidence tiers persisted to DB; queryable by jurisdiction ID | P0 | 2 |

---

## Sprint 2 (Days 6–10): UI, Comparison & Simulation

### E4 — Feasibility Modeling

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E4-1 | As a housing policy analyst, I need to see maximum theoretical unit yield per acre so that I understand density impact | Yield computed from lot size + height + density limits; displayed in score panel | P0 | 3 |
| E4-2 | As a housing policy analyst, I need to see buildable area impacted by parking requirements so that I understand parking cost | Parking lot footprint estimated from spaces/unit × stall size; displayed as % of lot | P0 | 3 |
| E4-3 | As a housing policy analyst, I need estimated cost per unit so that I understand financial feasibility | Cost = construction cost (BLS OES + BEA RPP regional multiplier applied to national baseline) + parking cost uplift; displayed in score panel | P1 | 3 |
| E4-4 | As a housing policy analyst, I need to see whether local market rents can support the estimated construction cost so that I can make a defensible case for regulatory change | Rent feasibility indicator displayed alongside cost per unit: compares estimated monthly carrying cost (construction cost ÷ 240 months) to local HUD FMR 2BR; shows one of three labels — Feasible, Marginal, or Infeasible — with the underlying FMR and cost figures cited. **Rationale:** E4-3 answers "what does it cost to build?" (supply-side); E4-4 answers "can the market support that cost?" (demand-side). These are distinct policy questions that deserve separate stories. The rent comparison is the more powerful output for Val — it transforms a construction cost number into a policy argument. HUD FMR data is already ingested in E1-2, so the implementation cost is low. | P1 | 2 |

### E5 — Search & Map UI

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E5-1 | As a housing policy analyst, I need a prominent search bar on the home screen so that I can find my jurisdiction directly without navigating a map | Search bar is the primary element on the home screen; labeled "Find your county or municipality" | P0 | 2 |
| E5-2 | As a housing policy analyst, I need autocomplete suggestions as I type so that I can quickly select my jurisdiction | Autocomplete returns matching counties/municipalities from the 3 demo jurisdictions; selection loads the RIS panel | P0 | 2 |
| E5-3 | As a housing policy analyst, I need a national choropleth heat map visible in the background so that I have geographic context while searching | US map rendered behind the search bar with state-level RIS shading; not interactive at this stage | P0 | 3 |
| E5-4 | As a housing policy analyst, I need a color legend on the map so that I understand what the shading means | Legend shows RIS scale (0–100) with low/medium/high labels; always visible | P0 | 1 |
| E5-5 | As a housing policy analyst, I need to be able to zoom out from my county to see the national or state map so that I can understand comparative context | Zoom-out control or button available from the county view; returns to national/state heat map | P1 | 2 |

### E6 — Score Panel UI

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E6-1 | As a housing policy analyst, I need the map to focus on my selected county so that I can see district-level RIS shading | After search selection, map zooms to county with zip code / district-level choropleth shading | P0 | 3 |
| E6-2 | As a housing policy analyst, I need an accordion score panel to open alongside the map so that I can explore sub-scores by category | Right-side panel slides open with Composite Score + 4 sub-score accordions; each expandable | P0 | 3 |
| E6-3 | As a housing policy analyst, I need confidence badges on each extracted field so that I know how reliable the data is | Each field shows High / Medium / Low badge; tooltip explains what each tier means | P0 | 2 |
| E6-4 | As a housing policy analyst, I need data source attribution on each sub-score so that I know where the data came from | Each accordion section cites its source (e.g., "Municode zoning code, extracted 2025-03") | P0 | 2 |
| E6-5 | As a housing policy analyst, I need an "About this score" link so that I can understand the methodology and assumptions | Link opens a modal explaining normalization, sub-score weights, and modeling limitations | P0 | 2 |
| E6-6 | As a housing policy analyst, I need a disclaimer stating the RIS is descriptive not prescriptive so that I can use it defensibly in policy discussions | Static text visible on the score panel: "This score measures regulatory constraint and does not recommend policy positions." | P0 | 1 |

### E7 — Comparison View

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E7-1 | As a housing policy analyst, I need to add a second jurisdiction to compare so that I can benchmark my county | "Add jurisdiction to compare" search bar adds a second map + accordion panel side-by-side | P0 | 3 |
| E7-2 | As a housing policy analyst, I need to add a third jurisdiction so that I have a richer comparison set | Layout supports up to 3 panels; panels scroll horizontally if needed | P1 | 2 |
| E7-3 | As a housing policy analyst, I need a summary ranking bar so that I can immediately see which jurisdiction is most restrictive | Summary bar above panels shows jurisdictions ranked by RIS with score delta indicators | P1 | 2 |

### E8 — What-If Simulation

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E8-1 | As a housing policy analyst, I need a "What-If" toggle so that I can switch into policy simulation mode | Toggle visible on the score panel; activates slider controls when enabled | P0 | 1 |
| E8-2 | As a housing policy analyst, I need sliders for each regulatory constraint so that I can model policy changes | Sliders for: min lot size, height limits, density limits, parking minimums, setbacks | P0 | 3 |
| E8-3 | As a housing policy analyst, I need the RIS to update when I move a slider so that I see the score impact in real time | Score and map shading update within 500ms of slider change | P0 | 3 |
| E8-4 | As a housing policy analyst, I need feasibility outputs to update with slider changes so that I see development impact | Unit yield, buildable area, and cost per unit update alongside RIS | P0 | 3 |
| E8-5 | As a housing policy analyst, I need to reset sliders to baseline so that I can return to actual regulatory values | Reset button restores all sliders to originally extracted regulatory values | P1 | 1 |

---

## Infrastructure

### E9 — Infrastructure

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| E9-1 | Backend API serving RIS scores by jurisdiction ID | P0 | 3 |
| E9-2 | Database schema for jurisdictions, extracted fields, and scores | P0 | 2 |
| E9-3 | LLM extraction pipeline (batch mode for 3 demo jurisdictions) | P0 | 3 |
| E9-4 | Cloud deployment (demo-ready hosted URL) | P1 | 3 |
| E9-5 | Synthetic seed dataset of ~7 additional jurisdictions to expand the CRP peer comparison set | Seed data covers ~7 plausible US jurisdictions with realistic but fabricated regulatory field values and scores; loaded into DB alongside real data; all synthetic records flagged with `data_type: synthetic` and labeled "Illustrative data" in UI attribution. **Rationale:** CRP requires a meaningful peer comparison set to produce a statistically useful percentile. With only 3 real jurisdictions the score collapses to a rank of 1/2/3. A synthetic peer set expands this to ~10 jurisdictions, making CRP meaningful for the demo while real data is limited by the two-week timeline. This is common practice in hackathon demos and is defensible as long as synthetic data is clearly labeled. | P0 | 2 |
| E9-9 | As a developer, I need the zoning ordinance PDFs stored in GCS and the pipeline updated to fetch from GCS so that large files (~90MB) are accessible without being committed to Git | Terraform config in `infra/` provisions `parcela-raw-data` GCS bucket with IAM binding for pipeline service account; pipeline fetches PDFs from GCS at runtime via `RAW_DATA_BUCKET` env var; local `data/raw/zoning/` folder retained as dev fallback when `RAW_DATA_BUCKET` is unset; `infra.yml` GitHub Actions workflow runs `terraform plan` on PRs and `terraform apply` on manual dispatch; deploy pipeline fails fast with clear error if bucket is not accessible. **See also:** #73 (E1-1a) — PDF upload. | P0 | 3 |

---

## Stretch / Post-Demo

| ID | Story |
|----|-------|
| S-1 | PDF/CSV export of comparison report |
| S-2 | Automated zoning document update monitoring |
| S-3 | Expand to 10+ jurisdictions |
| S-4 | User authentication and saved scenarios |
| S-5 | Natural language search ("most restrictive counties near DC") |

---

## Priority Key

| Label | Meaning |
|-------|---------|
| P0 | Must-have for demo |
| P1 | Important but demoable without |
| P2 | Nice to have / stretch |
