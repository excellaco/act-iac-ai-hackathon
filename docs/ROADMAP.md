# Parcella — Roadmap

This document captures post-hackathon next steps and improvement opportunities, organized by theme. For the historical record of what was built during the hackathon, see [`docs/BACKLOG.md`](BACKLOG.md).

---

## Near-Term (Deferred from MVP)

Items explicitly scoped out of the hackathon but ready to pick up:

- [ ] PDF/CSV export of comparison report (S-1)
- [ ] User authentication and saved scenarios (S-4)
- [ ] Expand to 10+ real jurisdictions (S-3)
- [ ] Natural language search — "most restrictive counties near DC" (S-5)
- [ ] Automated zoning document update monitoring (S-2)
- [ ] What-If simulation sliders in comparison view (#233)

---

## User Research

- [ ] Validate user needs with actual domain experts (housing policy analysts, municipal planners, housing finance agency staff) to ensure the solution addresses real workflow pain points and priorities
- [ ] Develop a second persona for a government employee in a smaller, less-resourced jurisdiction — these users may have different needs, fewer analytical tools, and no dedicated policy staff (informed by the nonprofit stakeholder interview where Falls Church staff wear multiple hats)
- [ ] Developer persona — evaluating municipalities for private development projects (a distinct use case from the policy analyst persona, requiring different data emphasis and workflow)

---

## Platform Expansion

- [ ] Expand beyond Northern Virginia / Maryland jurisdictions to all Virginia jurisdictions
- [ ] National coverage — all 50 states
- [ ] Automated PDF ingestion (remove manual download step)
- [ ] Add small municipalities (e.g., City of Falls Church — requested by nonprofit stakeholder interview)

---

## Scoring Model Improvements

- [ ] Replace modeled peer jurisdiction data with real extracted data as more jurisdictions are added
- [ ] Validate and improve feasibility model constants against real Northern Virginia / DC-metro development data (see [issue #203](https://github.com/excellaco/act-iac-ai-hackathon/issues/203))
- [ ] Equity scoring layer — explicit measurement of disparate regulatory impact by race/income
- [ ] Better CRP peer-set methodology as real jurisdiction count grows beyond 3

---

## Pipeline Improvements

- [ ] Automated zoning ordinance refresh monitoring
- [ ] Better handling of jurisdictions with complex or multi-document ordinances
- [ ] Improve OCR pipeline for low-resolution scanned PDFs

---

## Map & Visualization

- [ ] Integrate zoning district boundary GIS data from county open data portals (#226 — data confirmed available for Fairfax, Arlington, Loudoun)
- [ ] Color-code zoning districts on the map by RIS score or multifamily classification

Per-zone scoring infrastructure is already in place to support these enhancements.

---

## Responsible AI

- [ ] More granular confidence modeling — per-field uncertainty beyond High/Medium/Low tiers
- [ ] Audit trail for score changes over time — when and why scores changed between pipeline runs

---

## Integrations

- [ ] Virginia Zoning Atlas cross-reference — link regulatory scores to the VZA's spatial data
- [ ] HUD program data integration — connect RIS scores to HUD grant eligibility and program outcomes

---

## Infrastructure

- [ ] Migrate Terraform state to remote GCS backend
- [ ] Add Cloud SQL to Terraform management (currently manual)
