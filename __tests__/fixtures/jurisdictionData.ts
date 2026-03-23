/**
 * Shared test fixtures for JurisdictionData used by component tests.
 * Based on the Fairfax and Arlington mock data from lib/mockData.ts.
 *
 * All fixtures are deep-frozen to catch accidental prop mutation in tests.
 * If a component writes to a frozen prop, the test throws immediately rather
 * than silently passing with corrupted data.
 */
import type { JurisdictionData, ZoneScore } from '../../lib/mockData'
import type { FeasibilityOutputs } from '../../lib/feasibility'

function deepFreeze<T extends object>(obj: T): T {
  Object.freeze(obj)
  for (const value of Object.values(obj)) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value)
    }
  }
  return obj
}

const fairfaxFeasibility: FeasibilityOutputs = {
  maxUnitsPerAcre: 12,
  parkingFootprintPct: 18.2,
  estimatedCostPerUnit: 251_600,
  monthlyCarryingCost: 1048,
  rentFeasibility: 'Feasible',
  fmr2br: 2280,
}

const arlingtonFeasibility: FeasibilityOutputs = {
  maxUnitsPerAcre: 72,
  parkingFootprintPct: 27.3,
  estimatedCostPerUnit: 219_500,
  monthlyCarryingCost: 915,
  rentFeasibility: 'Feasible',
  fmr2br: 2280,
}

export const FAIRFAX: JurisdictionData = deepFreeze({
  id: 'uuid-fairfax',
  name: 'Fairfax County',
  state: 'VA',
  slug: 'fairfax',
  ris: 73,
  subScores: {
    dci:  { score: 75, confidence: 'High',   source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 70, confidence: 'High',   source: 'BLS OES + BEA RPP, 2024' },
    pci:  { score: 65, confidence: 'Medium', source: 'Census BPS 2023 + zoning text' },
    crp:  { score: 80, confidence: 'High',   source: 'Peer comparison (10 jurisdictions)' },
  },
  fields: {
    minLotSizeSqft: 43_560,
    heightLimitFt: 45,
    densityLimitUpa: 12,
    parkingMinSpacesPerUnit: 2.0,
    setbackFrontFt: 25,
    setbackSideFt: 10,
    setbackRearFt: 25,
    discretionaryReviewType: 'special-use-permit',
    permits5plus: 1842,
    totalPermits: 3284,
    regionalMultiplier: 1.12,
    fmr2br: 2280,
  },
  feasibility: fairfaxFeasibility,
  citations: {},
  zoneScores: [],
})

export const ARLINGTON: JurisdictionData = deepFreeze({
  id: 'uuid-arlington',
  name: 'Arlington County',
  state: 'VA',
  slug: 'arlington',
  ris: 43,
  subScores: {
    dci:  { score: 40, confidence: 'High',   source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 50, confidence: 'High',   source: 'BLS OES + BEA RPP, 2024' },
    pci:  { score: 35, confidence: 'Medium', source: 'Census BPS 2023 + zoning text' },
    crp:  { score: 45, confidence: 'High',   source: 'Peer comparison (10 jurisdictions)' },
  },
  fields: {
    minLotSizeSqft: 3_630,
    heightLimitFt: 125,
    densityLimitUpa: 72,
    parkingMinSpacesPerUnit: 0.5,
    setbackFrontFt: 5,
    setbackSideFt: 5,
    setbackRearFt: 10,
    discretionaryReviewType: 'by-right',
    permits5plus: 892,
    totalPermits: 987,
    regionalMultiplier: 1.15,
    fmr2br: 2280,
  },
  feasibility: arlingtonFeasibility,
  citations: {},
  zoneScores: [],
})

/** Zone scores used in tests that exercise the ZoneSelector (E2-155). */
export const ARLINGTON_ZONE_SCORES: ZoneScore[] = [
  {
    zoneCode: 'RA6-15',
    zoneName: 'Residential Apartment',
    multifamilyClassification: 'primary',
    dci: 40, dcoi: 50, pci: 35, crp: 45, risComposite: 43,
    fields: { densityLimitUpa: 72, heightLimitFt: 125, parkingMinSpacesPerUnit: 0.5 },
    citations: {},
    feasibility: { maxUnitsPerAcre: 72, parkingFootprintPct: 27.3, estimatedCostPerUnit: 219_500, monthlyCarryingCost: 915, rentFeasibility: 'Feasible', fmr2br: 2280 },
  },
  {
    zoneCode: 'R-10',
    zoneName: 'Single Family',
    multifamilyClassification: 'limited',
    dci: 80, dcoi: 60, pci: 70, crp: 65, risComposite: 72,
    fields: { densityLimitUpa: 4, heightLimitFt: 35, parkingMinSpacesPerUnit: 2.0 },
    citations: {},
    feasibility: null,
  },
]

/** Arlington with zone scores populated (for ZoneSelector tests). */
export const ARLINGTON_WITH_ZONES: JurisdictionData = deepFreeze({
  ...ARLINGTON,
  zoneScores: ARLINGTON_ZONE_SCORES,
})

export const LOUDOUN: JurisdictionData = deepFreeze({
  id: 'uuid-loudoun',
  name: 'Loudoun County',
  state: 'VA',
  slug: 'loudoun',
  ris: 65,
  subScores: {
    dci:  { score: 80, confidence: 'High',   source: 'Municode zoning code, extracted Mar 2025' },
    dcoi: { score: 55, confidence: 'High',   source: 'BLS OES + BEA RPP, 2024' },
    pci:  { score: 60, confidence: 'Medium', source: 'Census BPS 2023 + zoning text' },
    crp:  { score: 60, confidence: 'High',   source: 'Peer comparison (10 jurisdictions)' },
  },
  fields: {
    minLotSizeSqft: 87_120,
    heightLimitFt: 35,
    densityLimitUpa: 6,
    parkingMinSpacesPerUnit: 2.0,
    setbackFrontFt: 30,
    setbackSideFt: 15,
    setbackRearFt: 25,
    discretionaryReviewType: 'conditional-use-permit',
    permits5plus: 1203,
    totalPermits: 2891,
    regionalMultiplier: 1.08,
    fmr2br: 2280,
  },
  feasibility: {
    maxUnitsPerAcre: 6,
    parkingFootprintPct: 9.1,
    estimatedCostPerUnit: 244_400,
    monthlyCarryingCost: 1018,
    rentFeasibility: 'Feasible',
    fmr2br: 2280,
  },
  citations: {},
  zoneScores: [],
})
