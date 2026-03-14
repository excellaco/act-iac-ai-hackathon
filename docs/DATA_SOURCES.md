# Parcela — Data Sources

This document lists every public data source used by the Parcela platform, covering where to find it, what format it comes in, which backlog stories consume it, and exactly which fields to extract.

All data must be publicly accessible. No proprietary MLS or private transaction data is used.

---

## Summary Table

| Source | Used By | Format | Update Frequency |
|--------|---------|--------|-----------------|
| Municipal Zoning Codes (Municode) | E1-1, E2-1 through E2-5 | PDF / HTML | Varies by jurisdiction |
| HUD Fair Market Rents (FMR) | E1-2, E4-3 | CSV | Annual |
| American Community Survey (ACS) | E1-3 | CSV / API | Annual (5-year estimates) |
| Census Building Permits | E1-4, E3-3 | CSV | Annual |
| RSMeans Construction Cost Data | E4-3 | Reference table (public indices) | Annual |

---

## 1. Municipal Zoning Codes

**Used by:** E1-1 (ingestion), E2-1 through E2-5 (LLM extraction)

**What it is:** The primary source for all regulatory constraint data. Zoning codes define minimum lot sizes, height limits, density limits, parking minimums, setback requirements, and permitting processes for each jurisdiction.

### Acquisition approach (MVP)

For the MVP demo, zoning ordinance documents are **manually downloaded and committed to the repo** rather than fetched programmatically. This avoids pipeline complexity and web scraping brittleness within the two-week timeline.

Downloaded files live in `data/raw/zoning/` — see [`data/raw/README.md`](../data/raw/README.md) for the folder structure and file naming convention.

Each jurisdiction has a different source and access pattern:

| Jurisdiction | Platform | Access pattern | Local path |
|---|---|---|---|
| Fairfax County, VA | Encode (county-hosted) | Chapter-by-chapter HTML/PDF export | `data/raw/zoning/fairfax/` |
| Arlington County, VA | County website (direct PDF) | Single full ordinance PDF download | `data/raw/zoning/arlington/` |
| Loudoun County, VA | Encode (county-hosted) | Chapter-by-chapter HTML/PDF export | `data/raw/zoning/loudoun/` |

### Source URLs

**Fairfax County**
- Zoning Ordinance (Encode platform): https://www.fairfaxcounty.gov/planning-development/zoning-ordinance
- Ordinance text is hosted on Encode — navigate to relevant residential chapters and export as PDF
- Focus chapters: Article 2 (Residential Districts), Article 4 (Use Regulations), Article 5 (Development Standards)

**Arlington County**
- Zoning Ordinance (direct PDF — full document): https://www.arlingtonva.us/files/sharedassets/public/v/2/building/documents/codes-and-ordinances/aczo_effective_06.10.2023.pdf
- This is the cleanest acquisition: one PDF download covers the full ordinance
- Save as: `data/raw/zoning/arlington/aczo_2023.pdf`

**Loudoun County**
- Zoning Ordinance (adopted December 13, 2023): https://www.loudoun.gov/1755/Zoning-Ordinance
- Hosted on county platform — navigate to residential district chapters and export as PDF
- Focus chapters: Chapter 3 (Zoning Districts), Chapter 4 (Use Standards), Chapter 5 (Development Standards)

### Format

All downloaded documents should be saved as PDF. The pipeline (E1-1) extracts raw text from these PDFs using a PDF parser before passing to the LLM extraction stage.

**Fields to extract (E2-1 through E2-5):**

| Field | Story | Description | Example value |
|-------|-------|-------------|---------------|
| Minimum lot size | E2-1 | Minimum area required per residential lot | 6,000 sq ft |
| Height limit | E2-2 | Maximum building height in feet or stories | 35 ft / 3 stories |
| Density limit | E2-3 | Maximum dwelling units per acre | 12 units/acre |
| Parking minimum | E2-4 | Required off-street parking spaces per dwelling unit | 2 spaces/unit |
| Setback requirements | E2-5 | Minimum front, side, and rear setbacks in feet | Front: 25 ft, Side: 10 ft, Rear: 20 ft |

**Notes:**
- Zoning codes are organized by district (R-1, R-2, MF, etc.). Focus extraction on residential multifamily districts for MVP — these are most relevant to housing development feasibility.
- Confidence tier assignment: if the LLM extracts a value directly from explicit regulatory text, assign High. If it must infer from context or examples, assign Medium. If no relevant text is found, assign Low.
- Do not commit large PDFs directly to Git without Git LFS configured. See `data/raw/README.md` for guidance.

---

## 2. HUD Fair Market Rents (FMR)

**Used by:** E1-2 (ingestion), E4-3 (cost per unit calculation)

**What it is:** HUD publishes annual Fair Market Rent estimates by bedroom size for every metropolitan area and non-metropolitan county in the US. FMR is used as a proxy for local housing market conditions in the cost per unit calculation.

**Where to find it:**
- HUD FMR dataset: https://www.huduser.gov/portal/datasets/fmr.html
- FY2025 FMR documentation and downloads: https://www.huduser.gov/portal/datasets/fmr/fmr2025/FY2025_FMRs.zip

**Format:** CSV (one row per county/metro area). Also available via HUD API.

**HUD API (recommended for programmatic access):**
```
https://www.huduser.gov/hudapi/public/fmr/statedata/{state_code}
```
Requires a free HUD API token: https://www.huduser.gov/portal/dataset/fmr-api.html

