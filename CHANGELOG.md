# Changelog

> **TODO:** This document should be updated as significant changes are made to the pipeline, scoring model, or data. Suggested structure below. See [issue #244](https://github.com/excellaco/act-iac-ai-hackathon/issues/244) for context.
>
> Record entries when: scoring model weights or formulas change, new jurisdictions are added, pipeline extraction logic changes, LLM prompts are significantly revised, or database schema changes in ways that affect scores.

---

## Format

Each entry should note:
- **What changed** — the specific model, data, or pipeline change
- **Why** — the reason or issue that prompted it
- **Impact** — how scores or outputs are affected (e.g. "CRP scores for all jurisdictions will change on next pipeline run")

---

## [Unreleased]

<!-- Changes that have been merged but not yet formally versioned -->

---

## Hackathon Build (March 2026)

### Scoring model
- Introduced per-zone RIS scoring (E2-155) — scores are now computed per zoning district and averaged to jurisdiction level, replacing the single-pass jurisdiction extraction
- Added DSCR rent feasibility ratio to feasibility outputs (E4-4)
- Building-type-aware cost modeling with height-based cost tiers (issue #203)

### Pipeline
- Split pipeline into discrete stages: `pipeline:parse` → `pipeline:zones` → `pipeline:extract` → `pipeline:load` → `pipeline:score` (ADR-0004)
- Added human-in-the-loop approval gates at zone discovery and field extraction stages
- Added Cloud Vision OCR support for scanned PDFs (Fairfax County)

### Data
- Initial jurisdictions: Fairfax County VA, Arlington County VA, Loudoun County VA (3 real) + ~7 synthetic peer jurisdictions for CRP
- Data vintage: HUD FMR FY2025, ACS 2020–2024 5-year, Census BPS 2023, BLS OES May 2024, BEA RPP 2023
