/**
 * Extraction artifact schema — v2 (pipeline refactor)
 *
 * Four artifact types persist to data/artifacts/{slug}/:
 *
 *   {slug}_pages.json       — parsed PDF pages (internal, gitignored)
 *   {slug}_zones.json       — discovered zones + approval gate for Stage 2
 *   {slug}_{zone}_fields.json — per-zone field values + approval gate for Stage 3
 *   {slug}_scores.json      — computed RIS scores (pipeline-generated, no approval needed)
 *
 * The old ExtractionArtifact and ZoneFieldArtifact types are retained for
 * backward compatibility during the migration period.
 */

// ─── shared / legacy types ────────────────────────────────────────────────────

/** One page of a parsed PDF. */
export interface ParsedPage {
  /** 1-indexed page number */
  page: number
  /** Extracted text content of this page */
  text: string
}

export interface ParsedPagesArtifact {
  /** GCS URI or local path of the source document that was parsed. */
  sourceDocument: string
  /** ISO timestamp of when parsing ran. */
  parsedAt: string
  /** Whether the pages came from pdf-parse text extraction or Google Vision OCR. */
  extractionMethod: 'text' | 'ocr'
  pages: ParsedPage[]
}

/** Per-field extraction result — shared by both legacy and v2 artifacts. */
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
  /**
   * 1-indexed page number where field_value_text was found.
   * Resolved inline during extraction (v2). NULL if not found.
   */
  source_page?: number | null
}

/** One field value for a specific zone — used by legacy ExtractionArtifact. */
export interface ZoneFieldArtifact extends FieldArtifact {
  field_name: string
  zone_code: string
  zone_name: string | null
  multifamily_classification: 'primary' | 'permitted' | 'limited' | 'none'
}

/**
 * Legacy single-artifact format (pre-v2).
 * Retained for backward compatibility during migration.
 */
export interface ExtractionArtifact {
  jurisdictionId: string
  slug: string
  sourceDocument: string
  extractedAt: string
  fields: Record<string, FieldArtifact>
  zoneFields?: ZoneFieldArtifact[]
}

// ─── v2 artifact types ────────────────────────────────────────────────────────

/** Normalize a zone code to a filesystem-safe slug (e.g. "R-MF/D" → "r-mf-d"). */
export function slugifyZoneCode(zoneCode: string): string {
  return zoneCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type MultifamilyClassification = 'primary' | 'permitted' | 'limited' | 'none'

/** One zone entry in the ZonesArtifact. */
export interface ZoneEntry {
  zone_code: string
  zone_name: string | null
  multifamily_classification: MultifamilyClassification
  /** Pages in the PDF where this zone code appears — used by Stage 2 for narrow-first chunk search. */
  source_pages: number[]
  /** Whether to run Gemini field extraction for this zone. Defaults to true. */
  include_in_extraction: boolean
  /** Whether to load this zone's fields into the database. Defaults to true. */
  include_in_load: boolean
}

/**
 * Stage 1 output: discovered zones for a jurisdiction.
 *
 * approved: false — pipeline-generated, awaiting human review
 * approved: true  — human-verified; Stage 2 will proceed
 *
 * Stage 2 refuses to run if approved is false.
 * Stage 2 refuses to overwrite if approved is true.
 * Stage 2 errors if approved is false and a zones artifact already exists
 * (conflict must be resolved manually before re-running).
 */
export interface ZonesArtifact {
  jurisdictionId: string
  slug: string
  sourceDocument: string
  extractedAt: string
  approved: boolean
  /** Master switch: if false, no zones are extracted regardless of per-zone flags. */
  include_in_extraction: boolean
  /** Master switch: if false, no zones are loaded regardless of per-zone flags. */
  include_in_load: boolean
  zones: ZoneEntry[]
}

/**
 * Stage 2 output: extracted field values for a single zone.
 *
 * approved: false — pipeline-generated, awaiting human review
 * approved: true  — human-verified; Stage 3 will load this zone
 *
 * Stage 3 skips zones where approved is false.
 */
export interface ZoneFieldsArtifact {
  jurisdictionId: string
  slug: string
  zoneCode: string
  zoneName: string | null
  multifamilyClassification: MultifamilyClassification
  extractedAt: string
  approved: boolean
  /**
   * Field values keyed by field name (e.g. "min_lot_size_sqft").
   * source_page is resolved inline during extraction.
   */
  fields: Record<string, FieldArtifact>
}

/** Per-zone score entry within a ScoresArtifact. */
export interface ZoneScoreEntry {
  zone_code: string
  zone_name: string | null
  multifamily_classification: MultifamilyClassification
  ris_composite: number
  dci: number
  dcoi: number
  pci: number
  crp: number
}

/**
 * Stage 4 output: computed RIS scores for a jurisdiction.
 * Written to data/artifacts/{slug}/{slug}_scores.json and to the DB.
 * Pipeline-generated — no approval needed.
 */
export interface ScoresArtifact {
  jurisdictionId: string
  slug: string
  scoredAt: string
  jurisdiction: {
    ris_composite: number
    dci: number
    dcoi: number
    pci: number
    crp: number
  }
  zones: ZoneScoreEntry[]
}
