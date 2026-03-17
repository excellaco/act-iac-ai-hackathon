/**
 * E0-7: Unit tests for post-extraction normalization
 */
import {
  normalizeExtractionResult,
  normalizeExtractionResults,
  RawExtractionResult,
} from '../../lib/pipeline/normalize'

function makeResult(
  overrides: Partial<RawExtractionResult> & { field_name: string },
): RawExtractionResult {
  return {
    raw_value: null,
    raw_unit: '',
    field_value: null,
    field_value_text: 'verbatim quote',
    unit: '',
    confidence: 'high',
    source_section: 'Section 1',
    district_context: 'R-1',
    reasoning: 'test',
    ...overrides,
  }
}

// ─── min_lot_size_sqft ────────────────────────────────────────────────────────

describe('min_lot_size_sqft normalization', () => {
  it('passes through square feet as-is', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 8000, raw_unit: 'square feet' }),
    )
    expect(r.field_value).toBe(8000)
    expect(r.confidence).toBe('high')
  })

  it('accepts "sq ft" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 5000, raw_unit: 'sq ft' }),
    )
    expect(r.field_value).toBe(5000)
  })

  it('accepts "sqft" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 5000, raw_unit: 'sqft' }),
    )
    expect(r.field_value).toBe(5000)
  })

  it('converts acres to sqft', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 1, raw_unit: 'acres' }),
    )
    expect(r.field_value).toBe(43_560)
  })

  it('converts fractional acres', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 0.5, raw_unit: 'acres' }),
    )
    expect(r.field_value).toBe(21_780)
  })

  it('accepts singular "acre"', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 2, raw_unit: 'acre' }),
    )
    expect(r.field_value).toBe(87_120)
  })

  it('downgrades confidence and nulls field_value for unrecognized unit', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: 5, raw_unit: 'hectares', confidence: 'high' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('low')
  })

  it('returns unchanged when raw_value is null', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'min_lot_size_sqft', raw_value: null, raw_unit: 'acres' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('high')
  })
})

// ─── height_limit_ft ──────────────────────────────────────────────────────────

describe('height_limit_ft normalization', () => {
  it('passes through feet as-is', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 35, raw_unit: 'feet' }),
    )
    expect(r.field_value).toBe(35)
  })

  it('accepts "ft" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 35, raw_unit: 'ft' }),
    )
    expect(r.field_value).toBe(35)
  })

  it('converts stories to feet (× 10)', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 3, raw_unit: 'stories' }),
    )
    expect(r.field_value).toBe(30)
  })

  it('accepts singular "story"', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 4, raw_unit: 'story' }),
    )
    expect(r.field_value).toBe(40)
  })

  it('accepts "floors" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 5, raw_unit: 'floors' }),
    )
    expect(r.field_value).toBe(50)
  })

  it('converts meters to feet (× 3.281)', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 10, raw_unit: 'meters' }),
    )
    expect(r.field_value).toBeCloseTo(32.81)
  })

  it('accepts "m" alias for meters', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 10, raw_unit: 'm' }),
    )
    expect(r.field_value).toBeCloseTo(32.81)
  })

  it('downgrades confidence for unrecognized unit', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'height_limit_ft', raw_value: 5, raw_unit: 'cubits', confidence: 'medium' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('low')
  })
})

// ─── density_limit_units_per_acre ────────────────────────────────────────────

describe('density_limit_units_per_acre normalization', () => {
  it('passes through units/acre as-is', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 15, raw_unit: 'units/acre' }),
    )
    expect(r.field_value).toBe(15)
  })

  it('accepts "du/acre" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 20, raw_unit: 'du/acre' }),
    )
    expect(r.field_value).toBe(20)
  })

  it('accepts "dwelling units per acre"', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 12, raw_unit: 'dwelling units per acre' }),
    )
    expect(r.field_value).toBe(12)
  })

  it('converts units/sq ft to units/acre', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 0.001, raw_unit: 'units/sq ft' }),
    )
    expect(r.field_value).toBeCloseTo(43.56)
  })

  it('converts FAR to units/acre', () => {
    // FAR 2.0, 43560 sqft/acre, 1050 sqft/unit → ~82.97 units/acre
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 2.0, raw_unit: 'FAR' }),
    )
    expect(r.field_value).toBeCloseTo((2.0 * 43_560) / 1_050)
  })

  it('converts sqft/unit to units/acre', () => {
    // 10,000 sqft/unit → 43,560 / 10,000 = 4.356 units/acre
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 10_000, raw_unit: 'sqft/unit' }),
    )
    expect(r.field_value).toBeCloseTo(43_560 / 10_000)
  })

  it('downgrades confidence for unrecognized unit', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'density_limit_units_per_acre', raw_value: 5, raw_unit: 'units/block', confidence: 'high' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('low')
  })
})

