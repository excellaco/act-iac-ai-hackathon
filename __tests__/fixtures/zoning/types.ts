/**
 * Types for E2-0 gold fixture set.
 *
 * Each fixture provides a zoning text snippet and the expected LLM extraction
 * result for a single field.  The `field_value` field is intentionally null —
 * the LLM is not responsible for normalization; that step runs separately.
 */

export interface ExtractionResult {
  field_name: string
  raw_value: number | null
  raw_unit: string
  /** Always null from the LLM; set by the post-extraction normalization step. */
  field_value: null
  field_value_text: string
  unit: string
  confidence: 'high' | 'medium' | 'low'
  source_section: string
  district_context: string
  reasoning: string
}

export interface ZoningFixture {
  /** Short human-readable label, e.g. "explicit-acres" */
  id: string
  /** Source jurisdiction used for this snippet */
  jurisdiction: string
  /** Difficulty/scenario tag */
  scenario: 'easy' | 'ambiguous' | 'edge'
  /** The raw zoning ordinance text presented to the LLM */
  zoningText: string
  /** Expected extraction result (field_value always null) */
  expected: ExtractionResult
}
