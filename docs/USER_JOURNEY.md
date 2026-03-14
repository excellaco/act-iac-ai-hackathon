# Parcela — MVP User Journey

## Persona
**Primary:** City/County Policy Maker
**Goal:** Understand how my jurisdiction's zoning regulations compare to peers and model the impact of potential policy changes.

---

## Journey Flow

### Step 1 — Land on the National Heat Map
- User arrives at the Parcela home screen
- A choropleth map of the United States is displayed, shaded by Regulatory Impact Score (RIS)
- A search bar prompts: *"Find address or place"*
- **User action:** Types a state name (e.g., "Virginia") or clicks a state directly on the map

---

### Step 2 — Drill Into a State
- Map zooms to the selected state (e.g., Virginia)
- Counties are rendered with RIS-based shading (darker = more restrictive)
- **User action:** Clicks a county (e.g., Fairfax County) or types it in the search bar

---

### Step 3 — View a Single County's RIS
- Map focuses on the selected county, showing zip code / district-level shading
- A right-side panel slides open with the **Composite Score accordion**:
  - Composite Score (overall RIS with confidence badge)
  - Density Constraints *(min lot size, height limits, density limits)*
  - Permitting Complexity Indicators *(building permit data)*
  - Cost Impact Estimates *(FMR + RSMeans regional inputs)*
  - Comparative Restrictiveness vs Peer Cities
- Each accordion item is collapsed by default; user expands to see sub-scores and data sources
- **User action:** Reviews scores, optionally adds a second jurisdiction to compare

---

### Step 4 — Add Jurisdictions for Comparison (1–3 total)
- User clicks *"Add county to compare"* and selects 1–2 more counties (e.g., Arlington, Loudoun)
- The layout expands to show 2–3 side-by-side map + accordion panels
- Each panel displays the same score structure for cross-jurisdiction comparison
- A summary ranking bar highlights which jurisdiction is most/least restrictive
- **User action:** Reviews differences across jurisdictions; decides to model a policy change

---

### Step 5 — Run a "What-If" Policy Simulation
- User clicks *"What-If Policy Simulation"* toggle on the left panel
- Sliders appear for adjustable regulatory constraints:
  - Minimum lot size
  - Height limits
  - Density limits (units per acre)
  - Parking minimums
  - Setback requirements
- As the user moves a slider, the county maps update in real time, re-scoring the RIS
- A feasibility output panel shows updated:
  - Maximum theoretical unit yield per parcel/acre
  - Buildable area impacted by parking requirements
  - Estimated cost per unit (using FMR + regional cost inputs)
- **User action:** Adjusts parking minimums to zero; sees RIS drop and unit yield increase

---

### Step 6 — Review Responsible AI Disclosures
- A persistent footer or info panel surfaces:
  - LLM extraction confidence tier for each data field (High / Medium / Low)
  - Data source attribution (Municode, ACS, FMR, RSMeans)
  - Modeling assumptions disclosure
  - Note that RIS is descriptive, not prescriptive
- **User action:** Reviews confidence indicators before sharing results with stakeholders

---

## Happy Path Summary

```
National Map → State Drill-Down → County RIS Panel →
Add Comparators → What-If Simulation → Review AI Disclosures
```

---

## Out of Scope for MVP
- User authentication / saved sessions
- PDF export
- Automated zoning document ingestion pipeline (demo uses pre-processed data)
- More than 3 simultaneous jurisdictions
