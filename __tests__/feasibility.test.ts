import {
  computeMaxUnitsPerAcre,
  computeParkingFootprintPct,
  computeEstimatedCostPerUnit,
  computeMonthlyCarryingCost,
  computeRentFeasibility,
  computeFeasibility,
} from '../lib/feasibility'
import { BASE_COST_PER_UNIT, PARKING_STALL_COST } from '../lib/scoringEngine'

// ── E4-1: computeMaxUnitsPerAcre ──────────────────────────────────────────

describe('computeMaxUnitsPerAcre', () => {
  it('returns the density limit rounded to one decimal', () => {
    expect(computeMaxUnitsPerAcre(12)).toBe(12)
    expect(computeMaxUnitsPerAcre(12.34)).toBe(12.3)
    expect(computeMaxUnitsPerAcre(12.35)).toBe(12.4)
  })

  it('handles zero density', () => {
    expect(computeMaxUnitsPerAcre(0)).toBe(0)
  })

  it('handles high density', () => {
    expect(computeMaxUnitsPerAcre(150)).toBe(150)
  })
})

// ── E4-2: computeParkingFootprintPct ──────────────────────────────────────

describe('computeParkingFootprintPct', () => {
  it('computes parking area as percentage of one acre', () => {
    // 10 units/acre * 2 spaces/unit = 20 stalls
    // 20 * 330 sqft = 6,600 sqft
    // 6,600 / 43,560 * 100 = 15.15%
    expect(computeParkingFootprintPct(10, 2)).toBe(15.2)
  })

  it('returns 0 when no parking required', () => {
    expect(computeParkingFootprintPct(50, 0)).toBe(0)
  })

  it('caps at 100% when parking exceeds lot size', () => {
    // 150 units/acre * 3 spaces/unit = 450 stalls
    // 450 * 330 = 148,500 sqft >> 43,560
    expect(computeParkingFootprintPct(150, 3)).toBe(100)
  })

  it('returns 0 when density is zero', () => {
    expect(computeParkingFootprintPct(0, 2)).toBe(0)
  })

  it('higher density increases parking footprint', () => {
    const low = computeParkingFootprintPct(5, 2)
    const high = computeParkingFootprintPct(30, 2)
    expect(high).toBeGreaterThan(low)
  })

  it('higher parking minimum increases footprint', () => {
    const low = computeParkingFootprintPct(20, 0.5)
    const high = computeParkingFootprintPct(20, 2.5)
    expect(high).toBeGreaterThan(low)
  })
})

// ── E4-3: computeEstimatedCostPerUnit ─────────────────────────────────────

describe('computeEstimatedCostPerUnit', () => {
  it('hand-computed: 0 parking, 1.0 multiplier = base cost', () => {
    // Construction: 180,000 * 1.0 = 180,000
    // Parking: 0
    // Total: 180,000
    expect(computeEstimatedCostPerUnit(0, 1.0)).toBe(180_000)
  })

  it('hand-computed: 2 spaces, 1.12 multiplier', () => {
    // Construction: 180,000 * 1.12 = 201,600
    // Parking: 2 * 25,000 = 50,000
    // Total: 251,600
    expect(computeEstimatedCostPerUnit(2, 1.12)).toBe(251_600)
  })

  it('parking adds $25K per space', () => {
    const base = computeEstimatedCostPerUnit(0, 1.0)
    const oneSpace = computeEstimatedCostPerUnit(1, 1.0)
    expect(oneSpace - base).toBe(PARKING_STALL_COST)
  })

  it('regional multiplier scales construction cost proportionally', () => {
    const low = computeEstimatedCostPerUnit(0, 1.0)
    const high = computeEstimatedCostPerUnit(0, 1.2)
    // 180,000 * 1.2 = 216,000
    expect(high).toBe(216_000)
    expect(high - low).toBe(BASE_COST_PER_UNIT * 0.2)
  })
})

// ── E4-4: computeMonthlyCarryingCost ──────────────────────────────────────

describe('computeMonthlyCarryingCost', () => {
  it('divides cost by 240 months (20-year payback)', () => {
    expect(computeMonthlyCarryingCost(240_000)).toBe(1_000)
    expect(computeMonthlyCarryingCost(180_000)).toBe(750)
  })

  it('rounds to nearest integer', () => {
    // 251,600 / 240 = 1,048.33
    expect(computeMonthlyCarryingCost(251_600)).toBe(1048)
  })

  it('handles zero cost', () => {
    expect(computeMonthlyCarryingCost(0)).toBe(0)
  })
})

// ── E4-4: computeRentFeasibility ──────────────────────────────────────────

describe('computeRentFeasibility', () => {
  it('Feasible when carrying cost < 100% of FMR', () => {
    expect(computeRentFeasibility(900, 1000)).toBe('Feasible')
    expect(computeRentFeasibility(999, 1000)).toBe('Feasible')
  })

  it('Marginal when carrying cost is 100-130% of FMR', () => {
    expect(computeRentFeasibility(1000, 1000)).toBe('Marginal')
    expect(computeRentFeasibility(1290, 1000)).toBe('Marginal')
  })

  it('Infeasible when carrying cost > 130% of FMR', () => {
    expect(computeRentFeasibility(1300, 1000)).toBe('Infeasible')
    expect(computeRentFeasibility(2000, 1000)).toBe('Infeasible')
  })

  it('returns Marginal when FMR is zero (prevents division by zero)', () => {
    expect(computeRentFeasibility(1000, 0)).toBe('Marginal')
  })

  it('returns Marginal when FMR is negative', () => {
    expect(computeRentFeasibility(1000, -100)).toBe('Marginal')
  })

  it('DC metro area example: $1,048 carrying vs $2,280 FMR = Feasible', () => {
    // Fairfax: cost ~$251,600 → $1,048/mo carrying vs $2,280 FMR
    expect(computeRentFeasibility(1048, 2280)).toBe('Feasible')
  })
})

// ── computeFeasibility (integration) ──────────────────────────────────────

describe('computeFeasibility', () => {
  it('returns all expected output fields', () => {
    const result = computeFeasibility({
      densityLimitUpa: 12,
      parkingMinSpacesPerUnit: 2,
      regionalMultiplier: 1.12,
      fmr2br: 2280,
    })
    expect(result).toHaveProperty('maxUnitsPerAcre')
    expect(result).toHaveProperty('parkingFootprintPct')
    expect(result).toHaveProperty('estimatedCostPerUnit')
    expect(result).toHaveProperty('monthlyCarryingCost')
    expect(result).toHaveProperty('rentFeasibility')
    expect(result).toHaveProperty('fmr2br', 2280)
  })

  it('produces internally consistent results', () => {
    const result = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 1.5,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    // Monthly carrying cost should equal cost per unit / 240
    expect(result.monthlyCarryingCost).toBe(Math.round(result.estimatedCostPerUnit / 240))
    // Max units should equal the density limit
    expect(result.maxUnitsPerAcre).toBe(20)
    // FMR passthrough
    expect(result.fmr2br).toBe(2280)
  })

  it('eliminating parking reduces cost and improves feasibility', () => {
    const withParking = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 2,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    const noParking = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 0,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    expect(noParking.estimatedCostPerUnit).toBeLessThan(withParking.estimatedCostPerUnit)
    expect(noParking.parkingFootprintPct).toBe(0)
    expect(noParking.monthlyCarryingCost).toBeLessThan(withParking.monthlyCarryingCost)
  })
})
