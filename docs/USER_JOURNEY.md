# Parcella — MVP User Journey

## Persona
**Primary:** City/County Policy Maker
**Goal:** Understand how my jurisdiction's zoning regulations compare to peers and model the impact of potential policy changes.

> **Note:** A secondary "developer evaluating municipalities" persona was considered but deferred to post-MVP. The policy maker persona drives all MVP design decisions.

---

## Journey Flow

### Step 1 — Search for a Jurisdiction
- User arrives at the Parcella home screen
- A prominent search bar is centered on screen: *"Find your county or municipality"*
- A national choropleth heat map is visible in the background as context, shaded by Regulatory Impact Score (RIS)
- The map is not the primary interaction — it provides orientation, not navigation
- **User action:** Types their jurisdiction (e.g., "Fairfax County, VA") and selects from autocomplete results

---

### Step 2 — View a Single County's RIS
- Map focuses directly on the selected county, showing zip code / district-level shading
- A right-side panel slides open with the **Composite Score accordion**:
  - Composite Score (overall RIS with confidence badge)
  - Density Constraints *(min lot size, height limits, density limits)*
  - Permitting Complexity Indicators *(building permit data)*
  - Cost Impact Estimates *(FMR + RSMeans regional inputs)*
  - Comparative Restrictiveness vs Peer Cities
- Each accordion item is collapsed by default; user expands to see sub-scores and data sources
- Each extracted field displays a confidence badge (High / Medium / Low) indicating LLM extraction reliability
- Data source attribution shown per field (Municode, ACS, FMR, RSMeans)
- An "About this score" link opens a modal with modeling assumptions and a disclaimer that the RIS is descriptive, not prescriptive
- User can optionally zoom out to the national or state map to see how their jurisdiction compares in broader context
- **User action:** Reviews scores, optionally adds a second jurisdiction to compare

---

### Step 3 — Add Jurisdictions for Comparison (1–3 total)
- User clicks *"Add county to compare"* and searches for 1–2 more counties (e.g., Arlington, Loudoun)
- The layout expands to show 2–3 side-by-side map + accordion panels
- Each panel displays the same score structure for cross-jurisdiction comparison
- A summary ranking bar highlights which jurisdiction is most/least restrictive
- **User action:** Reviews differences across jurisdictions; decides to model a policy change

---

### Step 4 — Run a "What-If" Policy Simulation
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

## Happy Path Summary

```
Search for Jurisdiction → County RIS Panel (with inline AI disclosures) →
Add Comparators → What-If Simulation
```

---

## Out of Scope for MVP
- User authentication / saved sessions
- PDF export
- Automated zoning document ingestion pipeline (demo uses pre-processed data)
- More than 3 simultaneous jurisdictions
- Developer persona (evaluating municipalities for private development projects) — deferred to Phase 2
- National map as primary navigation entry point — available as zoom-out context only
- Responsible AI disclosures as a separate screen or step — surfaced inline on the score panel instead
