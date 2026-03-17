/**
 * E0-4: Unit tests for extraction output validation
 */
import { validateExtractionResult, validateExtractionResults } from '../../lib/pipeline/validate'
import { NormalizedExtractionResult } from '../../lib/pipeline/normalize'

function makeResult(
  overrides: Partial<NormalizedExtractionResult> & { field_name: string },
): NormalizedExtractionResult {
  return {
    raw_value: 100,
    raw_unit: 'feet',
    field_value: 100,
    field_value_text: 'verbatim quote',
    unit: 'ft',
    confidence: 'high',
    source_section: 'Section 1',
    district_context: 'R-1',
    reasoning: 'test',
    ...overrides,
  }
}

// ─── structural validation ────────────────────────────────────────────────────

describe('structural validation', () => {
  it('passes a well-formed result', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 35 }),
    )
    expect(valid).toBe(true)
    expect(issues).toHaveLength(0)
  })

  it('fails when field_name is empty', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: '' }),
    )
    expect(valid).toBe(false)
    expect(issues[0].code).toBe('MISSING_FIELD_NAME')
  })

  it('fails when confidence is invalid', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', confidence: 'very_high' as never }),
    )
    expect(valid).toBe(false)
    expect(issues[0].code).toBe('INVALID_CONFIDENCE')
  })

  it('fails when field_value_text is empty', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value_text: '' }),
    )
    expect(valid).toBe(false)
    expect(issues[0].code).toBe('MISSING_FIELD_VALUE_TEXT')
  })

  it('fails when field_value_text is whitespace only', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value_text: '   ' }),
    )
    expect(valid).toBe(false)
    expect(issues[0].code).toBe('MISSING_FIELD_VALUE_TEXT')
  })

  it('accumulates multiple structural issues', () => {
    const { valid, issues } = validateExtractionResult(
      makeResult({ field_name: '', field_value_text: '', confidence: 'bad' as never }),
    )
    expect(valid).toBe(false)
    expect(issues).toHaveLength(3)
  })
})

// ─── plausibility ranges ──────────────────────────────────────────────────────

describe('plausibility — min_lot_size_sqft', () => {
  it('passes a value within range', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', field_value: 8000 }),
    )
    expect(valid).toBe(true)
  })

  it('fails and downgrades confidence when below min (500)', () => {
    const { valid, issues, result } = validateExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', field_value: 100, confidence: 'high' }),
    )
    expect(valid).toBe(false)
    expect(issues[0].code).toBe('OUT_OF_PLAUSIBLE_RANGE')
    expect(result.confidence).toBe('low')
  })

  it('fails when above max (200,000)', () => {
    const { valid, result } = validateExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', field_value: 300_000, confidence: 'medium' }),
    )
    expect(valid).toBe(false)
    expect(result.confidence).toBe('low')
  })

  it('passes when field_value is null (field not found)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', field_value: null }),
    )
    expect(valid).toBe(true)
  })
})

describe('plausibility — height_limit_ft', () => {
  it('passes 35 ft', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 35 }),
    )
    expect(valid).toBe(true)
  })

  it('fails below min (15)', () => {
    const { valid, result } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 5, confidence: 'high' }),
    )
    expect(valid).toBe(false)
    expect(result.confidence).toBe('low')
  })

  it('fails above max (300)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 400 }),
    )
    expect(valid).toBe(false)
  })
})

describe('plausibility — density_limit_units_per_acre', () => {
  it('passes 15 units/acre', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', field_value: 15 }),
    )
    expect(valid).toBe(true)
  })

  it('fails below min (1)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', field_value: 0.5 }),
    )
    expect(valid).toBe(false)
  })

  it('fails above max (500)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', field_value: 600 }),
    )
    expect(valid).toBe(false)
  })
})

describe('plausibility — parking_min_spaces_per_unit', () => {
  it('passes 2 spaces/unit', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', field_value: 2 }),
    )
    expect(valid).toBe(true)
  })

  it('passes 0 (transit overlay zone)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', field_value: 0 }),
    )
    expect(valid).toBe(true)
  })

  it('fails above max (5)', () => {
    const { valid, result } = validateExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', field_value: 6, confidence: 'high' }),
    )
    expect(valid).toBe(false)
    expect(result.confidence).toBe('low')
  })
})

describe('plausibility — setbacks', () => {
  it('passes front setback of 30 ft', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_front_ft', field_value: 30 }),
    )
    expect(valid).toBe(true)
  })

  it('passes zero front setback (build-to-line)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_front_ft', field_value: 0 }),
    )
    expect(valid).toBe(true)
  })

  it('fails front setback above max (100)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_front_ft', field_value: 150 }),
    )
    expect(valid).toBe(false)
  })

  it('passes side setback within range', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_side_ft', field_value: 10 }),
    )
    expect(valid).toBe(true)
  })

  it('fails side setback above max (60)', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_side_ft', field_value: 80 }),
    )
    expect(valid).toBe(false)
  })

  it('passes rear setback within range', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'setback_rear_ft', field_value: 25 }),
    )
    expect(valid).toBe(true)
  })
})

// ─── unknown field passthrough ────────────────────────────────────────────────

describe('unknown field', () => {
  it('skips plausibility check for fields with no defined range', () => {
    const { valid } = validateExtractionResult(
      makeResult({ field_name: 'discretionary_review_required', field_value: null }),
    )
    expect(valid).toBe(true)
  })
})

// ─── confidence downgrade preserved ──────────────────────────────────────────

describe('confidence downgrade', () => {
  it('downgrades from medium to low on plausibility failure', () => {
    const { result } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 5, confidence: 'medium' }),
    )
    expect(result.confidence).toBe('low')
  })

  it('does not change confidence when value is in range', () => {
    const { result } = validateExtractionResult(
      makeResult({ field_name: 'height_limit_ft', field_value: 45, confidence: 'medium' }),
    )
    expect(result.confidence).toBe('medium')
  })
})

// ─── validateExtractionResults (array) ───────────────────────────────────────

describe('validateExtractionResults', () => {
  it('validates an array and returns one result per input', () => {
    const results = validateExtractionResults([
      makeResult({ field_name: 'setback_front_ft', field_value: 30 }),
      makeResult({ field_name: 'setback_side_ft',  field_value: 10 }),
      makeResult({ field_name: 'setback_rear_ft',  field_value: 200 }), // out of range
    ])
    expect(results[0].valid).toBe(true)
    expect(results[1].valid).toBe(true)
    expect(results[2].valid).toBe(false)
    expect(results[2].result.confidence).toBe('low')
  })
})
