/**
 * E0-8: Extraction artifact schema
 *
 * An ExtractionArtifact is the JSON output of the extract stage and the input
 * to the load stage.  Persisted to GCS (prod) or data/extractions/ (local/synthetic).
 *
 * The artifact stores both the raw LLM output and the post-normalization values so
 * that the load stage can re-run normalize → validate idempotently without Gemini.
 *
 * Synthetic jurisdictions use hand-authored artifacts — no PDF or Gemini call needed.
 */

/** One page of a parsed PDF — used by the page-resolve stage to find source page numbers. */
export interface ParsedPage {
  /** 1-indexed page number */
  page: number
  /** Extracted text content of this page */
  text: string
}

export type ParsedPagesArtifact = ParsedPage[]

export interface FieldArtifact {
  /** Raw value as returned by the LLM, in the unit as written in the ordinance */
  raw_value: number | null
  /** Raw unit as returned by the LLM (e.g. "acres", "stories", "feet") */
  raw_unit: string | null
  /** Normalized field value after post-extraction unit conversion */
  field_value: number | null
  /** Verbatim quote from the ordinance text */
  field_value_text: string
  /** Canonical unit after normalization (e.g. "sqft", "ft", "units_per_acre") */
  unit: string | null
  confidence: 'high' | 'medium' | 'low'
  source_section: string | null
  district_context: string | null
  reasoning: string | null
}

/** One field value for a specific zone, as produced by multi-zone extraction. */
export interface ZoneFieldArtifact extends FieldArtifact {
  /** The regulatory field name (e.g. "density_limit_units_per_acre"). */
  field_name: string
  zone_code: string
  zone_name: string | null
  /** Multifamily permission classification for this zone. */
  multifamily_classification: 'primary' | 'permitted' | 'limited' | 'none'
}

export interface ExtractionArtifact {
  /** UUID of the jurisdiction in the database */
  jurisdictionId: string
  /** URL-safe slug matching the jurisdictions.slug column (e.g. "fairfax-va") */
  slug: string
  /** Source document path — GCS URI or local path */
  sourceDocument: string
  /** ISO 8601 timestamp of when extraction ran */
  extractedAt: string
  /** One entry per field name (e.g. "min_lot_size_sqft", "height_limit_ft") */
  fields: Record<string, FieldArtifact>
  /**
   * Per-zone field values — one entry per (zone_code, field_name) pair.
   * Present only when multi-zone extraction ran (E2-155).
   * Absent for synthetic jurisdictions and pre-E2-155 artifacts.
   */
  zoneFields?: ZoneFieldArtifact[]
}
