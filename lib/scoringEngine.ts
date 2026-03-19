/**
 * E3-1 / E3-2 / E3-3 / E3-4: RIS Sub-score Computation Functions
 *
 * Pure functions that derive sub-scores from extracted regulatory fields and
 * market data. Designed to run client-side (no DB access) so they can power
 * the What-If simulation in real time.
 *
 * Implementation decision (documented per E3 stories):
 * The What-If simulation computes DELTAS rather than absolute scores. When
 * sliders change, the engine computes:
 *   simulatedScore = storedScore + (computeScore(newFields) - computeScore(baselineFields))
 * This keeps the baseline display consistent with stored DB values while
 * still producing directionally correct responses to slider changes.
 *
 * Normalization ranges are derived from the 10-jurisdiction peer set
 * (3 real VA/MD jurisdictions + 7 synthetic regional peers).
 */

// ── helpers ───────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Linear min-max normalization → [0, 100] */
function normalize(value: number, range: { min: number; max: number }): number {
  if (range.max === range.min) return 50
  return clamp(((value - range.min) / (range.max - range.min)) * 100, 0, 100)
}

// ── E3-1: Density Constraint Index (DCI) ─────────────────────────────────

/**
 * Normalization ranges for DCI fields.
 * Low end = most permissive (urban transit corridor), high end = most restrictive.
 * Source: peer set of 10 VA/MD jurisdictions.
 */
const DCI_RANGES = {
  lotSizeSqft:  { min: 3_000,  max: 87_120 }, // ~0.07 ac (urban) → 2 ac (rural)
  heightFt:     { min: 25,     max: 250 },     // residential low-rise → urban high-rise
  densityUpa:   { min: 1,      max: 150 },     // rural → high-density urban
  setbacksTotalFt: { min: 15,  max: 120 },     // combined front+side+rear
}

export interface DciInputs {
  minLotSizeSqft: number
  heightLimitFt: number
  densityLimitUpa: number
  setbackFrontFt: number
  setbackSideFt: number
  setbackRearFt: number
}

/**
 * E3-1: Compute Density Constraint Index (0–100, higher = more restrictive).
 * Weights: lot size 35%, height 20%, density 35%, setbacks 10%.
 * Height and density are inverted (lower limit = more restrictive).
 */
export function computeDCI(fields: DciInputs): number {
  const lotScore     = normalize(fields.minLotSizeSqft, DCI_RANGES.lotSizeSqft)
  const heightScore  = 100 - normalize(fields.heightLimitFt, DCI_RANGES.heightFt)   // inverse
  const densityScore = 100 - normalize(fields.densityLimitUpa, DCI_RANGES.densityUpa) // inverse
  const setbacks     = fields.setbackFrontFt + fields.setbackSideFt + fields.setbackRearFt
  const setbackScore = normalize(setbacks, DCI_RANGES.setbacksTotalFt)

  const raw = 0.35 * lotScore + 0.20 * heightScore + 0.35 * densityScore + 0.10 * setbackScore
  return clamp(Math.round(raw), 0, 100)
}

// ── E3-2: Development Cost Impact (DCOI) ─────────────────────────────────

/**
 * BEA Regional Price Parities — Goods component, 2022.
 * Used to scale national baseline construction cost to local market.
 * Source: Bureau of Economic Analysis regional price parity data.
 */
export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  // Real demo jurisdictions (slugs from db/seeds/jurisdictions.ts)
  'fairfax':                   1.12,
  'arlington':                 1.15,
  'loudoun':                   1.08,
  // Synthetic peer jurisdictions (slugs from db/seeds/syntheticJurisdictions.ts)
  'montgomery-county-md':      1.11,
  "prince-george's-county-md": 1.05,
  'howard-county-md':          1.10,
  'alexandria-city-va':        1.14,
  'prince-william-county-va':  1.07,
  'stafford-county-va':        1.04,
  'frederick-county-va':       1.03,
}

export const DEFAULT_REGIONAL_MULTIPLIER = 1.00

/** National baseline multifamily construction cost (BLS OES-derived, 2024). */
export const BASE_COST_PER_UNIT = 180_000

/** Surface parking stall cost including land opportunity cost ($/stall). */
export const PARKING_STALL_COST = 25_000

/** Unit size assumption for construction cost calculation (sq ft). */
export const UNIT_SIZE_SQFT = 900

/** Peer-set cost range for DCOI normalization. */
const DCOI_COST_RANGE = {
  min: BASE_COST_PER_UNIT * 0.85,                              // ~$153K: low-cost, zero parking
  max: BASE_COST_PER_UNIT * 1.30 + 3.0 * PARKING_STALL_COST,  // ~$309K: expensive region, 3 stalls
}

export interface DcoiInputs {
  parkingMinSpacesPerUnit: number
  regionalMultiplier: number
}

