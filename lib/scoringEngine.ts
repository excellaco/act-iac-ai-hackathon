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

import { computeRIS } from './scoring'

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
  setbacksTotalFt: { min: 15,  max: 140 },     // combined front + 2×side + rear
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
  // Side setbacks apply to both sides of the parcel, consuming 2× the stated
  // value from buildable width, so we double setbackSideFt here.
  const setbacks     = fields.setbackFrontFt + (2 * fields.setbackSideFt) + fields.setbackRearFt
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
  'fairfax_va':                1.12,
  'arlington_va':              1.15,
  'loudoun_va':                1.08,
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

// ── Building-type hard costs per unit — 2024–2025 Northern Virginia ──────────
// Sources: NAHB Construction Cost Survey 2024, RSMeans Multifamily Cost Data 2024

/** Type V wood-frame, up to 45 ft (up to 4 stories). */
export const GARDEN_COST_PER_UNIT   = 195_000

/** Type III/V podium, 46–90 ft (5–7 stories). */
export const MIDRISE_COST_PER_UNIT  = 270_000

/** Type I/II concrete, over 90 ft (8+ stories). */
export const HIGHRISE_COST_PER_UNIT = 385_000

/**
 * Soft costs as a percentage of hard costs (architecture, permits, financing,
 * developer fee). Source: NAHB "What it Costs to Build an Apartment" 2024
 * — typically 20–24% of hard costs.
 */
export const SOFT_COST_PCT = 0.22

// ── DSCR financing constants — permanent multifamily debt, 2025 ───────────────

/** Fannie Mae DUS market rate, 2025. */
export const ANNUAL_INTEREST_RATE    = 0.065

/** 30-year amortization. */
export const LOAN_TERM_MONTHS        = 360

/** Fannie Mae/Freddie Mac standard LTV ratio. */
export const LTV_RATIO               = 0.65

/** Standard lender minimum debt service coverage ratio. */
export const DSCR_MIN                = 1.25

/** NMHC/NAHB multifamily operating expense ratio. */
export const OPERATING_EXPENSE_RATIO = 0.35

/**
 * @deprecated Use MIDRISE_COST_PER_UNIT for feasibility calculations.
 * Kept equal to MIDRISE_COST_PER_UNIT for backward compatibility with
 * computeDCOI(), which uses it for DCOI normalization. Do not remove until
 * DCOI is updated to use building-type-specific costs (deferred, see issue #203).
 */
export const BASE_COST_PER_UNIT = MIDRISE_COST_PER_UNIT

/** Surface parking stall cost including land opportunity cost ($/stall).
 * Source: NAHB 2024 surface stall with land opportunity cost.
 */
export const PARKING_STALL_COST = 30_000

/** Unit size assumption for construction cost calculation (sq ft). */
export const UNIT_SIZE_SQFT = 900

/**
 * Peer-set cost range for DCOI normalization.
 * Defined as absolute dollar values so that changes to BASE_COST_PER_UNIT
 * do not silently shift the normalization bounds and break score comparability.
 * Derived from the peer-set extremes using MIDRISE_COST_PER_UNIT ($270K) and
 * PARKING_STALL_COST ($30K):
 *   min: ~$278K (1.03× baseline, Frederick County, zero parking)
 *   max: ~$400K (1.15× baseline, Arlington, + 3 stalls × $30K)
 * Update these if the peer set or parking cost assumptions change materially.
 */
