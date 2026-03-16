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
| BLS Occupational Employment and Wage Statistics (OES) | E3-2, E4-3 | CSV / API | Annual |
| BEA Regional Price Parities (RPP) | E3-2, E4-3 | CSV / API | Annual |

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
| Fairfax County, VA | Municode (county-hosted) | Chapter-by-chapter HTML/PDF export | `data/raw/zoning/fairfax/` |
| Arlington County, VA | Arlington County website (direct PDF) | Single full ordinance PDF download | `data/raw/zoning/arlington/` |
| Loudoun County, VA | enCodePlus (JS-rendered) | Manual PDF download — cannot be crawled programmatically | `data/raw/zoning/loudoun/` |

### Source URLs

**Fairfax County**
- Zoning Ordinance (Encode platform): https://www.fairfaxcounty.gov/planning-development/zoning-ordinance
- Ordinance text is hosted on Encode — navigate to relevant residential chapters and export as PDF
- Focus chapters: Article 2 (Residential Districts), Article 4 (Use Regulations), Article 5 (Development Standards)

**Arlington County**
- Zoning Ordinance (direct PDF — full document): https://www.arlingtonva.us/files/sharedassets/public/v/1/building/documents/codes-and-ordinances/aczo_effective_1.24.2026.pdf
- This is the cleanest acquisition: one PDF download covers the full ordinance
- Save as: `data/raw/zoning/arlington/aczo_2026.pdf`

**Loudoun County**
- Zoning Ordinance (enCodePlus platform): https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx#secid-1770
- Note: the enCodePlus viewer requires JavaScript and cannot be crawled programmatically. Download the PDF manually from the platform.
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
- County-level annual data: https://www2.census.gov/econ/bps/County/

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

## 5. BLS Occupational Employment and Wage Statistics (OES)

**Used by:** E3-2 (DCOI calculation), E4-3 (estimated cost per unit)

**What it is:** The Bureau of Labor Statistics publishes annual mean and median wages for all occupations by state and metropolitan area. Construction labor typically comprises 50–60% of residential construction costs, making local wage data the primary driver of regional cost variation. Used to construct the labor component of the regional construction cost multiplier.

**Where to find it:**
- BLS OES homepage: https://www.bls.gov/oes/
- State and metro area data: https://www.bls.gov/oes/current/oessrcma.htm
- Bulk data download: https://www.bls.gov/oes/tables.htm

**Key occupation codes for a residential construction labor basket:**

| SOC Code | Occupation | Role in basket |
|---|---|---|
| 47-2031 | Carpenters | High weight (~25%) |
| 47-2111 | Electricians | High weight (~20%) |
| 47-2152 | Plumbers, Pipefitters | Medium weight (~15%) |
| 47-2061 | Construction Laborers | Medium weight (~20%) |
| 47-2073 | Operating Engineers | Lower weight (~20%) |

**How to compute the labor cost index:**
```
Labor_Index = weighted_mean_wage_local / weighted_mean_wage_national
```

Where the weighted mean wage is a basket average across the 5 occupation codes above, using national employment shares as weights.

**Format:** CSV bulk download or BLS public API (no key required for standard queries).

**Target geographies:** Washington-Arlington-Alexandria, DC-VA-MD-WV MSA covers all three demo jurisdictions.

**Notes:**
- Use the most recent May survey release (currently May 2024, released April 2025).
- If a specific metro area lacks data for an occupation, fall back to the state-level figure.

---

## 6. BEA Regional Price Parities (RPP)

**Used by:** E3-2 (DCOI calculation), E4-3 (estimated cost per unit)

**What it is:** The Bureau of Economic Analysis publishes annual Regional Price Parities measuring the price level of each state and metropolitan area relative to the national average (100 = national average). The **Goods component** captures regional variation in material and goods prices, used as the materials component of the regional construction cost multiplier.

**Where to find it:**
- BEA RPP interactive tables: https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area
- BEA API: https://apps.bea.gov/api/data/?UserID=YOUR_KEY&method=GetData&datasetname=Regional&TableName=SARPP

A free BEA API key is available at: https://apps.bea.gov/API/signup/

**How to compute the materials cost index:**
```
Materials_Index = RPP_Goods_local / 100
```

**Combined regional construction cost multiplier:**
```
Regional_Multiplier = (0.55 × Labor_Index) + (0.45 × Materials_Index)
```

**Calculation for MVP:**
```
Estimated cost per unit = (unit_size_sqft × national_baseline_cost × Regional_Multiplier) + parking_cost_uplift

parking_cost_uplift = parking_spaces_required × cost_per_space
cost_per_space = $25,000 (surface) or $50,000 (structured) — use surface for MVP

national_baseline_cost = ~$175–$200/sq ft (mid-rise multifamily, 2024, from Census SOC)
```

**Format:** CSV download or BEA API. State and metro area granularity.

**Notes:**
- Most recent data: 2023 RPPs released February 2025.
- The Washington-Arlington-Alexandria MSA RPP covers all three demo jurisdictions.
- Document the specific BEA release year used — this feeds the data source attribution displayed in the UI (E6-4).
- The parking cost uplift figure ($25,000/space surface) is drawn from published research cited in the RIS methodology document.

---

## Data Vintage

All data is pinned to the most recent available vintage as of 2024. Where 2024 data is not yet published, the most recent available vintage is used and documented explicitly.

| Source | Vintage to use | Notes |
|--------|---------------|-------|
| HUD Fair Market Rents | FY2025 (effective Oct 2024) | Best available as of 2024 |
| ACS housing/population data | 2019–2023 5-year estimates | 2024 ACS not yet published; 5-year estimates lag ~1 year |
| Census Building Permits | 2023 annual | 2024 annual not yet published |
| BLS OES wages | May 2024 (released April 2025) | |
| BEA Regional Price Parities | 2023 (released February 2025) | 2024 data not available at time of writing |
| Zoning ordinances | Current as of download date | No versioned annual snapshot available; document download date in pipeline run record |

---

## Data Freshness and Attribution

Each data source should be recorded in the pipeline run record (E0-5) with:
- Source name
- Dataset version or fiscal year
- Date retrieved
- URL

This information is displayed in the UI as data source attribution per sub-score panel (E6-4), satisfying the responsible AI transparency requirement.
