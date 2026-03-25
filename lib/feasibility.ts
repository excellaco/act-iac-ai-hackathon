/**
 * E4-1 / E4-2 / E4-3 / E4-4: Feasibility Modeling
 *
 * Pure functions that compute development feasibility metrics from regulatory
 * field values and market data. Runs client-side for live What-If updates.
 */

import {
  GARDEN_COST_PER_UNIT,
  MIDRISE_COST_PER_UNIT,
  HIGHRISE_COST_PER_UNIT,
  SOFT_COST_PCT,
  PARKING_STALL_COST,
  ANNUAL_INTEREST_RATE,
  LOAN_TERM_MONTHS,
  LTV_RATIO,
  DSCR_MIN,
  OPERATING_EXPENSE_RATIO,
} from './scoringEngine'

export interface FeasibilityInputs {
  /** Maximum allowed dwelling units per acre (from density limit). */
  densityLimitUpa: number
  /** Parking spaces required per unit. */
  parkingMinSpacesPerUnit: number
  /** Regional construction cost multiplier (BEA RPP). */
  regionalMultiplier: number
  /** HUD Fair Market Rent — 2-bedroom ($/month). */
  fmr2br: number
  /** Height limit from zoning ordinance — used to infer building type and cost. */
  heightLimitFt: number
}

/** Building type inferred from height limit. */
export type BuildingType = 'garden' | 'midrise' | 'highrise'

export type RentFeasibility = 'Feasible' | 'Marginal' | 'Infeasible'

export interface FeasibilityOutputs {
  /** E4-1: Maximum theoretical unit yield per acre. */
  maxUnitsPerAcre: number
  /** E4-2: Percentage of a 1-acre lot consumed by required parking. */
  parkingFootprintPct: number
  /** E4-3: Estimated all-in construction cost per unit (hard + soft + parking). */
  estimatedCostPerUnit: number
  /** Building type inferred from heightLimitFt — shown in UI for transparency. */
  buildingType: BuildingType
  /** E4-4: DSCR-based monthly mortgage payment per unit (USD/month). */
  monthlyDebtService: number
  /** E4-4: Minimum gross rent per month needed to satisfy DSCR + operating expenses. */
  requiredRent: number
  /** E4-4: Whether local rents support construction cost. */
  rentFeasibility: RentFeasibility
  /** E4-4: HUD 2BR FMR used for rent feasibility comparison (USD/month). */
  fmr2br: number
}

/** Standard surface parking stall + drive aisle area (sq ft). */
const STALL_AREA_SQFT = 330

/** Sq ft in one acre. */
const SQFT_PER_ACRE = 43_560

/**
 * E4-1: Maximum theoretical unit yield per acre.
 * Returns the density limit (units/acre) directly — this is the regulatory ceiling.
 */
export function computeMaxUnitsPerAcre(densityLimitUpa: number): number {
  return Math.round(densityLimitUpa * 10) / 10
}

/**
 * E4-2: Parking footprint as a percentage of a 1-acre lot.
 * Computes how much of a 1-acre lot is consumed by surface parking
 * given the density limit (units) and parking minimum (stalls/unit).
 * Capped at 100%.
 */
export function computeParkingFootprintPct(
  densityLimitUpa: number,
  parkingMinSpacesPerUnit: number,
): number {
  const totalStalls = densityLimitUpa * parkingMinSpacesPerUnit
  const parkingAreaSqft = totalStalls * STALL_AREA_SQFT
  const pct = (parkingAreaSqft / SQFT_PER_ACRE) * 100
  return Math.min(Math.round(pct * 10) / 10, 100)
}

/**
 * Infer building type from height limit.
 * Thresholds: ≤45 ft = garden (Type V wood-frame, ≤4 stories)
 *             46–90 ft = midrise (Type III/V podium, 5–7 stories)
 *             >90 ft   = highrise (Type I/II concrete, 8+ stories)
 */
export function inferBuildingType(heightLimitFt: number): BuildingType {
  if (heightLimitFt <= 45) return 'garden'
  if (heightLimitFt <= 90) return 'midrise'
  return 'highrise'
}

