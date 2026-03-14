# data/raw — Raw Source Data

This directory holds raw source documents consumed by the ingestion pipeline (Epic E0/E1).

## Right now: zoning ordinances

The only files needed immediately are the zoning ordinance PDFs for the three demo jurisdictions. Download them manually and place them here before running the pipeline.

```
data/raw/zoning/
  arlington/    ← put PDFs here
  fairfax/      ← put PDFs here
  loudoun/      ← put PDFs here
```

See `docs/DATA_SOURCES.md` for exact source URLs, which chapters to download, and file naming conventions.

## Git LFS

Zoning PDFs can be large. Set up Git LFS before committing them:

```bash
git lfs install
git lfs track "*.pdf"
git add .gitattributes
```

## Other data sources (FMR, ACS, permits)

These are small CSVs downloaded via API or direct URL. Add them here when you pick up the relevant E1 stories. See `docs/DATA_SOURCES.md` for download instructions.

## What does NOT go here

- `data/processed/` — pipeline output (gitignored)
- Structured extraction results — these go in the database
