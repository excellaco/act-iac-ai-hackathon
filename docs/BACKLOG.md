# Parcela — Product Backlog (MVP)

**Hackathon Timeline:** 2 weeks
**Demo Scope:** 2–3 contrasting municipalities (e.g., Fairfax, Arlington, Loudoun counties, VA)

---

## Epics

| ID | Epic | Description |
|----|------|-------------|
| E1 | Data Ingestion | Ingest and process zoning documents and public datasets |
| E2 | LLM Extraction | Extract structured regulatory fields from unstructured zoning text |
| E3 | RIS Scoring Engine | Compute Regulatory Impact Score and sub-scores |
| E4 | Feasibility Modeling | Model unit yield, buildable area, and cost per unit |
| E5 | Map & Dashboard UI | National → county drill-down map with RIS heat map |
| E6 | Comparison View | Side-by-side multi-jurisdiction comparison panels |
| E7 | What-If Simulation | Slider-based policy simulation with live score updates |
| E8 | Responsible AI Layer | Confidence tiers, data provenance, assumptions disclosure |
| E9 | Infrastructure | Backend API, data pipeline, cloud deployment |

---

## Sprint 1 (Days 1–5): Data, Extraction & Scoring Core

### E1 — Data Ingestion

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E1-1 | As a developer, I need zoning code PDFs for 3 municipalities ingested so that the LLM pipeline has source material | PDFs for Fairfax, Arlington, Loudoun downloaded and stored; text extracted via PDF parser | P0 | 2 |
| E1-2 | As a developer, I need FMR data for target jurisdictions loaded so that cost modeling is possible | HUD FMR CSV ingested for target zip codes; queryable by jurisdiction | P0 | 1 |
| E1-3 | As a developer, I need ACS data (population, housing units) loaded so that density context is available | ACS tables B25001/B25002 loaded for target counties | P0 | 1 |
| E1-4 | As a developer, I need building permit data loaded so that permitting complexity can be scored | Census building permit data loaded for target jurisdictions | P1 | 2 |

### E2 — LLM Extraction

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E2-1 | As a developer, I need an LLM prompt that extracts minimum lot size from zoning text so that DCI can be computed | Prompt correctly extracts lot size for ≥80% of test cases; returns value + confidence tier | P0 | 3 |
| E2-2 | As a developer, I need an LLM prompt that extracts height limits so that DCI can be computed | Returns height limit in feet + confidence tier | P0 | 2 |
| E2-3 | As a developer, I need an LLM prompt that extracts density limits (units/acre) so that DCI can be computed | Returns units/acre figure + confidence tier | P0 | 2 |
| E2-4 | As a developer, I need an LLM prompt that extracts parking minimums so that DCOI can be computed | Returns spaces/unit figure + confidence tier | P0 | 2 |
| E2-5 | As a developer, I need an LLM prompt that extracts setback requirements so that DCI can be computed | Returns front/side/rear setbacks + confidence tier | P1 | 2 |
| E2-6 | As a developer, I need extracted fields stored in a structured schema so that the scoring engine can consume them | JSON output per jurisdiction: all 5 fields + confidence tiers + source citation | P0 | 2 |

### E3 — RIS Scoring Engine

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E3-1 | As a developer, I need the Density Constraint Index (DCI) calculated so that it contributes to the RIS | DCI computed using min-max normalization against peer set; returns 0–100 score | P0 | 3 |
| E3-2 | As a developer, I need the Development Cost Impact (DCOI) calculated so that it contributes to the RIS | DCOI uses parking space cost multiplier + RSMeans regional factor; returns 0–100 | P0 | 3 |
| E3-3 | As a developer, I need the Permitting Complexity Indicator (PCI) calculated so that it contributes to the RIS | PCI uses permit approval rates and discretionary review flags; returns 0–100 | P1 | 3 |
| E3-4 | As a developer, I need the Comparative Restrictiveness Percentile (CRP) calculated so that jurisdictions can be ranked | CRP places jurisdiction within peer comparison set percentile; returns 0–100 | P1 | 2 |
| E3-5 | As a developer, I need the composite RIS computed as a weighted sum so that a single score is surfaced | RIS = 0.30×DCI + 0.25×DCOI + 0.20×PCI + 0.25×CRP; returns 0–100 | P0 | 1 |
| E3-6 | As a developer, I need scores stored per jurisdiction so that the API can serve them to the frontend | Scores + sub-scores + confidence tiers persisted to DB; queryable by jurisdiction ID | P0 | 2 |

---

## Sprint 2 (Days 6–10): UI, Comparison & Simulation

