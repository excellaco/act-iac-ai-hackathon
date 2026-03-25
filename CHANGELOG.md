# Changelog

Record entries when: scoring model weights or formulas change, new jurisdictions are added, pipeline extraction logic changes, LLM prompts are significantly revised, or database schema changes in ways that affect scores.

---

## Format

Each entry should note:
- **What changed** — the specific model, data, or pipeline change
- **Why** — the reason or issue that prompted it
- **Impact** — how scores or outputs are affected

---

## [Unreleased]

<!-- Changes that have been merged but not yet formally versioned -->

---

## Hackathon Build (March 2026)

### Scoring model
- Introduced per-zone RIS scoring (E2-155) — scores are now computed per zoning district and averaged to jurisdiction level, replacing the single-pass jurisdiction extraction
- Added DSCR rent feasibility ratio to feasibility outputs (E4-4)
- Building-type-aware cost modeling with height-based cost tiers: garden ($195K), midrise ($270K), highrise ($385K) per unit, triggered by height limit thresholds at 45ft and 90ft
- Scoring model correctness fixes (#239): side setbacks counted twice (both sides of parcel), synthetic jurisdiction slugs aligned for CRP, live peer composites from DB instead of hardcoded, zone-level PCI uses per-zone discretionary review type

### Pipeline
- Split pipeline into discrete stages: `pipeline:parse` → `pipeline:zones` → `pipeline:extract` → `pipeline:load` → `pipeline:score` (ADR-0004)
- Added human-in-the-loop approval gates at zone discovery and field extraction stages
- Added Cloud Vision OCR support for scanned PDFs (Fairfax County)
- Gemini concurrency limiter with exponential backoff retry on 429/RESOURCE_EXHAUSTED

### Chat agent
- ADK `LlmAgent` with three declared tools: `get_jurisdiction_data`, `get_pdf_text`, `compute_feasibility`
- Stateless API (`POST /api/jurisdictions/[id]/chat`) with client-side conversation history
- Retry on empty response to handle transient Gemini rate limiting (#174)

### Explainability & Responsible AI
- Peer set disclosure in CRP accordion with Extracted/Modeled badges
- "Default used" indicators on low-confidence fields
- AI extraction reasoning shown per field
- Equity and bias considerations section in methodology modal
- Data vintage disclosure below RIS headline
- What-If scope note and chat agent disclosure

### UI
- Jurisdiction search with autocomplete across 10 jurisdictions
- Choropleth map with county boundary highlighting
- Score panel with zone selector, sub-score accordions showing dynamic field values and source citations
- Cross-jurisdiction comparison view with per-card maps, section titles, and zone selector
- What-If simulation with real-time score and feasibility recalculation
- Collapsible chat panel with AI assistant
- PDF source viewer (modal with page-level deep-linking)
- Zoning Atlas external link and AI analysis stats display
- 20+ UX refinements from designer feedback

### Testing & quality
- 590+ Jest tests (unit, component, API route)
- SonarCloud coverage gate at 80% on new code
- Snyk dependency vulnerability scanning
- ESLint + TypeScript strict mode

### Data
- Initial jurisdictions: Fairfax County VA, Arlington County VA, Loudoun County VA (3 real pipeline-extracted) + 7 modeled peer jurisdictions for CRP (VA/MD)
- Data vintage: HUD FMR FY2025, ACS 2020–2024 5-year, Census BPS 2023, BLS OES May 2024, BEA RPP 2023
