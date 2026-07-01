# ADR-0004: Extract-then-Load Pipeline Split

**Status:** Accepted
**Date:** 2026-03-18
**Deciders:** Parcella Hackathon Team
**Related:** E0-8, Issue #102

---

## Context

The Parcella extraction pipeline runs in a single pass: fetch PDF → parse → chunk → call Gemini for each field → normalize → validate → write to DB. This architecture has two practical problems that surfaced during development:

1. **Long feedback loops on DB failures.** A bug in the DB write layer (e.g. a numeric column receiving a word-form value like `"eight"`, or a PostgreSQL encoding error from control characters in a verbatim quote) requires a full ~20-minute re-run of the Gemini extraction to verify the fix. The extraction itself is correct; only the persistence layer is broken.

2. **No path to synthetic jurisdiction data.** The demo requires ~10 jurisdictions to make the Comparative Restrictiveness Percentile (CRP) sub-score statistically meaningful. Only 3 real PDFs exist. The other 7 (synthetic) jurisdictions have no PDF source and cannot be run through the extraction stage — but they still need records in `extracted_fields` for the scoring engine to consume.

---

## Decision

We will split the pipeline into two independently runnable stages:

**Stage 1 — Extract** (`scripts/extract.ts`)
Fetches the PDF, parses it, chunks the text, calls Gemini for each field, and writes the raw results to a JSON artifact. No database writes occur in this stage.

**Stage 2 — Load** (`scripts/load.ts`)
Reads a JSON artifact, runs normalize → validate → upsert to DB. No Gemini calls occur in this stage. This stage is fast (~seconds) and fully re-runnable.

**Combined runner** (`scripts/run-pipeline.ts`)
Chains both stages in sequence, preserving the existing CI/CD behavior.

### Artifact format

Artifacts are stored at:
- GCS: `zoning/{slug}/extractions/latest.json` (production)
- Local: `data/extractions/{slug}.json` (development fallback)

The schema is defined as a TypeScript interface in `lib/pipeline/artifact.ts`:

```typescript
interface ExtractionArtifact {
  jurisdictionId: string
  slug: string
  sourceDocument: string
  extractedAt: string  // ISO 8601
  fields: Record<string, RawExtractionResult>
}
```

---

## Rationale

### Decouples the slow expensive step from the fast cheap step

Gemini extraction takes ~20 minutes and consumes API quota. DB writes take milliseconds and are free to retry. Treating them as one indivisible unit means every schema bug or encoding issue forces a full re-extraction. Splitting them means bugs in the load layer are fixed and re-tested in seconds.

### Enables synthetic jurisdiction loading

Hand-authored JSON artifacts that conform to the `ExtractionArtifact` schema can be placed in `data/extractions/` and loaded via `load.ts` without any PDF or Gemini call. This is the intended mechanism for populating the 7 synthetic jurisdictions needed for the CRP peer comparison set (E9-5, E3-4).

### Consistent with existing fetcher pattern

The codebase already separates PDF storage (GCS) from PDF parsing (`PdfParser`) from extraction (`FieldExtractor`). This ADR extends that separation one level further — extraction results become a named, storable artifact rather than an in-memory intermediate.

### Artifact storage mirrors existing GCS conventions

PDFs are stored at `zoning/{slug}/` in GCS. Placing extraction artifacts at `zoning/{slug}/extractions/` keeps all jurisdiction data co-located and browsable, making it easy to inspect what was extracted and when.

---

## Alternatives Considered

### Keep single-pass pipeline, fix bugs in place

The simplest path. Does not address the feedback loop problem or the synthetic data problem. Rejected because both problems are active blockers during the hackathon timeline.

### Per-field inserts instead of batch insert

Insert each field individually so one bad field doesn't block the others. Addresses the DB failure resilience problem but not the feedback loop or synthetic data problems. Lower value for the same effort as the split. Could be implemented alongside this ADR if desired.

### In-memory cache with re-run from cache

Cache extraction results in memory and re-use them if the DB write fails within the same process run. More complex than a file-based artifact and does not survive process restarts or CI runs. Does not enable synthetic data loading.

---

## Consequences

- `lib/pipeline/artifact.ts` is added defining the `ExtractionArtifact` interface.
- `scripts/extract.ts` is added as a standalone entry point.
- `scripts/load.ts` is added as a standalone entry point.
- `scripts/run-pipeline.ts` is updated to chain both scripts.
- `lib/pipeline/runner.ts` is refactored — `runPipeline` is split into `extractFields` and `loadArtifact`.
- `data/extractions/` is added to the repo with synthetic artifact files for the 7 demo jurisdictions.
- The GCS bucket (`parcella-501012-raw-data`) stores artifacts under `zoning/{slug}/extractions/latest.json`.
- CI pipeline (`pipeline.yml`) behavior is unchanged — it continues to run both stages end-to-end.
- Extraction artifacts are not secrets but should not be committed to Git for real jurisdictions (added to `.gitignore`); synthetic artifacts are committed as demo fixtures.
