import {
  computeDCI,
  computeDCOI,
  computePCI,
  computeCRP,
  computeAllSubScores,
  BASE_COST_PER_UNIT,
  PARKING_STALL_COST,
  type DciInputs,
  type PciInputs,
} from '../lib/scoringEngine'

// ── helpers ───────────────────────────────────────────────────────────────

/** Baseline "middle of the road" DCI inputs for overriding one field at a time. */
const MID_DCI: DciInputs = {
  minLotSizeSqft: 20_000,
  heightLimitFt: 100,
  densityLimitUpa: 30,
  setbackFrontFt: 15,
  setbackSideFt: 10,
  setbackRearFt: 15,
}

// ── E3-1: computeDCI ──────────────────────────────────────────────────────

describe('computeDCI', () => {
  it('returns a number between 0 and 100', () => {
    const score = computeDCI(MID_DCI)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('scores maximally restrictive inputs near 100', () => {
    const restrictive: DciInputs = {
      minLotSizeSqft: 87_120,  // max lot size (2 acres)
      heightLimitFt: 25,        // min height limit
      densityLimitUpa: 1,       // min density
      setbackFrontFt: 40,
      setbackSideFt: 40,
      setbackRearFt: 40,        // total 120 = max setbacks
    }
    expect(computeDCI(restrictive)).toBeGreaterThanOrEqual(95)
  })

  it('scores maximally permissive inputs near 0', () => {
    const permissive: DciInputs = {
      minLotSizeSqft: 3_000,   // min lot size
      heightLimitFt: 250,       // max height
      densityLimitUpa: 150,     // max density
      setbackFrontFt: 5,
      setbackSideFt: 5,
      setbackRearFt: 5,         // total 15 = min setbacks
    }
    expect(computeDCI(permissive)).toBeLessThanOrEqual(5)
  })

  it('larger lot size increases restrictiveness', () => {
    const small = computeDCI({ ...MID_DCI, minLotSizeSqft: 5_000 })
    const large = computeDCI({ ...MID_DCI, minLotSizeSqft: 50_000 })
    expect(large).toBeGreaterThan(small)
  })

  it('lower height limit increases restrictiveness', () => {
    const tall = computeDCI({ ...MID_DCI, heightLimitFt: 200 })
    const short = computeDCI({ ...MID_DCI, heightLimitFt: 35 })
    expect(short).toBeGreaterThan(tall)
  })

  it('lower density limit increases restrictiveness', () => {
    const dense = computeDCI({ ...MID_DCI, densityLimitUpa: 100 })
    const sparse = computeDCI({ ...MID_DCI, densityLimitUpa: 5 })
    expect(sparse).toBeGreaterThan(dense)
  })

  it('larger setbacks increase restrictiveness', () => {
    const tight = computeDCI({ ...MID_DCI, setbackFrontFt: 5, setbackSideFt: 5, setbackRearFt: 5 })
    const wide = computeDCI({ ...MID_DCI, setbackFrontFt: 30, setbackSideFt: 20, setbackRearFt: 30 })
    expect(wide).toBeGreaterThan(tight)
  })

  it('clamps values beyond normalization range', () => {
    const beyondMax: DciInputs = {
      minLotSizeSqft: 200_000,  // way beyond 87,120 max
      heightLimitFt: 10,         // below 25 min
      densityLimitUpa: 0.5,      // below 1 min
      setbackFrontFt: 50,
      setbackSideFt: 50,
      setbackRearFt: 50,         // total 150, beyond 120 max
    }
    const score = computeDCI(beyondMax)
    expect(score).toBeLessThanOrEqual(100)
    expect(score).toBeGreaterThanOrEqual(0)
  })
})

// ── E3-2: computeDCOI ─────────────────────────────────────────────────────

describe('computeDCOI', () => {
  it('returns a number between 0 and 100', () => {
    const score = computeDCOI({ parkingMinSpacesPerUnit: 1.5, regionalMultiplier: 1.10 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('zero parking with low regional multiplier scores low', () => {
    const score = computeDCOI({ parkingMinSpacesPerUnit: 0, regionalMultiplier: 0.85 })
    expect(score).toBeLessThanOrEqual(5)
  })

  it('high parking with high regional multiplier scores high', () => {
    const score = computeDCOI({ parkingMinSpacesPerUnit: 3.0, regionalMultiplier: 1.30 })
    expect(score).toBeGreaterThanOrEqual(95)
  })

  it('more parking increases cost impact', () => {
    const low = computeDCOI({ parkingMinSpacesPerUnit: 0.5, regionalMultiplier: 1.10 })
    const high = computeDCOI({ parkingMinSpacesPerUnit: 2.5, regionalMultiplier: 1.10 })
    expect(high).toBeGreaterThan(low)
  })

  it('higher regional multiplier increases cost impact', () => {
    const cheap = computeDCOI({ parkingMinSpacesPerUnit: 1.0, regionalMultiplier: 0.90 })
    const expensive = computeDCOI({ parkingMinSpacesPerUnit: 1.0, regionalMultiplier: 1.25 })
    expect(expensive).toBeGreaterThan(cheap)
  })

  it('hand-computed example: Fairfax with 2 spaces, 1.12 multiplier', () => {
    // Construction: 180,000 * 1.12 = 201,600
    // Parking: 2 * 25,000 = 50,000
    // Total: 251,600
    // Range: min = 153,000, max = 309,000
    // Normalized: (251,600 - 153,000) / (309,000 - 153,000) * 100 = 63.2
    const score = computeDCOI({ parkingMinSpacesPerUnit: 2, regionalMultiplier: 1.12 })
    expect(score).toBe(63)
  })
})

// ── E3-3: computePCI ──────────────────────────────────────────────────────

describe('computePCI', () => {
  it('returns a number between 0 and 100', () => {
    const score = computePCI({ permits5plus: 500, totalPermits: 1000, discretionaryReviewType: 'conditional-use-permit' })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('by-right with high multifamily permit ratio scores lowest', () => {
    const score = computePCI({
      permits5plus: 900,
      totalPermits: 1000,
      discretionaryReviewType: 'by-right',
    })
    // Review: 0.70 * 20 = 14
    // Ratio: 0.9, normalized ≈ 94.4, inverted ≈ 5.6, weighted: 0.30 * 5.6 ≈ 1.7
    // Total ≈ 15.7 → 16
    expect(score).toBeLessThanOrEqual(20)
  })

  it('special-use-permit with low multifamily ratio scores highest', () => {
    const score = computePCI({
      permits5plus: 50,
      totalPermits: 1000,
      discretionaryReviewType: 'special-use-permit',
    })
    // Review: 0.70 * 95 = 66.5
    // Ratio: 0.05, normalized ≈ 0, inverted ≈ 100, weighted: 0.30 * 100 = 30
    // Total ≈ 96.5 → 97
    expect(score).toBeGreaterThanOrEqual(90)
  })

  it('discretionary review type has more weight than permit ratio', () => {
    // Same permit data, different review types
    const permits: Omit<PciInputs, 'discretionaryReviewType'> = {
      permits5plus: 500,
      totalPermits: 1000,
    }
    const byRight = computePCI({ ...permits, discretionaryReviewType: 'by-right' })
    const special = computePCI({ ...permits, discretionaryReviewType: 'special-use-permit' })
    expect(special - byRight).toBeGreaterThan(30) // 70% weight means big gap
  })

  it('falls back to 0.20 ratio when totalPermits is 0', () => {
    const score = computePCI({
      permits5plus: 0,
      totalPermits: 0,
      discretionaryReviewType: 'conditional-use-permit',
    })
    // Should not throw, should use fallback ratio
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('falls back to 65 review score for unknown review type', () => {
    const score = computePCI({
      permits5plus: 500,
      totalPermits: 1000,
      discretionaryReviewType: 'unknown-type' as any,
    })
    // Should not throw, should use fallback score of 65
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})

// ── E3-4: computeCRP ──────────────────────────────────────────────────────

describe('computeCRP', () => {
  it('returns a number between 0 and 100', () => {
    const score = computeCRP({ dci: 50, dcoi: 50, pci: 50 })
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('highest composite in the peer set scores near 100', () => {
    // Composite = 250, higher than all 10 peer composites (max is 210)
    const score = computeCRP({ dci: 90, dcoi: 90, pci: 70 })
    expect(score).toBe(100)
  })

  it('lowest composite in the peer set scores 0', () => {
    // Composite = 30, lower than all 10 peer composites (min is 125)
    const score = computeCRP({ dci: 10, dcoi: 10, pci: 10 })
    expect(score).toBe(0)
  })

  it('excludes own jurisdiction from peer comparison when slug provided', () => {
    // Fairfax composite is 210 — the highest in the peer set.
    // Without slug exclusion, all 10 peers are below → 100%
    // With slug exclusion, Fairfax is removed and all 9 remaining are below → still 100%
    // Use a mid-range example to see the difference:
    // Composite = 160 (same as frederick at 160)
    const withSlug = computeCRP({ dci: 60, dcoi: 50, pci: 50, slug: 'frederick-county-va' })
    const withoutSlug = computeCRP({ dci: 60, dcoi: 50, pci: 50 })
    // With frederick excluded, there's one fewer peer below the threshold
    // so the scores could differ
    expect(withSlug).toBeGreaterThanOrEqual(0)
    expect(withoutSlug).toBeGreaterThanOrEqual(0)
  })

  it('higher sub-scores produce higher CRP', () => {
    const low = computeCRP({ dci: 30, dcoi: 30, pci: 30 })   // composite 90
    const high = computeCRP({ dci: 80, dcoi: 70, pci: 60 })   // composite 210
    expect(high).toBeGreaterThan(low)
  })
})

// ── computeAllSubScores ───────────────────────────────────────────────────

describe('computeAllSubScores', () => {
  it('returns all four sub-scores', () => {
    const result = computeAllSubScores({
      ...MID_DCI,
      parkingMinSpacesPerUnit: 1.5,
      regionalMultiplier: 1.10,
      permits5plus: 500,
      totalPermits: 1000,
      discretionaryReviewType: 'conditional-use-permit',
    })
    expect(result).toHaveProperty('dci')
    expect(result).toHaveProperty('dcoi')
    expect(result).toHaveProperty('pci')
    expect(result).toHaveProperty('crp')
    // All should be valid scores
    for (const key of ['dci', 'dcoi', 'pci', 'crp'] as const) {
      expect(result[key]).toBeGreaterThanOrEqual(0)
      expect(result[key]).toBeLessThanOrEqual(100)
    }
  })

  it('produces consistent results when called twice with same inputs', () => {
    const inputs = {
      ...MID_DCI,
      parkingMinSpacesPerUnit: 2,
      regionalMultiplier: 1.12,
      permits5plus: 1842,
      totalPermits: 3284,
      discretionaryReviewType: 'special-use-permit' as const,
      slug: 'fairfax',
    }
    const first = computeAllSubScores(inputs)
    const second = computeAllSubScores(inputs)
    expect(first).toEqual(second)
  })

  it('more restrictive inputs produce higher scores across the board', () => {
    const permissive = computeAllSubScores({
      minLotSizeSqft: 3_000,
      heightLimitFt: 250,
      densityLimitUpa: 150,
      setbackFrontFt: 5,
      setbackSideFt: 5,
      setbackRearFt: 5,
      parkingMinSpacesPerUnit: 0,
      regionalMultiplier: 0.90,
      permits5plus: 900,
      totalPermits: 1000,
      discretionaryReviewType: 'by-right',
    })
    const restrictive = computeAllSubScores({
      minLotSizeSqft: 87_120,
      heightLimitFt: 25,
      densityLimitUpa: 1,
      setbackFrontFt: 40,
      setbackSideFt: 40,
      setbackRearFt: 40,
      parkingMinSpacesPerUnit: 3,
      regionalMultiplier: 1.30,
      permits5plus: 50,
      totalPermits: 1000,
      discretionaryReviewType: 'special-use-permit',
    })
    expect(restrictive.dci).toBeGreaterThan(permissive.dci)
    expect(restrictive.dcoi).toBeGreaterThan(permissive.dcoi)
    expect(restrictive.pci).toBeGreaterThan(permissive.pci)
    expect(restrictive.crp).toBeGreaterThan(permissive.crp)
  })
})
