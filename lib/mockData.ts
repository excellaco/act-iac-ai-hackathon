import { computeRIS } from './scoring'
import { computeFeasibility } from './feasibility'
import { REGIONAL_MULTIPLIERS, DEFAULT_REGIONAL_MULTIPLIER } from './scoringEngine'
import type { ReviewType } from './scoringEngine'
import type { FeasibilityOutputs } from './feasibility'

/**
 * Safely parse a string to a number. Returns the fallback if the input is
 * null, undefined, empty, or not a valid number. Uses Number() rather than
 * parseFloat() for strict conversion — "12abc" returns the fallback, not 12.
 * Correctly handles '0' (returns 0, not the fallback).
 */
export function parseNumeric(value: string | null | undefined, fallback: number): number {
  if (value == null) return fallback
  const trimmed = value.trim()
  if (trimmed === '') return fallback
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? fallback : parsed
}

export type ConfidenceTier = 'High' | 'Medium' | 'Low';

export interface SubScoreDetail {
  score: number;
  confidence: ConfidenceTier;
  source: string;
}

/** Regulatory field values extracted from zoning ordinances + market data. */
export interface RegulationFields {
  minLotSizeSqft: number
  heightLimitFt: number
  densityLimitUpa: number
  parkingMinSpacesPerUnit: number
  setbackFrontFt: number
  setbackSideFt: number
  setbackRearFt: number
  discretionaryReviewType: ReviewType
  permits5plus: number
  totalPermits: number
  regionalMultiplier: number
  fmr2br: number
}

export interface JurisdictionData {
  id: string;
  name: string;
  state: string;
  slug: string;
  ris: number;
  subScores: {
    dci: SubScoreDetail;
    dcoi: SubScoreDetail;
    pci: SubScoreDetail;
    crp: SubScoreDetail;
  };
  fields: RegulationFields;
  feasibility: FeasibilityOutputs;
}

// ── Per-jurisdiction regulatory field baselines ───────────────────────────
// These represent multifamily-zone values extracted from each jurisdiction's
// zoning ordinance. Used as What-If slider baselines.
// Sources: Municode zoning codes (Fairfax, Arlington, Loudoun), extracted Mar 2025.

const JURISDICTION_FIELDS: Record<string, RegulationFields> = {
  // Real demo jurisdictions — slugs match db/seeds/jurisdictions.ts
  'fairfax': {
    minLotSizeSqft:          43_560,  // R-MF zone: 1 acre minimum
    heightLimitFt:           45,      // R-MF: 45 ft height limit
    densityLimitUpa:         12,      // R-MF: up to 12 units/acre
    parkingMinSpacesPerUnit: 2.0,     // Fairfax Zoning Ord. §8102.04
    setbackFrontFt:          25,
    setbackSideFt:           10,
    setbackRearFt:           25,
    discretionaryReviewType: 'special-use-permit',
    permits5plus:            1842,    // Census BPS 2023
    totalPermits:            3284,
    regionalMultiplier:      REGIONAL_MULTIPLIERS['fairfax'],
    fmr2br:                  2280,    // HUD FY2025 DC MSA
  },
  'arlington': {
    minLotSizeSqft:          3_630,   // Rosslyn-Ballston MU corridor: ~1/12 acre
    heightLimitFt:           125,     // Mixed-use zone: 125 ft
    densityLimitUpa:         72,      // Rosslyn-Ballston: up to 72 du/acre
    parkingMinSpacesPerUnit: 0.5,     // Transit-area parking reduction (§14.3.4)
    setbackFrontFt:          5,
    setbackSideFt:           5,
    setbackRearFt:           10,
    discretionaryReviewType: 'by-right',
    permits5plus:            892,     // Census BPS 2023
    totalPermits:            987,
    regionalMultiplier:      REGIONAL_MULTIPLIERS['arlington'],
    fmr2br:                  2280,
  },
  'loudoun': {
    minLotSizeSqft:          57_000,  // ~1.3 acres (R-E residential estate zone)
    heightLimitFt:           50,      // PD-H multifamily: 50 ft
    densityLimitUpa:         6,       // PD-H2: 6 du/acre
    parkingMinSpacesPerUnit: 2.0,
    setbackFrontFt:          30,
    setbackSideFt:           15,
    setbackRearFt:           35,
    discretionaryReviewType: 'special-use-permit',
    permits5plus:            1203,    // Census BPS 2023
    totalPermits:            2891,
    regionalMultiplier:      REGIONAL_MULTIPLIERS['loudoun'],
    fmr2br:                  2280,
  },
}

