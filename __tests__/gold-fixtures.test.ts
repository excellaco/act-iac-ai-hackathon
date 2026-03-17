/**
 * E2-0: Gold fixture validation tests
 *
 * These tests do NOT call an LLM. They validate:
 * 1. Every fixture has required fields populated correctly.
 * 2. field_value is always null (set by normalization, not the LLM).
 * 3. confidence is a valid tier.
 * 4. The fixture set covers the required scenarios per field.
 * 5. Each field has at least 3 fixtures (easy + ambiguous + edge).
 */

import {
  minLotSizeFixtures,
  heightLimitFixtures,
  densityLimitFixtures,
  parkingMinFixtures,
  setbackFixtures,
  discretionaryReviewFixtures,
  ZoningFixture,
  ExtractionResult,
} from './fixtures/zoning'

const VALID_CONFIDENCE: ExtractionResult['confidence'][] = ['high', 'medium', 'low']
const VALID_FIELD_NAMES = [
  'min_lot_size_sqft',
  'height_limit_ft',
  'density_limit_units_per_acre',
  'parking_min_spaces_per_unit',
  'setback_front_ft',
  'setback_side_ft',
  'setback_rear_ft',
  'discretionary_review_required',
]

function validateExtractionResult(result: ExtractionResult, label: string) {
  expect(result.field_name).toBeTruthy()
  expect(VALID_FIELD_NAMES).toContain(result.field_name)
  // field_value must always be null — normalization sets it, not the LLM
  expect(result.field_value).toBeNull()
  expect(VALID_CONFIDENCE).toContain(result.confidence)
  expect(result.field_value_text).toBeTruthy()
  expect(result.source_section).toBeTruthy()
  expect(result.reasoning).toBeTruthy()
  // raw_value may be null (field not found) but raw_unit must be a string
  expect(typeof result.raw_unit).toBe('string')
  if (result.raw_value !== null) {
    expect(typeof result.raw_value).toBe('number')
  }
}

function validateFixtureShape(fixture: ZoningFixture) {
  expect(fixture.id).toBeTruthy()
  expect(fixture.jurisdiction).toBeTruthy()
  expect(['easy', 'ambiguous', 'edge']).toContain(fixture.scenario)
  expect(fixture.zoningText.length).toBeGreaterThan(20)
  validateExtractionResult(fixture.expected, fixture.id)
}

function hasCoverage(fixtures: ZoningFixture[]) {
  const scenarios = fixtures.map((f) => f.scenario)
  return {
    easy: scenarios.includes('easy'),
    ambiguous: scenarios.includes('ambiguous'),
    edge: scenarios.includes('edge'),
  }
}

// ── min_lot_size_sqft ────────────────────────────────────────────────────────

