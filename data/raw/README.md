# data/raw — Raw Source Files

This directory holds raw source documents consumed by the ingestion pipeline (Epic E0/E1) before processing. Files here are inputs to the pipeline — not outputs.

---

## Folder Structure

```
data/raw/
└── zoning/
    ├── fairfax/       # Fairfax County, VA zoning ordinance PDFs
    ├── arlington/     # Arlington County, VA zoning ordinance PDFs
    └── loudoun/       # Loudoun County, VA zoning ordinance PDFs
```

---

## Zoning Ordinance PDFs

### Primary storage: Google Cloud Storage

Zoning ordinance PDFs are stored in GCS — **not committed to Git** — because files are ~90MB. The pipeline fetches them from GCS at runtime.

**Bucket:** `gs://parcela-490518-raw-data`

```
gs://parcela-490518-raw-data/
└── zoning/
    ├── fairfax/
    ├── arlington/
    └── loudoun/
```

See `infra/` for the Terraform config that provisions this bucket. See `infra/README.md` for upload instructions.

### Local development fallback

The `data/raw/zoning/` folder is retained as a local fallback for development without GCS access. Place PDFs here locally; the pipeline falls back to the local path when the `RAW_DATA_BUCKET` environment variable is not set. PDFs in this folder are gitignored.

---

## File Naming Convention

Use lowercase, descriptive names with the jurisdiction abbreviation, year, and download date:

```
{jurisdiction}_{document_description}_{year}_downloaded_{YYYYMMDD}.pdf
```

Examples:
- `fairfax_zoning_ordinance_article2_2024_downloaded_20260316.pdf`
- `arlington_aczo_2026_downloaded_20260316.pdf`
- `loudoun_zoning_ordinance_2023_downloaded_20260316.pdf`

The download date becomes the zoning ordinance vintage in the pipeline run record (E0-5).

---

## Download Instructions

| Jurisdiction | Source | Access | Focus Chapters |
|---|---|---|---|
| Fairfax County | https://www.fairfaxcounty.gov/planning-development/zoning-ordinance | Navigate to residential chapters and export as PDF | Article 2 (Residential Districts), Article 4 (Use Regulations), Article 5 (Development Standards) |
| Arlington County | https://www.arlingtonva.us/files/sharedassets/public/v/1/building/documents/codes-and-ordinances/aczo_effective_1.24.2026.pdf | Direct PDF download — one file covers the full ordinance | Save as `arlington_aczo_2026_downloaded_{YYYYMMDD}.pdf` |
| Loudoun County | https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx#secid-1770 | Manual download only — platform requires JavaScript and cannot be crawled programmatically | Chapter 3 (Zoning Districts), Chapter 4 (Use Standards), Chapter 5 (Development Standards) |

After downloading, upload to GCS per the instructions in `infra/README.md`.

---

## Other Data Sources (FMR, ACS, permits)

These are typically small CSVs downloaded via API or direct URL. Add them here when you pick up the relevant E1 stories. See `docs/DATA_SOURCES.md` for download instructions.

---

## What Does NOT Belong Here

- `data/processed/` — pipeline outputs (gitignored)
- Structured extraction results — these go in the database
- Pipeline outputs or scores
- Any file that can be fetched programmatically at runtime (those should be fetched by the pipeline, not committed)