const DCOI_COST_RANGE = {
  min: 278_000, // low-cost peer region (1.03× midrise baseline), zero parking
  max: 400_500, // high-cost peer region (1.15× midrise baseline) + 3 stalls × $30K
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

/** A peer jurisdiction entry used for CRP percentile comparison. */
export interface PeerComposite {
  slug: string
  /** Sum of DCI + DCOI + PCI sub-scores for this peer. */
  composite: number
}

/**
 * Fallback pre-computed composite (DCI+DCOI+PCI) sums for the 10-jurisdiction
 * peer set. These are used when no live peer data is supplied (e.g. client-side
 * What-If simulation). Server-side scoring in score-zones.ts should load live
 * composites from the ris_scores table and pass them via CrpInputs.peerSet so
 * that CRP stays in sync with the current scoring formula.
 *
 * WARNING: These hardcoded values are derived from synthetic seed scores and
 * will drift as formulas change. Re-seeding synthetic jurisdictions and passing
 * live peerSet from the DB is the authoritative path (see issue #235).
 */
/**
 * Real slugs — these jurisdictions have zoning ordinances extracted by the
 * pipeline. All others are synthetic (modeled estimates).
 */
const REAL_SLUGS = new Set(['fairfax_va', 'arlington_va', 'loudoun_va'])

export interface PeerJurisdiction {
  slug: string
  displayName: string
  /** 'extracted' = real ordinance data; 'modeled' = synthetic/estimated scores */
  dataSource: 'extracted' | 'modeled'
  composite: number
}

/**
 * Full peer set used by the CRP calculation. Exported so the UI can display
 * an accurate peer set disclosure without duplicating this list.
 */
export const PEER_COMPOSITES: PeerJurisdiction[] = [
  { slug: 'alexandria-city-va',        displayName: 'Alexandria City, VA',          dataSource: 'modeled',    composite: 35 + 60 + 30 },   // 125
  { slug: 'arlington_va',              displayName: 'Arlington County, VA',          dataSource: 'extracted',  composite: 40 + 50 + 35 },   // 125
  { slug: "prince-george's-county-md", displayName: "Prince George's County, MD",   dataSource: 'modeled',    composite: 50 + 55 + 45 },   // 150
  { slug: 'frederick-county-va',       displayName: 'Frederick County, VA',          dataSource: 'modeled',    composite: 75 + 35 + 50 },   // 160
  { slug: 'prince-william-county-va',  displayName: 'Prince William County, VA',     dataSource: 'modeled',    composite: 70 + 45 + 55 },   // 170
  { slug: 'montgomery-county-md',      displayName: 'Montgomery County, MD',         dataSource: 'modeled',    composite: 65 + 65 + 55 },   // 185
  { slug: 'howard-county-md',          displayName: 'Howard County, MD',             dataSource: 'modeled',    composite: 60 + 70 + 60 },   // 190
  { slug: 'stafford-county-va',        displayName: 'Stafford County, VA',           dataSource: 'modeled',    composite: 85 + 40 + 65 },   // 190
  { slug: 'loudoun_va',                displayName: 'Loudoun County, VA',            dataSource: 'extracted',  composite: 80 + 55 + 60 },   // 195
  { slug: 'fairfax_va',                displayName: 'Fairfax County, VA',            dataSource: 'extracted',  composite: 75 + 70 + 65 },   // 210
]

/** Backward-compatible alias used by score.ts, score-zones.ts, and tests. */
export const FALLBACK_PEER_COMPOSITES: PeerComposite[] = PEER_COMPOSITES

// Keep backward-compatible internal reference pointing at the same array
const _PEER_COMPOSITES = PEER_COMPOSITES

/** Validate that REAL_SLUGS is consistent with the peer list */
if (process.env.NODE_ENV !== 'production') {
  for (const peer of _PEER_COMPOSITES) {
    const expected: PeerJurisdiction['dataSource'] = REAL_SLUGS.has(peer.slug) ? 'extracted' : 'modeled'
    if (peer.dataSource !== expected) {
      throw new Error(`PEER_COMPOSITES dataSource mismatch for slug "${peer.slug}": expected ${expected}`)
    }
  }
}

export interface CrpInputs {
  dci: number
  dcoi: number
  pci: number
  /** Slug of the jurisdiction being scored (excluded from peer comparison). */
  slug?: string
  /**
   * Optional live peer composites loaded from the ris_scores table.
   * When provided, these take precedence over FALLBACK_PEER_COMPOSITES so that
   * CRP is computed against the current scoring output rather than stale
   * hardcoded values.  Server-side scoring (score-zones.ts) should always pass
   * this field; client-side What-If simulation uses the fallback.
   */
  peerSet?: PeerComposite[]
}

/**
 * E3-4: Compute Comparative Restrictiveness Percentile (0–100).
 * Returns the fraction of peer jurisdictions with a lower composite score,
 * scaled to [0, 100]. Higher = more restrictive than peers.
 *
 * Pass `inputs.peerSet` (loaded from the ris_scores table) for accurate
 * server-side scoring. Omit it for client-side What-If simulation, which falls
 * back to FALLBACK_PEER_COMPOSITES.
 */
export function computeCRP(inputs: CrpInputs): number {
  const composite = inputs.dci + inputs.dcoi + inputs.pci
  const allPeers = inputs.peerSet ?? FALLBACK_PEER_COMPOSITES
  let peers = allPeers.filter((p) => p.slug !== inputs.slug)

  // Guard: if the live peer set is empty after self-exclusion (e.g. scoring the
  // first jurisdiction on a fresh DB before any other scores exist), fall back
  // to FALLBACK_PEER_COMPOSITES so we never produce NaN.  Self-exclude from the
  // fallback set too so the behaviour is consistent.
  if (peers.length === 0) {
    peers = FALLBACK_PEER_COMPOSITES.filter((p) => p.slug !== inputs.slug)
  }

  // Final safety net: if the fallback set is also somehow empty, return 50.
  if (peers.length === 0) return 50

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

// ── E2-155: Per-zone scoring ───────────────────────────────────────────────

export interface ZoneRISResult {
  zoneCode: string
  zoneName: string | null
  multifamilyClassification: 'primary' | 'permitted' | 'limited' | 'none'
  dci: number
  dcoi: number
  /** PCI uses zone-level review type when available, with jurisdiction-level permit data. */
  pci: number
  /** CRP computed after averaging all zones — set to 0 until averageZoneRIS runs. */
  crp: number
  risComposite: number
}

/**
 * E2-155: Compute RIS for a single zone.
 *
 * Zone-level scoring uses the zone's own field values for DCI and DCOI.
 * PCI uses the zone-level discretionary_review_required when available
 * (because review type is 70% of PCI and varies per zone), falling back to
 * the jurisdiction-level value for permit ratio data (no per-zone permit data).
 * CRP is computed at jurisdiction level after averaging all zones.
 *
 * @param zoneFields  Partial inputs from zone-extracted fields
 * @param fallbacks   Jurisdiction-level values used for any missing zone fields
 * @param pciInputs   Jurisdiction-level PCI inputs (permit data + review type)
 * @param zoneCode    Zone identifier
 * @param zoneName    Optional zone display name
 * @param classification  Zone multifamily classification
 * @param zoneReviewType  Optional zone-level discretionary review type; overrides
 *                        pciInputs.discretionaryReviewType when provided
 */
export function computeZoneRIS(
  zoneFields: Partial<DciInputs & DcoiInputs>,
  fallbacks: AllScoringInputs,
  pciInputs: PciInputs,
  zoneCode: string,
  zoneName: string | null,
  classification: 'primary' | 'permitted' | 'limited' | 'none',
  zoneReviewType?: ReviewType,
): ZoneRISResult {
  const dciInputs: DciInputs = {
    minLotSizeSqft:   zoneFields.minLotSizeSqft   ?? fallbacks.minLotSizeSqft,
    heightLimitFt:    zoneFields.heightLimitFt     ?? fallbacks.heightLimitFt,
    densityLimitUpa:  zoneFields.densityLimitUpa   ?? fallbacks.densityLimitUpa,
    setbackFrontFt:   zoneFields.setbackFrontFt    ?? fallbacks.setbackFrontFt,
    setbackSideFt:    zoneFields.setbackSideFt     ?? fallbacks.setbackSideFt,
    setbackRearFt:    zoneFields.setbackRearFt     ?? fallbacks.setbackRearFt,
  }

  const dcoiInputs: DcoiInputs = {
    parkingMinSpacesPerUnit: zoneFields.parkingMinSpacesPerUnit ?? fallbacks.parkingMinSpacesPerUnit,
    regionalMultiplier:      fallbacks.regionalMultiplier, // always jurisdiction-level
  }

  // Use zone-level review type when available (it's 70% of PCI and may differ
  // per zone), but keep jurisdiction-level permit data (no per-zone permit data).
  const effectivePciInputs: PciInputs = zoneReviewType
    ? { ...pciInputs, discretionaryReviewType: zoneReviewType }
    : pciInputs

  const dci  = computeDCI(dciInputs)
  const dcoi = computeDCOI(dcoiInputs)
  const pci  = computePCI(effectivePciInputs)
  // CRP is unknown until averageZoneRIS runs; use 0 as placeholder so the
  // formula stays consistent with computeRIS — callers must call averageZoneRIS
  // to get the final risComposite with CRP filled in.
  const risComposite = computeRIS({ dci, dcoi, pci, crp: 0 })

  return {
    zoneCode,
    zoneName,
    multifamilyClassification: classification,
    dci,
    dcoi,
    pci,
    crp: 0, // set by averageZoneRIS after all zones are scored
    risComposite,
  }
}

/**
 * E2-155: Compute the unweighted average RIS across primary and permitted zones,
 * compute jurisdiction-level CRP from the averaged sub-scores, and return both
 * the per-zone results (with CRP filled in) and the jurisdiction-level average.
 *
 * Only 'primary' and 'permitted' zones are included in the average.
 * 'limited' and 'none' zones are returned in the array but excluded from averaging.
 *
 * @param peerSet  Optional live peer composites from the ris_scores table.
 *                 When provided, CRP is computed against the current scoring
 *                 output rather than the hardcoded fallback values.
 */
export function averageZoneRIS(
  zoneScores: ZoneRISResult[],
  slug?: string,
  peerSet?: PeerComposite[],
): { zoneScores: ZoneRISResult[]; averaged: { dci: number; dcoi: number; pci: number; crp: number; risComposite: number } } {
  const scoredZones = zoneScores.filter(
    (z) => z.multifamilyClassification === 'primary' || z.multifamilyClassification === 'permitted',
  )

  let dci: number, dcoi: number, pci: number

  if (scoredZones.length === 0) {
    // No scoreable zones — fall back to simple average of all zones
    const all = zoneScores.length > 0 ? zoneScores : [{ dci: 50, dcoi: 50, pci: 50, risComposite: 50 }]
    dci = Math.round(all.reduce((s, z) => s + z.dci, 0) / all.length)
    dcoi = Math.round(all.reduce((s, z) => s + z.dcoi, 0) / all.length)
    pci = Math.round(all.reduce((s, z) => s + z.pci, 0) / all.length)
  } else {
    dci  = Math.round(scoredZones.reduce((s, z) => s + z.dci,  0) / scoredZones.length)
    dcoi = Math.round(scoredZones.reduce((s, z) => s + z.dcoi, 0) / scoredZones.length)
    pci  = Math.round(scoredZones.reduce((s, z) => s + z.pci,  0) / scoredZones.length)
  }

  // CRP is always computed at jurisdiction level after averaging.
  // Pass live peerSet when available so CRP reflects current DB scores.
  const crp = computeCRP({ dci, dcoi, pci, slug, peerSet })
  const risComposite = computeRIS({ dci, dcoi, pci, crp })

  // Back-fill CRP and recompute risComposite for each zone using the weighted formula
  const filledZoneScores = zoneScores.map((z) => ({
    ...z,
    crp,
    risComposite: computeRIS({ dci: z.dci, dcoi: z.dcoi, pci: z.pci, crp }),
  }))

  return {
    zoneScores: filledZoneScores,
    averaged: { dci, dcoi, pci, crp, risComposite },
  }
}