### E4 — Feasibility Modeling

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E4-1 | As a policy maker, I need to see maximum theoretical unit yield per acre so that I understand density impact | Yield computed from lot size + height + density limits; displayed in UI | P0 | 3 |
| E4-2 | As a policy maker, I need to see buildable area impacted by parking requirements so that I understand parking cost | Parking lot footprint estimated from spaces/unit × stall size; displayed as % of lot | P0 | 3 |
| E4-3 | As a policy maker, I need estimated cost per unit so that I understand financial feasibility | Cost = construction cost (RSMeans) + parking cost uplift; displayed in UI | P1 | 3 |

### E5 — Map & Dashboard UI

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E5-1 | As a policy maker, I need a national choropleth heat map so that I can see regulatory impact at a glance | US map rendered with state-level RIS shading; color legend present | P0 | 3 |
| E5-2 | As a policy maker, I need to drill down from national → state → county so that I can focus on my jurisdiction | Clicking a state zooms to state; clicking a county loads RIS panel | P0 | 3 |
| E5-3 | As a policy maker, I need a search bar so that I can find a jurisdiction without navigating the map | Search returns matching county/municipality; map zooms and loads RIS panel | P0 | 2 |
| E5-4 | As a policy maker, I need an accordion score panel so that I can explore sub-scores by category | Panel shows Composite Score + 4 sub-score accordions; each expandable with detail | P0 | 3 |
| E5-5 | As a policy maker, I need a color legend on the map so that I understand what the shading means | Legend shows RIS scale (0–100) with low/medium/high labels; always visible | P0 | 1 |

### E6 — Comparison View

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E6-1 | As a policy maker, I need to add a second jurisdiction to compare so that I can benchmark my county | "Add jurisdiction" button adds a second map + accordion panel side-by-side | P0 | 3 |
| E6-2 | As a policy maker, I need to add a third jurisdiction so that I have a richer comparison set | Layout supports up to 3 panels; panels scroll horizontally if needed | P1 | 2 |
| E6-3 | As a policy maker, I need a summary ranking so that I can immediately see which jurisdiction is most restrictive | Summary bar above panels shows ranked order by RIS with delta indicators | P1 | 2 |

### E7 — What-If Simulation

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E7-1 | As a policy maker, I need sliders for each regulatory constraint so that I can model policy changes | Sliders for: min lot size, height limits, density limits, parking minimums, setbacks | P0 | 3 |
| E7-2 | As a policy maker, I need the RIS to update when I move a slider so that I see the impact in real time | Score and map shading update within 500ms of slider change | P0 | 3 |
| E7-3 | As a policy maker, I need feasibility outputs to update with slider changes so that I see development impact | Unit yield, buildable area, and cost per unit update alongside RIS | P0 | 3 |
| E7-4 | As a policy maker, I need to reset sliders to baseline so that I can return to actual regulatory values | Reset button restores all sliders to extracted regulatory values | P1 | 1 |

### E8 — Responsible AI Layer

| ID | Story | Acceptance Criteria | Priority | Points |
|----|-------|---------------------|----------|--------|
| E8-1 | As a policy maker, I need confidence badges on extracted fields so that I know how reliable the data is | Each extracted field shows High / Medium / Low badge with tooltip explaining tier | P0 | 2 |
| E8-2 | As a policy maker, I need data source attribution so that I know where the data came from | Each sub-score panel cites its source (e.g., "Municode zoning code, extracted 2025-03") | P0 | 2 |
| E8-3 | As a policy maker, I need a modeling assumptions disclosure so that I understand the RIS methodology | "About this score" modal explains normalization, weights, and limitations | P0 | 2 |
| E8-4 | As a policy maker, I need a clear statement that the RIS is descriptive not prescriptive so that I can use it defensibly | Static disclaimer on score panel: "This score measures regulatory constraint and does not recommend policy positions." | P0 | 1 |

---

## Infrastructure

### E9 — Infrastructure

| ID | Story | Priority | Points |
|----|-------|----------|--------|
| E9-1 | Backend API serving RIS scores by jurisdiction ID | P0 | 3 |
| E9-2 | Database schema for jurisdictions, extracted fields, and scores | P0 | 2 |
| E9-3 | LLM extraction pipeline (batch mode for 3 demo jurisdictions) | P0 | 3 |
| E9-4 | Cloud deployment (demo-ready hosted URL) | P1 | 3 |

---

## Stretch / Post-Demo

| ID | Story |
|----|-------|
| S-1 | PDF/CSV export of comparison report |
| S-2 | Automated zoning document update monitoring |
| S-3 | Expand to 10+ jurisdictions |
| S-4 | User authentication and saved scenarios |

---

## Priority Key

| Label | Meaning |
|-------|---------|
| P0 | Must-have for demo |
| P1 | Important but demoable without |
| P2 | Nice to have / stretch |