// ─── parking_min_spaces_per_unit ─────────────────────────────────────────────

describe('parking_min_spaces_per_unit normalization', () => {
  it('passes through spaces/unit as-is', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 2, raw_unit: 'spaces/unit' }),
    )
    expect(r.field_value).toBe(2)
  })

  it('accepts "spaces per unit" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 1.5, raw_unit: 'spaces per unit' }),
    )
    expect(r.field_value).toBe(1.5)
  })

  it('accepts "per unit" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 1.25, raw_unit: 'per unit' }),
    )
    expect(r.field_value).toBe(1.25)
  })

  it('converts per bedroom to per unit (× 2)', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 1, raw_unit: 'per bedroom' }),
    )
    expect(r.field_value).toBe(2)
  })

  it('accepts "spaces/bedroom" alias', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 0.5, raw_unit: 'spaces/bedroom' }),
    )
    expect(r.field_value).toBe(1)
  })

  it('converts per sq ft to per unit (× 900)', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 0.002, raw_unit: 'per sq ft' }),
    )
    expect(r.field_value).toBeCloseTo(1.8)
  })

  it('handles zero parking minimum', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 0, raw_unit: 'spaces/unit' }),
    )
    expect(r.field_value).toBe(0)
  })

  it('downgrades confidence for unrecognized unit', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'parking_min_spaces_per_unit', raw_value: 1, raw_unit: 'spaces/lot', confidence: 'high' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('low')
  })
})

// ─── setbacks ────────────────────────────────────────────────────────────────

describe('setback normalization', () => {
  for (const fieldName of ['setback_front_ft', 'setback_side_ft', 'setback_rear_ft']) {
    describe(fieldName, () => {
      it('passes through feet as-is', () => {
        const r = normalizeExtractionResult(
          makeResult({ field_name: fieldName, raw_value: 25, raw_unit: 'feet' }),
        )
        expect(r.field_value).toBe(25)
      })

      it('accepts "ft" alias', () => {
        const r = normalizeExtractionResult(
          makeResult({ field_name: fieldName, raw_value: 10, raw_unit: 'ft' }),
        )
        expect(r.field_value).toBe(10)
      })

      it('converts meters to feet', () => {
        const r = normalizeExtractionResult(
          makeResult({ field_name: fieldName, raw_value: 6, raw_unit: 'meters' }),
        )
        expect(r.field_value).toBeCloseTo(6 * 3.281)
      })

      it('handles zero setback', () => {
        const r = normalizeExtractionResult(
          makeResult({ field_name: fieldName, raw_value: 0, raw_unit: 'feet' }),
        )
        expect(r.field_value).toBe(0)
      })

      it('downgrades confidence for unrecognized unit', () => {
        const r = normalizeExtractionResult(
          makeResult({ field_name: fieldName, raw_value: 5, raw_unit: 'yards', confidence: 'high' }),
        )
        expect(r.field_value).toBeNull()
        expect(r.confidence).toBe('low')
      })
    })
  }
})

// ─── normalizeExtractionResults (array) ──────────────────────────────────────

describe('normalizeExtractionResults', () => {
  it('normalizes an array of setback results', () => {
    const results = normalizeExtractionResults([
      makeResult({ field_name: 'setback_front_ft', raw_value: 30, raw_unit: 'feet' }),
      makeResult({ field_name: 'setback_side_ft',  raw_value: 10, raw_unit: 'feet' }),
      makeResult({ field_name: 'setback_rear_ft',  raw_value: 25, raw_unit: 'feet' }),
    ])
    expect(results[0].field_value).toBe(30)
    expect(results[1].field_value).toBe(10)
    expect(results[2].field_value).toBe(25)
  })
})

// ─── unknown field passthrough ────────────────────────────────────────────────

describe('unknown field', () => {
  it('passes through unchanged without modification', () => {
    const r = normalizeExtractionResult(
      makeResult({ field_name: 'discretionary_review_required', raw_value: null, raw_unit: '' }),
    )
    expect(r.field_value).toBeNull()
    expect(r.confidence).toBe('high')
  })
})
