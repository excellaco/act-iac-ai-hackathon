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

The only files needed immediately are the zoning ordinance PDFs for the three demo jurisdictions. Download them manually and place them in the jurisdiction folders above before running the pipeline.

See `docs/DATA_SOURCES.md` for exact source URLs, which chapters to download, and file naming conventions.

### File Naming Convention

Use lowercase, descriptive names with the jurisdiction abbreviation and year:

```
{jurisdiction}_{document_description}_{year}.pdf
```

Examples:
- `data/raw/zoning/fairfax/fairfax_zoning_ordinance_article2_2024.pdf`
- `data/raw/zoning/arlington/arlington_aczo_2026.pdf`
- `data/raw/zoning/loudoun/loudoun_zoning_ordinance_chapter3_2023.pdf`

### Download Instructions

| Jurisdiction | Source | Access | Focus Chapters |
|---|---|---|---|
| Fairfax County | https://www.fairfaxcounty.gov/planning-development/zoning-ordinance | Navigate to residential chapters and export as PDF | Article 2 (Residential Districts), Article 4 (Use Regulations), Article 5 (Development Standards) |
| Arlington County | https://www.arlingtonva.us/files/sharedassets/public/v/1/building/documents/codes-and-ordinances/aczo_effective_1.24.2026.pdf | Direct PDF download — one file covers the full ordinance | Save as `arlington_aczo_2026.pdf` |
| Loudoun County | https://online.encodeplus.com/regs/loudouncounty-va-crosswalk/doc-viewer.aspx#secid-1770 | Manual download only — platform requires JavaScript and cannot be crawled programmatically | Chapter 3 (Zoning Districts), Chapter 4 (Use Standards), Chapter 5 (Development Standards) |

### Recording the Download Date

The download date for each PDF becomes the zoning ordinance vintage in the pipeline run record (E0-5). After downloading, record the date in the pipeline run or in a manifest file — there is no versioned annual snapshot for zoning ordinances.

---

## Git LFS

Zoning ordinance PDFs can be large (10–100MB). If a file exceeds 50MB, commit it using [Git LFS](https://git-lfs.github.com/) rather than directly to the repository.

Set up Git LFS:
```bash
git lfs install
```

Track PDF files with LFS:
```bash
git lfs track "*.pdf"
git add .gitattributes
```

Then add and commit the PDF normally — Git LFS handles the rest.

---

## Other Data Sources (FMR, ACS, permits)

These are typically small CSVs downloaded via API or direct URL. Add them here when you pick up the relevant E1 stories. See `docs/DATA_SOURCES.md` for download instructions.

---

## What Does NOT Belong Here

- `data/processed/` — pipeline outputs (gitignored)
- Structured extraction results — these go in the database
- Pipeline outputs or scores
- Any file that can be fetched programmatically at runtime (those should be fetched by the pipeline, not committed)
