import {
  computeMaxUnitsPerAcre,
  computeParkingFootprintPct,
  computeEstimatedCostPerUnit,
  computeMonthlyDebtService,
  computeRequiredRent,
  computeRentFeasibility,
  computeFeasibility,
  inferBuildingType,
  buildingTypeCostPerUnit,
} from '../lib/feasibility'
import {
  PARKING_STALL_COST,
  GARDEN_COST_PER_UNIT,
  MIDRISE_COST_PER_UNIT,
  HIGHRISE_COST_PER_UNIT,
  LTV_RATIO,
  ANNUAL_INTEREST_RATE,
  LOAN_TERM_MONTHS,
  DSCR_MIN,
  OPERATING_EXPENSE_RATIO,
  SOFT_COST_PCT,
} from '../lib/scoringEngine'

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

// ── inferBuildingType ─────────────────────────────────────────────────────

describe('inferBuildingType', () => {
  it('returns garden for heights up to 45 ft', () => {
    expect(inferBuildingType(35)).toBe('garden')
    expect(inferBuildingType(45)).toBe('garden')
  })

  it('returns midrise for heights 46–90 ft', () => {
    expect(inferBuildingType(46)).toBe('midrise')
    expect(inferBuildingType(70)).toBe('midrise')
    expect(inferBuildingType(90)).toBe('midrise')
  })

  it('returns highrise for heights above 90 ft', () => {
    expect(inferBuildingType(91)).toBe('highrise')
    expect(inferBuildingType(125)).toBe('highrise')
    expect(inferBuildingType(250)).toBe('highrise')
  })

  it('crossing from 45 to 46 ft changes type from garden to midrise', () => {
    expect(inferBuildingType(45)).toBe('garden')
    expect(inferBuildingType(46)).toBe('midrise')
  })
})

// ── buildingTypeCostPerUnit ───────────────────────────────────────────────

describe('buildingTypeCostPerUnit', () => {
  it('returns GARDEN_COST_PER_UNIT for garden', () => {
    expect(buildingTypeCostPerUnit('garden')).toBe(GARDEN_COST_PER_UNIT)
  })

  it('returns MIDRISE_COST_PER_UNIT for midrise', () => {
    expect(buildingTypeCostPerUnit('midrise')).toBe(MIDRISE_COST_PER_UNIT)
  })

  it('returns HIGHRISE_COST_PER_UNIT for highrise', () => {
    expect(buildingTypeCostPerUnit('highrise')).toBe(HIGHRISE_COST_PER_UNIT)
  })
})

// ── E4-3: computeEstimatedCostPerUnit ─────────────────────────────────────

describe('computeEstimatedCostPerUnit', () => {
  it('hand-computed: garden, 0 parking, 1.0 multiplier', () => {
    // Hard+soft: 195,000 * 1.0 * 1.22 = 237,900
    // Parking: 0
    // Total: 237,900
    expect(computeEstimatedCostPerUnit('garden', 0, 1.0)).toBe(237_900)
  })

  it('hand-computed: midrise, 2 spaces, 1.12 multiplier', () => {
    // Hard+soft: 270,000 * 1.12 * 1.22 = 368,928
    // Parking: 2 * 30,000 = 60,000
    // Total: 428,928
    expect(computeEstimatedCostPerUnit('midrise', 2, 1.12)).toBe(428_928)
  })

  it('parking adds PARKING_STALL_COST per space', () => {
    const base = computeEstimatedCostPerUnit('garden', 0, 1.0)
    const oneSpace = computeEstimatedCostPerUnit('garden', 1, 1.0)
    expect(oneSpace - base).toBe(PARKING_STALL_COST)
  })

  it('highrise costs more than garden at same multiplier and parking', () => {
    const garden = computeEstimatedCostPerUnit('garden', 0, 1.0)
    const highrise = computeEstimatedCostPerUnit('highrise', 0, 1.0)
    expect(highrise).toBeGreaterThan(garden)
  })

  it('regional multiplier scales construction cost proportionally', () => {
    const low = computeEstimatedCostPerUnit('midrise', 0, 1.0)
    const high = computeEstimatedCostPerUnit('midrise', 0, 1.2)
    // 270,000 * 1.22 * (1.2 - 1.0) = 65,880 increase
    expect(high - low).toBe(Math.round(MIDRISE_COST_PER_UNIT * (1 + SOFT_COST_PCT) * 0.2))
  })
})

// ── computeMonthlyDebtService ─────────────────────────────────────────────

describe('computeMonthlyDebtService', () => {
  it('uses PMT formula: loan × r / (1 - (1+r)^-n)', () => {
    const cost = 300_000
    const loan = cost * LTV_RATIO
    const r = ANNUAL_INTEREST_RATE / 12
    const n = LOAN_TERM_MONTHS
    const expected = Math.round(loan * r / (1 - Math.pow(1 + r, -n)))
    expect(computeMonthlyDebtService(cost)).toBe(expected)
  })

  it('higher cost yields higher debt service', () => {
    expect(computeMonthlyDebtService(400_000)).toBeGreaterThan(computeMonthlyDebtService(300_000))
  })

  it('zero cost yields zero debt service', () => {
    expect(computeMonthlyDebtService(0)).toBe(0)
  })
})