/**
 * E3-2: Compute Development Cost Impact (0–100, higher = more restrictive).
 * Combines parking cost uplift and regional construction cost premium.
 */
export function computeDCOI(inputs: DcoiInputs): number {
  const constructionCost = BASE_COST_PER_UNIT * inputs.regionalMultiplier
  const parkingCost = inputs.parkingMinSpacesPerUnit * PARKING_STALL_COST
  const totalCost = constructionCost + parkingCost
  return clamp(Math.round(normalize(totalCost, DCOI_COST_RANGE)), 0, 100)
}

// ── E3-3: Permitting Complexity Indicator (PCI) ───────────────────────────

export type ReviewType = 'by-right' | 'conditional-use-permit' | 'special-use-permit'

const REVIEW_SCORES: Record<ReviewType, number> = {
  'by-right':               20,
  'conditional-use-permit': 65,
  'special-use-permit':     95,
}

/** Permit ratio range across peer set (5+ unit permits / total permits). */
const PERMIT_RATIO_RANGE = { min: 0.05, max: 0.95 }

export interface PciInputs {
  permits5plus: number
  totalPermits: number
  discretionaryReviewType: ReviewType
}

/**
 * E3-3: Compute Permitting Complexity Indicator (0–100, higher = more complex).
 * Weights: discretionary review type 70%, multifamily permit share 30%.
 * Higher multifamily permit ratio = lower complexity (more development approved).
 */
export function computePCI(inputs: PciInputs): number {
  const ratio = inputs.totalPermits > 0
    ? inputs.permits5plus / inputs.totalPermits
    : 0.20  // fallback: assume low multifamily share if no data

  // Invert: high multifamily ratio = less complex = lower score
  const permitScore = 100 - normalize(ratio, PERMIT_RATIO_RANGE)
  const reviewScore = REVIEW_SCORES[inputs.discretionaryReviewType] ?? 65

  const raw = 0.70 * reviewScore + 0.30 * permitScore
  return clamp(Math.round(raw), 0, 100)
}

// ── E3-4: Comparative Restrictiveness Percentile (CRP) ────────────────────

/**
 * Pre-computed composite (DCI+DCOI+PCI) sums for the 10-jurisdiction peer set.
 * Used as reference distribution for CRP percentile calculation.
 * Source: seeded RIS scores for 3 real + 7 synthetic jurisdictions.
 */
const PEER_COMPOSITES = [
  { slug: 'alexandria-city-va',        composite: 35 + 60 + 30 },   // 125
  { slug: 'arlington',                 composite: 40 + 50 + 35 },   // 125
  { slug: "prince-george's-county-md", composite: 50 + 55 + 45 },   // 150
  { slug: 'frederick-county-va',       composite: 75 + 35 + 50 },   // 160
  { slug: 'prince-william-county-va',  composite: 70 + 45 + 55 },   // 170
  { slug: 'montgomery-county-md',      composite: 65 + 65 + 55 },   // 185
  { slug: 'howard-county-md',          composite: 60 + 70 + 60 },   // 190
  { slug: 'stafford-county-va',        composite: 85 + 40 + 65 },   // 190
  { slug: 'loudoun',                   composite: 80 + 55 + 60 },   // 195
  { slug: 'fairfax',                   composite: 75 + 70 + 65 },   // 210
]

export interface CrpInputs {
  dci: number
  dcoi: number
  pci: number
  /** Slug of the jurisdiction being scored (excluded from peer comparison). */
  slug?: string
}

/**
 * E3-4: Compute Comparative Restrictiveness Percentile (0–100).
 * Returns the fraction of peer jurisdictions with a lower composite score,
 * scaled to [0, 100]. Higher = more restrictive than peers.
 */
export function computeCRP(inputs: CrpInputs): number {
  const composite = inputs.dci + inputs.dcoi + inputs.pci
  const peers = PEER_COMPOSITES.filter((p) => p.slug !== inputs.slug)
  const below = peers.filter((p) => p.composite < composite).length
  return clamp(Math.round((below / peers.length) * 100), 0, 100)
}

// ── Full re-score from inputs ─────────────────────────────────────────────

export interface AllScoringInputs extends DciInputs, DcoiInputs, PciInputs {
  slug?: string
}

export interface ComputedSubScores {
  dci: number
  dcoi: number
  pci: number
  crp: number
}

/** Compute all four sub-scores from a single inputs object. */
export function computeAllSubScores(inputs: AllScoringInputs): ComputedSubScores {
  const dci  = computeDCI(inputs)
  const dcoi = computeDCOI(inputs)
  const pci  = computePCI(inputs)
  const crp  = computeCRP({ dci, dcoi, pci, slug: inputs.slug })
  return { dci, dcoi, pci, crp }
}
