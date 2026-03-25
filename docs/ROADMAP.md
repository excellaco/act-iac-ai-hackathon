# Parcella — Roadmap

> **TODO:** This document needs to be filled in by the team. Suggested structure below. See [issue #244](https://github.com/excellaco/act-iac-ai-hackathon/issues/244) for context.

This document captures post-hackathon next steps and improvement opportunities, organized by theme. For the historical record of what was built during the hackathon, see [`docs/BACKLOG.md`](BACKLOG.md).

---

## Near-Term (Deferred from MVP)

Items explicitly scoped out of the hackathon but ready to pick up:

- [ ] PDF/CSV export of comparison report (S-1)
- [ ] User authentication and saved scenarios (S-4)
- [ ] Expand to 10+ jurisdictions (S-3)
- [ ] Natural language search — "most restrictive counties near DC" (S-5)
- [ ] Automated zoning document update monitoring (S-2)
- [ ] Developer persona — evaluating municipalities for private development projects

---

## Platform Expansion

- [ ] Expand beyond three Northern Virginia jurisdictions to all Virginia jurisdictions
- [ ] National coverage — all 50 states
- [ ] Automated PDF ingestion (remove manual download step)

---

## Scoring Model Improvements

- [ ] Replace synthetic peer jurisdiction data with real extracted data as more jurisdictions are added
- [ ] Validate and improve feasibility model constants against real Northern Virginia / DC-metro development data (see [issue #203](https://github.com/excellaco/act-iac-ai-hackathon/issues/203))
- [ ] Equity scoring layer — explicit measurement of disparate regulatory impact by race/income
- [ ] Better CRP peer-set methodology as real jurisdiction count grows beyond 3

---

## Pipeline Improvements

- [ ] Automated zoning ordinance refresh monitoring
- [ ] Better handling of jurisdictions with complex or multi-document ordinances
- [ ] Improve OCR pipeline for low-resolution scanned PDFs

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