// ── computeRequiredRent ───────────────────────────────────────────────────

describe('computeRequiredRent', () => {
  it('applies DSCR_MIN / (1 - OPERATING_EXPENSE_RATIO)', () => {
    const ds = 1000
    const expected = Math.round((ds * DSCR_MIN) / (1 - OPERATING_EXPENSE_RATIO))
    expect(computeRequiredRent(ds)).toBe(expected)
  })

  it('required rent is higher than monthly debt service', () => {
    const ds = 1500
    expect(computeRequiredRent(ds)).toBeGreaterThan(ds)
  })

  it('zero debt service yields zero required rent', () => {
    expect(computeRequiredRent(0)).toBe(0)
  })
})

// ── E4-4: computeRentFeasibility ──────────────────────────────────────────

describe('computeRentFeasibility', () => {
  it('Feasible when required rent < 100% of FMR', () => {
    expect(computeRentFeasibility(900, 1000)).toBe('Feasible')
    expect(computeRentFeasibility(999, 1000)).toBe('Feasible')
  })

  it('Marginal when required rent is 100-130% of FMR', () => {
    expect(computeRentFeasibility(1000, 1000)).toBe('Marginal')
    expect(computeRentFeasibility(1290, 1000)).toBe('Marginal')
  })

  it('Infeasible when required rent > 130% of FMR', () => {
    expect(computeRentFeasibility(1300, 1000)).toBe('Infeasible')
    expect(computeRentFeasibility(2000, 1000)).toBe('Infeasible')
  })

  it('returns Marginal when FMR is zero (prevents division by zero)', () => {
    expect(computeRentFeasibility(1000, 0)).toBe('Marginal')
  })

  it('returns Marginal when FMR is negative', () => {
    expect(computeRentFeasibility(1000, -100)).toBe('Marginal')
  })
})

// ── computeFeasibility (integration) ──────────────────────────────────────

describe('computeFeasibility', () => {
  it('returns all expected output fields', () => {
    const result = computeFeasibility({
      densityLimitUpa: 12,
      parkingMinSpacesPerUnit: 2,
      heightLimitFt: 45,
      regionalMultiplier: 1.12,
      fmr2br: 2280,
    })
    expect(result).toHaveProperty('maxUnitsPerAcre')
    expect(result).toHaveProperty('parkingFootprintPct')
    expect(result).toHaveProperty('estimatedCostPerUnit')
    expect(result).toHaveProperty('buildingType')
    expect(result).toHaveProperty('monthlyDebtService')
    expect(result).toHaveProperty('requiredRent')
    expect(result).toHaveProperty('rentFeasibility')
    expect(result).toHaveProperty('fmr2br', 2280)
  })

  it('produces internally consistent results', () => {
    const result = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 1.5,
      heightLimitFt: 60,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    // Building type should be midrise for 60ft
    expect(result.buildingType).toBe('midrise')
    // Required rent = DSCR-derived from monthly debt service
    const expectedDebtService = computeMonthlyDebtService(result.estimatedCostPerUnit)
    expect(result.monthlyDebtService).toBe(expectedDebtService)
    expect(result.requiredRent).toBe(computeRequiredRent(expectedDebtService))
    // Max units should equal the density limit
    expect(result.maxUnitsPerAcre).toBe(20)
    // FMR passthrough
    expect(result.fmr2br).toBe(2280)
  })

  it('eliminating parking reduces cost and improves feasibility', () => {
    const withParking = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 2,
      heightLimitFt: 60,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    const noParking = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 0,
      heightLimitFt: 60,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })
    expect(noParking.estimatedCostPerUnit).toBeLessThan(withParking.estimatedCostPerUnit)
    expect(noParking.parkingFootprintPct).toBe(0)
    expect(noParking.monthlyDebtService).toBeLessThan(withParking.monthlyDebtService)
    expect(noParking.requiredRent).toBeLessThan(withParking.requiredRent)
  })

  it('raising height above 45ft threshold increases cost (garden → midrise)', () => {
    const garden = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 1.5,
      heightLimitFt: 45,
      regionalMultiplier: 1.0,
      fmr2br: 2500,
    })
    const midrise = computeFeasibility({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 1.5,
      heightLimitFt: 46,
      regionalMultiplier: 1.0,
      fmr2br: 2500,
    })
    expect(garden.buildingType).toBe('garden')
    expect(midrise.buildingType).toBe('midrise')
    expect(midrise.estimatedCostPerUnit).toBeGreaterThan(garden.estimatedCostPerUnit)
  })

  it('Fairfax scenario: garden-style at 45ft is Marginal against 2280 FMR', () => {
    const result = computeFeasibility({
      densityLimitUpa: 12,
      parkingMinSpacesPerUnit: 2.0,
      heightLimitFt: 45,
      regionalMultiplier: 1.12,
      fmr2br: 2280,
    })
    expect(result.buildingType).toBe('garden')
    expect(result.rentFeasibility).toBe('Marginal')
  })
})