**Fields to extract:**

| CSV Column | Description | Used for |
|---|---|---|
| `fmr_2br` | 2-bedroom FMR (monthly) | Baseline rent estimate for feasibility modeling |
| `county_name` | County name | Join key to jurisdiction |
| `state_alpha` | State abbreviation | Join key to jurisdiction |
| `area_name` | Metro area name | Display label |

**Target jurisdictions (FIPS codes):**

| Jurisdiction | State FIPS | County FIPS |
|---|---|---|
| Fairfax County, VA | 51 | 059 |
| Arlington County, VA | 51 | 013 |
| Loudoun County, VA | 51 | 107 |

**Notes:**
- Use the 2-bedroom FMR as the standard unit for cost modeling comparisons.
- FMR is used as an input to the Development Cost Impact sub-score (DCOI) — specifically to estimate revenue potential relative to construction cost.

---

## 3. American Community Survey (ACS)

**Used by:** E1-3 (ingestion), E3-1 (DCI context)

**What it is:** The Census Bureau's ACS provides annual estimates of housing units, population, and housing characteristics by county. Used to provide density context for the Density Constraint Index.

**Where to find it:**
- ACS data explorer: https://data.census.gov
- Census API: https://api.census.gov/data/{year}/acs/acs5

**Recommended API call (5-year estimates, county level):**
```
https://api.census.gov/data/2023/acs/acs5?get=B25001_001E,B25002_002E,B01003_001E&for=county:059,013,107&in=state:51
```

Requires a free Census API key: https://api.census.gov/data/key_signup.html

**Fields to extract:**

| ACS Table | Variable | Description | Used for |
|---|---|---|---|
| B25001 | `B25001_001E` | Total housing units | Density baseline |
| B25002 | `B25002_002E` | Occupied housing units | Occupancy rate |
| B01003 | `B01003_001E` | Total population | Population density calculation |

**Notes:**
- Use the most recent 5-year ACS estimates available (currently 2019–2023).
- These figures provide context for normalizing density constraints across the peer comparison set (CRP sub-score).

---

## 4. Census Building Permits

**Used by:** E1-4 (ingestion), E3-3 (Permitting Complexity Indicator)

**What it is:** The Census Bureau's Building Permits Survey publishes annual counts of residential building permits issued by county. Used as a proxy for permitting activity and baseline for the Permitting Complexity Indicator (PCI).

**Where to find it:**
- Building permits data: https://www.census.gov/construction/bps/
- County-level annual data: https://www.census.gov/construction/bps/county.html
- Direct download (2023): https://www.census.gov/construction/bps/xls/co2023a.xls

**Format:** XLS/CSV. One row per county. Columns cover permit counts by unit type (1-unit, 2-unit, 3–4 unit, 5+ unit).

**Fields to extract:**

| Column | Description | Used for |
|---|---|---|
| `CSA` / `CBSA` | Metro area code | Join key |
| `County_Name` | County name | Join key |
| `5_units_or_more` | Permits for 5+ unit buildings | Multifamily development activity proxy |
| `Total_Units` | Total permitted units | Overall permitting volume |

**Notes:**
- Focus on the `5_units_or_more` column — this is most relevant to multifamily housing development feasibility.
- Permit volume alone does not measure complexity. The PCI combines permit volume with discretionary review flags extracted from the zoning code (E2 stories).
- Historical data (2018–2023) is available at the same URL for trend context.

---

## 5. RSMeans Construction Cost Data

**Used by:** E4-3 (estimated cost per unit)

**What it is:** RSMeans publishes regional construction cost indices that adjust national average costs for local labor and material markets. Used to estimate per-unit construction cost in the feasibility model.

**Where to find it:**
- RSMeans City Cost Index (public reference): https://www.rsmeans.com/landing/2019-rsmeans-city-cost-indexes.aspx
- Gordian (RSMeans parent) publishes free annual location factor summaries. Search for "RSMeans city cost index [year] PDF".
- Alternative public source: the ENR Construction Cost Index published by Engineering News-Record: https://www.enr.com/economics

**Format:** Reference table (PDF or HTML). Key figure is the **location cost factor** — a multiplier applied to a national baseline cost.

**Fields to use:**

| Field | Description | Example |
|---|---|---|
| Location cost factor | Multiplier vs national average (1.00 = average) | Fairfax County, VA: ~1.08 |
| National baseline cost (multifamily) | $/sq ft for mid-rise multifamily construction | ~$175–$225/sq ft (2024) |

**Calculation for MVP:**
```
Estimated cost per unit = (unit_size_sqft × national_baseline_cost × location_factor) + parking_cost_uplift

parking_cost_uplift = parking_spaces_required × cost_per_space
cost_per_space = $25,000 (surface) or $50,000 (structured) — use surface for MVP
```

**Notes:**
- RSMeans full datasets are proprietary. For the MVP, use the publicly available city cost index multipliers and a fixed national baseline derived from published industry sources.
- The parking cost uplift figure ($25,000/space surface) is drawn from published research cited in the RIS methodology document.
- Document the specific source and date of any baseline cost figures used — these feed the data source attribution displayed in the UI (E6-4).

---

## Data Freshness and Attribution

Each data source should be recorded in the pipeline run record (E0-5) with:
- Source name
- Dataset version or fiscal year
- Date retrieved
- URL

This information is displayed in the UI as data source attribution per sub-score panel (E6-4), satisfying the responsible AI transparency requirement.