/** Generic fields used for synthetic/unknown jurisdictions. */
const DEFAULT_FIELDS: RegulationFields = {
  minLotSizeSqft:          20_000,
  heightLimitFt:           50,
  densityLimitUpa:         20,
  parkingMinSpacesPerUnit: 1.5,
  setbackFrontFt:          20,
  setbackSideFt:           10,
  setbackRearFt:           20,
  discretionaryReviewType: 'conditional-use-permit',
  permits5plus:            500,
  totalPermits:            1000,
  regionalMultiplier:      DEFAULT_REGIONAL_MULTIPLIER,
  fmr2br:                  1800,
}

// ── Source attribution ─────────────────────────────────────────────────────

const REAL_SOURCES = {
  dci:  'Municode zoning code, extracted Mar 2025',
  dcoi: 'BLS OES + BEA Regional Price Parities, 2024',
  pci:  'U.S. Census Building Permits Survey, 2023',
  crp:  'Peer comparison set (3 real + 7 illustrative jurisdictions)',
}

const SYNTHETIC_SOURCE = 'Illustrative data — not from official sources'

// ── Static mock data (used before DB is populated) ─────────────────────────

function buildJurisdiction(
  id: string,
  name: string,
  state: string,
  slug: string,
  risScores: { dci: number; dcoi: number; pci: number; crp: number },
  isSynthetic = false,
): JurisdictionData {
  const sources = isSynthetic
    ? { dci: SYNTHETIC_SOURCE, dcoi: SYNTHETIC_SOURCE, pci: SYNTHETIC_SOURCE, crp: SYNTHETIC_SOURCE }
    : REAL_SOURCES

  const fields = JURISDICTION_FIELDS[slug] ?? DEFAULT_FIELDS
  const feasibility = computeFeasibility({
    densityLimitUpa:         fields.densityLimitUpa,
    parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
    regionalMultiplier:      fields.regionalMultiplier,
    fmr2br:                  fields.fmr2br,
  })

  return {
    id,
    name,
    state,
    slug,
    ris: computeRIS(risScores),
    subScores: {
      dci:  { score: risScores.dci,  confidence: 'High', source: sources.dci },
      dcoi: { score: risScores.dcoi, confidence: 'High', source: sources.dcoi },
      pci:  { score: risScores.pci,  confidence: 'Medium', source: sources.pci },
      crp:  { score: risScores.crp,  confidence: 'High', source: sources.crp },
    },
    fields,
    feasibility,
  }
}

export const JURISDICTIONS: JurisdictionData[] = [
  buildJurisdiction('fairfax-uuid',   'Fairfax County',   'VA', 'fairfax',   { dci: 75, dcoi: 70, pci: 65, crp: 80 }),
  buildJurisdiction('arlington-uuid', 'Arlington County', 'VA', 'arlington', { dci: 40, dcoi: 50, pci: 35, crp: 45 }),
  buildJurisdiction('loudoun-uuid',   'Loudoun County',   'VA', 'loudoun',   { dci: 80, dcoi: 55, pci: 60, crp: 60 }),
]

/**
 * Converts a /api/jurisdictions/[id]/score response into the JurisdictionData
 * shape expected by ScorePanel.
 */
