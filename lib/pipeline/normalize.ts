/**
 * E0-7: Post-extraction normalization
 *
 * Converts raw_value + raw_unit (as extracted by the LLM) to a canonical
 * field_value in the expected unit.  This step runs after every LLM
 * extraction call and before validation (E0-4).
 *
 * Keeping conversion logic here — not inside LLM prompts — means it is
 * unit-testable, auditable, and accurately describable in the "About this
 * score" methodology modal (E6-5).
 */

export interface RawExtractionResult {
  field_name: string
  raw_value: number | null
  raw_unit: string
  field_value: number | null
  field_value_text: string
  unit: string
  confidence: 'high' | 'medium' | 'low'
  source_section: string
  district_context: string
  reasoning: string
}

export type NormalizedExtractionResult = RawExtractionResult

// ─── conversion helpers ───────────────────────────────────────────────────────

const SQFT_PER_ACRE = 43_560
const FT_PER_METER = 3.281
/** Assumed average floor-to-floor height when converting stories → ft */
const FT_PER_STORY = 10
/** Assumed average sq ft per unit for parking per-sqft conversion */
const SQFT_PER_UNIT = 900
/** Assumed average bedrooms per unit for parking per-bedroom conversion */
const BEDROOMS_PER_UNIT = 2
/** Assumed average floor area for FAR → density conversion (sqft per unit) */
const SQFT_PER_UNIT_FAR = 1_050

// ─── normalizers per field ────────────────────────────────────────────────────

function normalizeMinLotSize(
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } {
  const u = raw_unit.toLowerCase().trim()
  if (u === 'acres' || u === 'acre') {
    return { field_value: raw_value * SQFT_PER_ACRE, recognized: true }
  }
  if (
    u === 'sq ft' ||
    u === 'sqft' ||
    u === 'square feet' ||
    u === 'square foot' ||
    u === 'sf'
  ) {
    return { field_value: raw_value, recognized: true }
  }
  return { field_value: raw_value, recognized: false }
}

function normalizeHeightLimit(
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } {
  const u = raw_unit.toLowerCase().trim()
  if (u === 'stories' || u === 'story' || u === 'floors' || u === 'floor') {
    return { field_value: raw_value * FT_PER_STORY, recognized: true }
  }
  if (u === 'meters' || u === 'm' || u === 'metre' || u === 'metres') {
    return { field_value: raw_value * FT_PER_METER, recognized: true }
  }
  if (u === 'ft' || u === 'feet' || u === 'foot') {
    return { field_value: raw_value, recognized: true }
  }
  return { field_value: raw_value, recognized: false }
}

function normalizeDensityLimit(
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } {
  const u = raw_unit.toLowerCase().trim()
  if (
    u === 'units/acre' ||
    u === 'du/acre' ||
    u === 'units per acre' ||
    u === 'dwelling units per acre' ||
    u === 'units_per_acre'
  ) {
    return { field_value: raw_value, recognized: true }
  }
  if (u === 'units/sq ft' || u === 'units per sq ft' || u === 'units/sqft') {
    return { field_value: raw_value * SQFT_PER_ACRE, recognized: true }
  }
  if (u === 'far' || u === 'floor area ratio') {
    return {
      field_value: (raw_value * SQFT_PER_ACRE) / SQFT_PER_UNIT_FAR,
      recognized: true,
    }
  }
  // sqft/unit — inverse of units/sqft
  if (u === 'sqft/unit' || u === 'sq ft per unit' || u === 'square feet per unit') {
    return { field_value: SQFT_PER_ACRE / raw_value, recognized: true }
  }
  return { field_value: raw_value, recognized: false }
}

function normalizeParkingMin(
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } {
  const u = raw_unit.toLowerCase().trim()
  if (
    u === 'spaces/unit' ||
    u === 'spaces per unit' ||
    u === 'spaces_per_unit' ||
    u === 'per unit' ||
    u === 'stalls/unit'
  ) {
    return { field_value: raw_value, recognized: true }
  }
  if (
    u === 'per bedroom' ||
    u === 'spaces/bedroom' ||
    u === 'spaces per bedroom'
  ) {
    return { field_value: raw_value * BEDROOMS_PER_UNIT, recognized: true }
  }
  if (u === 'per sq ft' || u === 'spaces/sq ft' || u === 'spaces per sq ft') {
    return { field_value: raw_value * SQFT_PER_UNIT, recognized: true }
  }
  return { field_value: raw_value, recognized: false }
}

function normalizeSetback(
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } {
  const u = raw_unit.toLowerCase().trim()
  if (u === 'meters' || u === 'm' || u === 'metre' || u === 'metres') {
    return { field_value: raw_value * FT_PER_METER, recognized: true }
  }
  if (u === 'ft' || u === 'feet' || u === 'foot') {
    return { field_value: raw_value, recognized: true }
  }
  return { field_value: raw_value, recognized: false }
}

// ─── field router ─────────────────────────────────────────────────────────────

const SETBACK_FIELDS = new Set([
  'setback_front_ft',
  'setback_side_ft',
  'setback_rear_ft',
])

function applyConversion(
  field_name: string,
  raw_value: number,
  raw_unit: string,
): { field_value: number; recognized: boolean } | null {
  if (field_name === 'min_lot_size_sqft') return normalizeMinLotSize(raw_value, raw_unit)
  if (field_name === 'height_limit_ft') return normalizeHeightLimit(raw_value, raw_unit)
  if (field_name === 'density_limit_units_per_acre') return normalizeDensityLimit(raw_value, raw_unit)
  if (field_name === 'parking_min_spaces_per_unit') return normalizeParkingMin(raw_value, raw_unit)
  if (SETBACK_FIELDS.has(field_name)) return normalizeSetback(raw_value, raw_unit)
  return null
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Normalize a single extraction result.
 *
 * - If `raw_value` is null, returns the result unchanged (field not found).
 * - If the field is unknown, returns unchanged.
 * - If `raw_unit` is unrecognized, sets `field_value` to null and downgrades
 *   `confidence` to `'low'`.
 */
export function normalizeExtractionResult(
  result: RawExtractionResult,
): NormalizedExtractionResult {
  if (result.raw_value === null) return result

  const conversion = applyConversion(result.field_name, result.raw_value, result.raw_unit)
  if (conversion === null) return result  // unknown field — pass through

  if (!conversion.recognized) {
    return {
      ...result,
      field_value: null,
      confidence: 'low',
    }
  }

  return {
    ...result,
    field_value: conversion.field_value,
  }
}

/**
 * Normalize an array of results (used for E2-5 setbacks which return 3 objects).
 */
export function normalizeExtractionResults(
  results: RawExtractionResult[],
): NormalizedExtractionResult[] {
  return results.map(normalizeExtractionResult)
}
