/**
 * E0-4: Post-normalization extraction output validation
 *
 * Validates each normalized ExtractionResult before it is written to the
 * database.  Two categories of check:
 *
 * 1. Structural — required fields are present and well-formed.
 * 2. Plausibility — numeric field_value falls within the expected range
 *    defined in docs/LLM_PROMPT_TEMPLATES.md.  Out-of-range values are
 *    flagged and confidence is downgraded to 'low'.
 *
 * The validator never throws — it always returns a ValidationResult so the
 * pipeline can log failures and continue (E0-3 error handling).
 */

import { NormalizedExtractionResult } from './normalize'

// ─── plausibility ranges (from LLM_PROMPT_TEMPLATES.md) ──────────────────────

interface PlausibilityRange {
  min: number
  max: number
}

const PLAUSIBILITY_RANGES: Record<string, PlausibilityRange> = {
  min_lot_size_sqft:              { min: 500,  max: 200_000 },
  height_limit_ft:                { min: 15,   max: 300 },
  density_limit_units_per_acre:   { min: 1,    max: 500 },
  parking_min_spaces_per_unit:    { min: 0,    max: 5 },
  setback_front_ft:               { min: 0,    max: 100 },
  setback_side_ft:                { min: 0,    max: 60 },
  setback_rear_ft:                { min: 0,    max: 100 },
}

const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])

// ─── types ────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
  /** Result with confidence potentially downgraded due to plausibility failure */
  result: NormalizedExtractionResult
}

// ─── validator ────────────────────────────────────────────────────────────────

export function validateExtractionResult(
  result: NormalizedExtractionResult,
): ValidationResult {
  const issues: ValidationIssue[] = []
  let output = { ...result }

  // ── structural checks ──────────────────────────────────────────────────────

  if (!result.field_name || typeof result.field_name !== 'string') {
    issues.push({ code: 'MISSING_FIELD_NAME', message: 'field_name is required' })
  }

  if (!VALID_CONFIDENCE.has(result.confidence)) {
    issues.push({
      code: 'INVALID_CONFIDENCE',
      message: `confidence must be 'high', 'medium', or 'low'; got '${result.confidence}'`,
    })
  }

  if (!result.field_value_text || result.field_value_text.trim() === '') {
    issues.push({
      code: 'MISSING_FIELD_VALUE_TEXT',
      message: 'field_value_text (verbatim quote) is required',
    })
  }

  // ── plausibility check ─────────────────────────────────────────────────────

  const range = PLAUSIBILITY_RANGES[result.field_name]

  if (range && result.field_value !== null) {
    if (result.field_value < range.min || result.field_value > range.max) {
      issues.push({
        code: 'OUT_OF_PLAUSIBLE_RANGE',
        message: `field_value ${result.field_value} is outside plausible range [${range.min}, ${range.max}] for ${result.field_name}`,
      })
      output = { ...output, confidence: 'low' }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    result: output,
  }
}

/**
 * Validate an array of results (e.g. the 3 setback objects from E2-5).
 * Returns one ValidationResult per input.
 */
export function validateExtractionResults(
  results: NormalizedExtractionResult[],
): ValidationResult[] {
  return results.map(validateExtractionResult)
}