export function scoreResponseToJurisdictionData(
  apiResponse: {
    jurisdiction: { id: string; name: string; state: string; slug: string; dataType: string }
    score: { risComposite: string; dci: string; dcoi: string; pci: string; crp: string } | null
    extractedFields?: Array<{ fieldName: string; fieldValue: string | null; unit: string | null; confidence: string; sourceDocument: string | null }>
    feasibility?: {
      maxUnitsPerAcre: string | null
      parkingFootprintPct: string | null
      estimatedCostPerUnit: string | null
      fmr2br: string | null
    } | null
    marketData?: {
      fmr2br: string | null
      permits5plus: number | null
      totalPermits: number | null
    } | null
  }
): JurisdictionData | null {
  const { jurisdiction, score } = apiResponse
  if (!score) return null

  const isSynthetic = jurisdiction.dataType === 'synthetic'
  const sources = isSynthetic
    ? { dci: SYNTHETIC_SOURCE, dcoi: SYNTHETIC_SOURCE, pci: SYNTHETIC_SOURCE, crp: SYNTHETIC_SOURCE }
    : REAL_SOURCES

  // Extract field values from API response, falling back to known defaults
  const slug = jurisdiction.slug
  const baseFields = JURISDICTION_FIELDS[slug] ?? DEFAULT_FIELDS

  // Merge any extracted fields from the DB — skip NaN values from bad data
  const fieldMap: Record<string, number> = {}
  for (const f of apiResponse.extractedFields ?? []) {
    if (f.fieldValue != null) {
      const parsed = parseFloat(f.fieldValue)
      if (!isNaN(parsed)) fieldMap[f.fieldName] = parsed
    }
  }

  const fmr2br = apiResponse.marketData?.fmr2br != null
    ? parseNumeric(apiResponse.marketData.fmr2br, baseFields.fmr2br)
    : baseFields.fmr2br

  const fields: RegulationFields = {
    minLotSizeSqft:          fieldMap['min_lot_size_sqft']           ?? baseFields.minLotSizeSqft,
    heightLimitFt:           fieldMap['height_limit_ft']             ?? baseFields.heightLimitFt,
    densityLimitUpa:         fieldMap['density_limit_units_per_acre'] ?? baseFields.densityLimitUpa,
    parkingMinSpacesPerUnit: fieldMap['parking_min_spaces_per_unit'] ?? baseFields.parkingMinSpacesPerUnit,
    setbackFrontFt:          fieldMap['setback_front_ft']            ?? baseFields.setbackFrontFt,
    setbackSideFt:           fieldMap['setback_side_ft']             ?? baseFields.setbackSideFt,
    setbackRearFt:           fieldMap['setback_rear_ft']             ?? baseFields.setbackRearFt,
    discretionaryReviewType: baseFields.discretionaryReviewType,  // text field, not numeric
    permits5plus:            apiResponse.marketData?.permits5plus    ?? baseFields.permits5plus,
    totalPermits:            apiResponse.marketData?.totalPermits    ?? baseFields.totalPermits,
    regionalMultiplier:      REGIONAL_MULTIPLIERS[slug] ?? DEFAULT_REGIONAL_MULTIPLIER,
    fmr2br,
  }

  // Use stored feasibility if the core value (estimatedCostPerUnit) is present
  // and parsable. If the stored value is present but unparsable (e.g., "N/A"),
  // fall through to recompute from valid field data rather than producing bogus
  // results like monthlyCarryingCost=0 → "Feasible".
  let feasibility: FeasibilityOutputs
  const storedCost = apiResponse.feasibility?.estimatedCostPerUnit != null
    ? Number(apiResponse.feasibility.estimatedCostPerUnit.trim())
    : NaN
  if (!Number.isNaN(storedCost)) {
    const f = apiResponse.feasibility!
    const estimatedCostPerUnit = storedCost
    const monthlyCarryingCost = Math.round(estimatedCostPerUnit / 240)
    const fmrVal = f.fmr2br != null ? parseNumeric(f.fmr2br, fmr2br) : fmr2br
    feasibility = {
      maxUnitsPerAcre:      parseNumeric(f.maxUnitsPerAcre, fields.densityLimitUpa),
      parkingFootprintPct:  parseNumeric(f.parkingFootprintPct, 0),
      estimatedCostPerUnit,
      monthlyCarryingCost,
      rentFeasibility:      monthlyCarryingCost < fmrVal ? 'Feasible' : monthlyCarryingCost < fmrVal * 1.3 ? 'Marginal' : 'Infeasible',
      fmr2br:               fmrVal,
    }
  } else {
    feasibility = computeFeasibility({
      densityLimitUpa:         fields.densityLimitUpa,
      parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
      regionalMultiplier:      fields.regionalMultiplier,
      fmr2br:                  fields.fmr2br,
    })
  }

  return {
    id: jurisdiction.id,
    name: jurisdiction.name,
    state: jurisdiction.state,
    slug: jurisdiction.slug,
    ris: Math.round(parseNumeric(score.risComposite, 0)),
    subScores: {
      dci:  { score: Math.round(parseNumeric(score.dci, 0)),  confidence: 'High', source: sources.dci },
      dcoi: { score: Math.round(parseNumeric(score.dcoi, 0)), confidence: 'High', source: sources.dcoi },
      pci:  { score: Math.round(parseNumeric(score.pci, 0)),  confidence: 'Medium', source: sources.pci },
      crp:  { score: Math.round(parseNumeric(score.crp, 0)),  confidence: 'High', source: sources.crp },
    },
    fields,
    feasibility,
  }
}
