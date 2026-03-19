/**
 * E4-1 / E4-2 / E4-3 / E4-4: Feasibility Modeling
 *
 * Pure functions that compute development feasibility metrics from regulatory
 * field values and market data. Runs client-side for live What-If updates.
 */

import {
  BASE_COST_PER_UNIT,
  PARKING_STALL_COST,
  UNIT_SIZE_SQFT,
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
}

export type RentFeasibility = 'Feasible' | 'Marginal' | 'Infeasible'

export interface FeasibilityOutputs {
  /** E4-1: Maximum theoretical unit yield per acre. */
  maxUnitsPerAcre: number
  /** E4-2: Percentage of a 1-acre lot consumed by required parking. */
  parkingFootprintPct: number
  /** E4-3: Estimated all-in construction cost per unit (USD). */
  estimatedCostPerUnit: number
  /** E4-4: Monthly carrying cost assuming 240-month payback (USD/month). */
  monthlyCarryingCost: number
  /** E4-4: Whether local rents support construction cost. */
  rentFeasibility: RentFeasibility
  /** E4-4: HUD 2BR FMR used for rent feasibility comparison (USD/month). */
  fmr2br: number
}

/** Standard surface parking stall + drive aisle area (sq ft). */
const STALL_AREA_SQFT = 330

/** Sq ft in one acre. */
const SQFT_PER_ACRE = 43_560

/** Payback period in months for monthly carrying cost calculation. */
const PAYBACK_MONTHS = 240

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
 * E4-3: Estimated construction cost per unit.
 * Construction cost: national baseline × regional multiplier × unit size
 * Parking cost: spaces/unit × stall cost
 * Total = construction + parking
 */
export function computeEstimatedCostPerUnit(
  parkingMinSpacesPerUnit: number,
  regionalMultiplier: number,
): number {
  const constructionCost = (BASE_COST_PER_UNIT / UNIT_SIZE_SQFT) * UNIT_SIZE_SQFT * regionalMultiplier
  const parkingCost = parkingMinSpacesPerUnit * PARKING_STALL_COST
  return Math.round(constructionCost + parkingCost)
}

/**
 * E4-4: Monthly carrying cost (cost per unit ÷ payback period).
 * Simple 240-month (20-year) payback, no financing costs.
 * Represents the rent needed to break even on construction.
 */
export function computeMonthlyCarryingCost(costPerUnit: number): number {
  return Math.round(costPerUnit / PAYBACK_MONTHS)
}

/**
 * E4-4: Rent feasibility label.
 * Compares monthly carrying cost to HUD 2BR FMR:
 *   Feasible:   carrying cost < 100% of FMR (market supports construction)
 *   Marginal:   100–130% of FMR (financially tight)
 *   Infeasible: > 130% of FMR (market rents cannot support cost)
 */
export function computeRentFeasibility(
  monthlyCarryingCost: number,
  fmr2br: number,
): RentFeasibility {
  if (fmr2br <= 0) return 'Marginal'
  const ratio = monthlyCarryingCost / fmr2br
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
  const estimatedCostPerUnit = computeEstimatedCostPerUnit(
    inputs.parkingMinSpacesPerUnit,
    inputs.regionalMultiplier,
  )
  const monthlyCarryingCost = computeMonthlyCarryingCost(estimatedCostPerUnit)
  const rentFeasibility = computeRentFeasibility(monthlyCarryingCost, inputs.fmr2br)

  return {
    maxUnitsPerAcre,
    parkingFootprintPct,
    estimatedCostPerUnit,
    monthlyCarryingCost,
    rentFeasibility,
    fmr2br: inputs.fmr2br,
  }
}