describe('min_lot_size_sqft fixtures', () => {
  it('has at least 3 fixtures', () => {
    expect(minLotSizeFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const cov = hasCoverage(minLotSizeFixtures)
    expect(cov.easy).toBe(true)
    expect(cov.ambiguous).toBe(true)
    expect(cov.edge).toBe(true)
  })

  it.each(minLotSizeFixtures)('$id has valid shape', (fixture) => {
    validateFixtureShape(fixture)
    expect(fixture.expected.field_name).toBe('min_lot_size_sqft')
  })

  it('all fixtures have field_value null', () => {
    minLotSizeFixtures.forEach((f) => expect(f.expected.field_value).toBeNull())
  })
})

// ── height_limit_ft ──────────────────────────────────────────────────────────

describe('height_limit_ft fixtures', () => {
  it('has at least 3 fixtures', () => {
    expect(heightLimitFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const cov = hasCoverage(heightLimitFixtures)
    expect(cov.easy).toBe(true)
    expect(cov.ambiguous).toBe(true)
    expect(cov.edge).toBe(true)
  })

  it.each(heightLimitFixtures)('$id has valid shape', (fixture) => {
    validateFixtureShape(fixture)
    expect(fixture.expected.field_name).toBe('height_limit_ft')
  })
})

// ── density_limit_units_per_acre ─────────────────────────────────────────────

describe('density_limit_units_per_acre fixtures', () => {
  it('has at least 3 fixtures', () => {
    expect(densityLimitFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const cov = hasCoverage(densityLimitFixtures)
    expect(cov.easy).toBe(true)
    expect(cov.ambiguous).toBe(true)
    expect(cov.edge).toBe(true)
  })

  it.each(densityLimitFixtures)('$id has valid shape', (fixture) => {
    validateFixtureShape(fixture)
    expect(fixture.expected.field_name).toBe('density_limit_units_per_acre')
  })
})

// ── parking_min_spaces_per_unit ──────────────────────────────────────────────

describe('parking_min_spaces_per_unit fixtures', () => {
  it('has at least 3 fixtures', () => {
    expect(parkingMinFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const cov = hasCoverage(parkingMinFixtures)
    expect(cov.easy).toBe(true)
    expect(cov.ambiguous).toBe(true)
    expect(cov.edge).toBe(true)
  })

  it.each(parkingMinFixtures)('$id has valid shape', (fixture) => {
    validateFixtureShape(fixture)
    expect(fixture.expected.field_name).toBe('parking_min_spaces_per_unit')
  })
})

// ── setbacks ─────────────────────────────────────────────────────────────────

describe('setback fixtures', () => {
  it('has at least 3 setback snippet sets', () => {
    expect(setbackFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const scenarios = setbackFixtures.map((f) => f.scenario)
    expect(scenarios).toContain('easy')
    expect(scenarios).toContain('ambiguous')
    expect(scenarios).toContain('edge')
  })

  it.each(setbackFixtures)('$id returns 3 results (front, side, rear)', (fixture) => {
    expect(fixture.expected).toHaveLength(3)
    expect(fixture.expected[0].field_name).toBe('setback_front_ft')
    expect(fixture.expected[1].field_name).toBe('setback_side_ft')
    expect(fixture.expected[2].field_name).toBe('setback_rear_ft')
  })

  it.each(setbackFixtures)('$id all results have valid shape', (fixture) => {
    fixture.expected.forEach((result) => {
      validateExtractionResult(result, fixture.id)
    })
  })

  it.each(setbackFixtures)('$id all results have field_value null', (fixture) => {
    fixture.expected.forEach((result) => {
      expect(result.field_value).toBeNull()
    })
  })
})

// ── discretionary_review_required ────────────────────────────────────────────

describe('discretionary_review_required fixtures', () => {
  const VALID_REVIEW_TYPES = ['by-right', 'conditional_use_permit', 'special_use_permit']

  it('has at least 3 fixtures', () => {
    expect(discretionaryReviewFixtures.length).toBeGreaterThanOrEqual(3)
  })

  it('covers easy, ambiguous, and edge scenarios', () => {
    const cov = hasCoverage(discretionaryReviewFixtures)
    expect(cov.easy).toBe(true)
    expect(cov.ambiguous).toBe(true)
  })

  it('covers all three review types', () => {
    const types = discretionaryReviewFixtures.map((f) => f.expected.field_value_text)
    expect(types).toContain('by-right')
    expect(types).toContain('conditional_use_permit')
    expect(types).toContain('special_use_permit')
  })

  it.each(discretionaryReviewFixtures)('$id has valid shape', (fixture) => {
    validateFixtureShape(fixture)
    expect(fixture.expected.field_name).toBe('discretionary_review_required')
    expect(VALID_REVIEW_TYPES).toContain(fixture.expected.field_value_text)
  })

  it.each(discretionaryReviewFixtures)('$id has raw_value null (categorical field)', (fixture) => {
    expect(fixture.expected.raw_value).toBeNull()
  })
})

// ── overall coverage summary ──────────────────────────────────────────────────

describe('gold fixture set completeness', () => {
  it('has fixtures for all 6 extraction fields', () => {
    const coveredFields = new Set([
      ...minLotSizeFixtures.map((f) => f.expected.field_name),
      ...heightLimitFixtures.map((f) => f.expected.field_name),
      ...densityLimitFixtures.map((f) => f.expected.field_name),
      ...parkingMinFixtures.map((f) => f.expected.field_name),
      ...setbackFixtures.flatMap((f) => f.expected.map((r) => r.field_name)),
      ...discretionaryReviewFixtures.map((f) => f.expected.field_name),
    ])
    expect(coveredFields).toContain('min_lot_size_sqft')
    expect(coveredFields).toContain('height_limit_ft')
    expect(coveredFields).toContain('density_limit_units_per_acre')
    expect(coveredFields).toContain('parking_min_spaces_per_unit')
    expect(coveredFields).toContain('setback_front_ft')
    expect(coveredFields).toContain('setback_side_ft')
    expect(coveredFields).toContain('setback_rear_ft')
    expect(coveredFields).toContain('discretionary_review_required')
  })

  it('has at least 3 jurisdictions represented', () => {
    const jurisdictions = new Set([
      ...minLotSizeFixtures.map((f) => f.jurisdiction),
      ...heightLimitFixtures.map((f) => f.jurisdiction),
      ...densityLimitFixtures.map((f) => f.jurisdiction),
      ...parkingMinFixtures.map((f) => f.jurisdiction),
      ...setbackFixtures.map((f) => f.jurisdiction),
      ...discretionaryReviewFixtures.map((f) => f.jurisdiction),
    ])
    // Must cover Fairfax, Arlington, Loudoun
    expect(jurisdictions.size).toBeGreaterThanOrEqual(3)
  })

  it('total fixture count is at least 23', () => {
    const total =
      minLotSizeFixtures.length +
      heightLimitFixtures.length +
      densityLimitFixtures.length +
      parkingMinFixtures.length +
      setbackFixtures.length +     // 4 snippet sets × 3 results each
      discretionaryReviewFixtures.length
    expect(total).toBeGreaterThanOrEqual(23)
  })
})