/**
 * Returns the baseline hard cost per unit for a given building type.
 * Sources: NAHB Construction Cost Survey 2024, RSMeans Multifamily Cost Data 2024.
 */
export function buildingTypeCostPerUnit(type: BuildingType): number {
  if (type === 'garden')   return GARDEN_COST_PER_UNIT
  if (type === 'midrise')  return MIDRISE_COST_PER_UNIT
  return HIGHRISE_COST_PER_UNIT
}

/**
 * E4-3: Estimated total development cost per unit.
 * TDC = (hardCost × regionalMultiplier × (1 + SOFT_COST_PCT)) + (parkingSpaces × PARKING_STALL_COST)
 */
export function computeEstimatedCostPerUnit(
  buildingType: BuildingType,
  parkingMinSpacesPerUnit: number,
  regionalMultiplier: number,
): number {
  const hardCost = buildingTypeCostPerUnit(buildingType)
  const totalHardAndSoft = hardCost * regionalMultiplier * (1 + SOFT_COST_PCT)
  const parkingCost = parkingMinSpacesPerUnit * PARKING_STALL_COST
  return Math.round(totalHardAndSoft + parkingCost)
}

/**
 * E4-4: Monthly debt service per unit using PMT formula.
 * Loan = costPerUnit × LTV_RATIO
 * PMT = loan × r / (1 - (1+r)^-n)
 * where r = monthly interest rate, n = loan term in months.
 */
export function computeMonthlyDebtService(costPerUnit: number): number {
  const loan = costPerUnit * LTV_RATIO
  const r = ANNUAL_INTEREST_RATE / 12
  const n = LOAN_TERM_MONTHS
  const pmt = loan * r / (1 - Math.pow(1 + r, -n))
  return Math.round(pmt)
}

/**
 * E4-4: Required gross rent per month.
 * = debtService × DSCR_MIN / (1 - OPERATING_EXPENSE_RATIO)
 * This is the minimum gross rent needed to satisfy the lender's debt service
 * coverage ratio after paying operating expenses.
 */
export function computeRequiredRent(monthlyDebtService: number): number {
  return Math.round((monthlyDebtService * DSCR_MIN) / (1 - OPERATING_EXPENSE_RATIO))
}

/**
 * E4-4: Rent feasibility label.
 * Compares required rent to HUD 2BR FMR:
 *   Feasible:   requiredRent < 100% of FMR (market supports construction)
 *   Marginal:   100–130% of FMR (financially tight)
 *   Infeasible: > 130% of FMR (market rents cannot support cost)
 */
export function computeRentFeasibility(
  requiredRent: number,
  fmr2br: number,
): RentFeasibility {
  if (fmr2br <= 0) return 'Marginal'
  const ratio = requiredRent / fmr2br
  if (ratio < 1.0) return 'Feasible'
  if (ratio < 1.3) return 'Marginal'
  return 'Infeasible'
}

/** Compute all feasibility outputs from a single inputs object. */
export function computeFeasibility(inputs: FeasibilityInputs): FeasibilityOutputs {
  const maxUnitsPerAcre = computeMaxUnitsPerAcre(inputs.densityLimitUpa)
  const parkingFootprintPct = computeParkingFootprintPct(
    inputs.densityLimitUpa,
    inputs.parkingMinSpacesPerUnit,
  )
  const buildingType = inferBuildingType(inputs.heightLimitFt)
  const estimatedCostPerUnit = computeEstimatedCostPerUnit(
    buildingType,
    inputs.parkingMinSpacesPerUnit,
    inputs.regionalMultiplier,
  )
  const monthlyDebtService = computeMonthlyDebtService(estimatedCostPerUnit)
  const requiredRent = computeRequiredRent(monthlyDebtService)
  const rentFeasibility = computeRentFeasibility(requiredRent, inputs.fmr2br)

  return {
    maxUnitsPerAcre,
    parkingFootprintPct,
    estimatedCostPerUnit,
    buildingType,
    monthlyDebtService,
    requiredRent,
    rentFeasibility,
    fmr2br: inputs.fmr2br,
  }
}
