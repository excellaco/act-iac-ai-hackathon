import { computeRIS } from './scoring'
import { computeFeasibility, inferBuildingType, computeMonthlyDebtService, computeRequiredRent } from './feasibility'
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

export interface FieldCitation {
  fieldValueText: string | null
  sourceSection: string | null
  sourcePage: number | null
  sourceDocument: string | null
  confidence: string | null
  reasoning: string | null
  /**
   * True when no numeric value was extracted from the ordinance and the
   * scoring engine is using a hardcoded regulatory default instead.
   * Distinct from low confidence, which means a value was extracted but
   * with uncertainty. A field can be low-confidence AND still not use a
   * default (e.g. Gemini found a value but flagged it as uncertain).
   */
  usingDefault: boolean
}

/** Per-zone regulatory data and scores (E2-155). */
export interface ZoneScore {
  zoneCode: string;
  zoneName: string | null;
  multifamilyClassification: 'primary' | 'permitted' | 'limited' | 'none';
  dci: number;
  dcoi: number;
  pci: number;
  crp: number;
  risComposite: number;
  /** Partial regulatory fields extracted for this zone. */
  fields: Partial<RegulationFields>;
  /** Citation metadata for zone-specific extracted fields. */
  citations: Record<string, FieldCitation>;
  feasibility: FeasibilityOutputs | null;
}

export interface DataVintage {
  /** Year/label of HUD Fair Market Rent data (e.g. "FY2025") */
  fmrVintage: string | null;
  /** Year/label of Census Building Permits data (e.g. "2023") */
  permitsVintage: string | null;
  /** ISO date when market data was retrieved */
  retrievedAt: string | null;
  /** ISO timestamp of the most recent zoning field extraction run */
  zoningExtractedAt: string | null;
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
  /** Citation metadata keyed by field name (e.g. "min_lot_size_sqft") */
  citations: Record<string, FieldCitation>;
  /**
   * Per-zone scores and field values (E2-155).
   * Empty for synthetic jurisdictions and pre-zone data.
   */
  zoneScores: ZoneScore[];
  /** Data vintage info for responsible AI disclosure */
  dataVintage?: DataVintage;
}

// ── Per-jurisdiction regulatory field baselines ───────────────────────────
// These represent multifamily-zone values extracted from each jurisdiction's
// zoning ordinance. Used as What-If slider baselines.
// Sources: Municode zoning codes (Fairfax, Arlington, Loudoun), extracted Mar 2025.

const JURISDICTION_FIELDS: Record<string, RegulationFields> = {
  // Real demo jurisdictions — slugs match db/seeds/jurisdictions.ts
  'fairfax_va': {
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
    regionalMultiplier:      REGIONAL_MULTIPLIERS['fairfax_va'],
    fmr2br:                  2280,    // HUD FY2025 DC MSA
  },
  'arlington_va': {
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
    regionalMultiplier:      REGIONAL_MULTIPLIERS['arlington_va'],
    fmr2br:                  2280,
  },
  'loudoun_va': {
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
    regionalMultiplier:      REGIONAL_MULTIPLIERS['loudoun_va'],
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
    heightLimitFt:           fields.heightLimitFt,
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
    citations: {},
    zoneScores: [],
  }
}

export const JURISDICTIONS: JurisdictionData[] = [
  buildJurisdiction('fairfax-uuid',   'Fairfax County',   'VA', 'fairfax_va',   { dci: 75, dcoi: 70, pci: 65, crp: 80 }),
  buildJurisdiction('arlington-uuid', 'Arlington County', 'VA', 'arlington_va', { dci: 40, dcoi: 50, pci: 35, crp: 45 }),
  buildJurisdiction('loudoun-uuid',   'Loudoun County',   'VA', 'loudoun_va',   { dci: 80, dcoi: 55, pci: 60, crp: 60 }),
]

/**
 * Converts a /api/jurisdictions/[id]/score response into the JurisdictionData
 * shape expected by ScorePanel.
 */
export function scoreResponseToJurisdictionData(
  apiResponse: {
    jurisdiction: { id: string; name: string; state: string; slug: string; dataType: string }
    score: { risComposite: string; dci: string; dcoi: string; pci: string; crp: string } | null
    extractedFields?: Array<{ fieldName: string; fieldValue: string | null; fieldValueText?: string | null; unit: string | null; confidence: string; sourceDocument: string | null; reasoning?: string | null }>
    /** ISO timestamp of the most recent zoning field extraction, returned unconditionally from the API. */
    zoningExtractedAt?: string | Date | null
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
      fmrVintage?: string | null
      permitsVintage?: string | null
      retrievedAt?: string | Date | null
    } | null
    zoneScores?: Array<{
      zoneCode: string
      zoneName: string | null
      multifamilyClassification: 'primary' | 'permitted' | 'limited' | 'none'
      dci: string
      dcoi: string
      pci: string
      crp: string
      risComposite: string
      fields: Record<string, string | null>
      citations?: Record<string, { fieldValueText: string | null; sourceSection: string | null; sourcePage: number | null; confidence?: string | null; reasoning?: string | null; fieldValue?: string | null }>
      feasibility: {
        maxUnitsPerAcre: string | null
        parkingFootprintPct: string | null
        estimatedCostPerUnit: string | null
        fmr2br: string | null
      } | null
    }>
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
  const citations: Record<string, FieldCitation> = {}
  for (const f of apiResponse.extractedFields ?? []) {
    if (f.fieldValue != null) {
      const parsed = parseFloat(f.fieldValue)
      if (!isNaN(parsed)) fieldMap[f.fieldName] = parsed
    }
    // usingDefault = true only when the pipeline found nothing at all and fell
    // back to a hardcoded default. A categorical field (e.g. discretionary_review_required)
    // can have a null fieldValue but a non-null fieldValueText, meaning it was
    // successfully extracted — that is NOT a default. Only flag as default when
    // both fieldValue (numeric) and fieldValueText (categorical) are absent.
    const hasExtractedValue =
      (f.fieldValue != null && !isNaN(parseFloat(f.fieldValue))) ||
      (f.fieldValueText != null && f.fieldValueText.trim() !== '')
    citations[f.fieldName] = {
      fieldValueText: f.fieldValueText ?? null,
      sourceSection: (f as { sourceSection?: string | null }).sourceSection ?? null,
      sourcePage: (f as { sourcePage?: number | null }).sourcePage ?? null,
      sourceDocument: f.sourceDocument ?? null,
      confidence: f.confidence ?? null,
      reasoning: f.reasoning ?? null,
      usingDefault: !hasExtractedValue,
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
  // results like requiredRent=0 → "Feasible".
  let feasibility: FeasibilityOutputs
  const storedCost = apiResponse.feasibility?.estimatedCostPerUnit != null
    ? Number(apiResponse.feasibility.estimatedCostPerUnit.trim())
    : NaN
  if (!Number.isNaN(storedCost)) {
    const f = apiResponse.feasibility!
    const estimatedCostPerUnit = storedCost
    const buildingType = inferBuildingType(fields.heightLimitFt)
    const monthlyDebtService = computeMonthlyDebtService(estimatedCostPerUnit)
    const requiredRent = computeRequiredRent(monthlyDebtService)
    const fmrVal = f.fmr2br != null ? parseNumeric(f.fmr2br, fmr2br) : fmr2br
    feasibility = {
      maxUnitsPerAcre:      parseNumeric(f.maxUnitsPerAcre, fields.densityLimitUpa),
      parkingFootprintPct:  parseNumeric(f.parkingFootprintPct, 0),
      estimatedCostPerUnit,
      buildingType,
      monthlyDebtService,
      requiredRent,
      rentFeasibility:      requiredRent < fmrVal ? 'Feasible' : requiredRent < fmrVal * 1.3 ? 'Marginal' : 'Infeasible',
      fmr2br:               fmrVal,
    }
  } else {
    feasibility = computeFeasibility({
      densityLimitUpa:         fields.densityLimitUpa,
      parkingMinSpacesPerUnit: fields.parkingMinSpacesPerUnit,
      heightLimitFt:           fields.heightLimitFt,
      regionalMultiplier:      fields.regionalMultiplier,
      fmr2br:                  fields.fmr2br,
    })
  }

  // Parse zone scores (E2-155)
  const zoneScores: ZoneScore[] = (apiResponse.zoneScores ?? []).map((zs) => {
    const zfmr2br = zs.feasibility?.fmr2br != null
      ? parseNumeric(zs.feasibility.fmr2br, fmr2br)
      : fmr2br

    let zoneFeasibility: import('./feasibility').FeasibilityOutputs | null = null
    const storedZoneCost = zs.feasibility?.estimatedCostPerUnit != null
      ? Number(zs.feasibility.estimatedCostPerUnit)
      : NaN
    if (!Number.isNaN(storedZoneCost) && zs.feasibility) {
      const zf = zs.feasibility
      // Use zone height limit if available, otherwise fall back to jurisdiction height limit
      const zoneHeightLimitFt = zs.fields?.['height_limit_ft'] != null
        ? parseNumeric(zs.fields['height_limit_ft'], fields.heightLimitFt)
        : fields.heightLimitFt
      const zoneBuildingType = inferBuildingType(zoneHeightLimitFt)
      const zoneMonthlyDebtService = computeMonthlyDebtService(storedZoneCost)
      const zoneRequiredRent = computeRequiredRent(zoneMonthlyDebtService)
      zoneFeasibility = {
        maxUnitsPerAcre:     parseNumeric(zf.maxUnitsPerAcre, 0),
        parkingFootprintPct: parseNumeric(zf.parkingFootprintPct, 0),
        estimatedCostPerUnit: storedZoneCost,
        buildingType: zoneBuildingType,
        monthlyDebtService: zoneMonthlyDebtService,
        requiredRent: zoneRequiredRent,
        rentFeasibility: zoneRequiredRent < zfmr2br ? 'Feasible' : zoneRequiredRent < zfmr2br * 1.3 ? 'Marginal' : 'Infeasible',
        fmr2br: zfmr2br,
      }
    }

    // Build partial RegulationFields from zone field map
    const zf = zs.fields
    const zoneFieldsPartial: Partial<RegulationFields> = {
      ...(zf['min_lot_size_sqft']           != null ? { minLotSizeSqft:          parseNumeric(zf['min_lot_size_sqft'], 0)           } : {}),
      ...(zf['height_limit_ft']             != null ? { heightLimitFt:           parseNumeric(zf['height_limit_ft'], 0)             } : {}),
      ...(zf['density_limit_units_per_acre'] != null ? { densityLimitUpa:         parseNumeric(zf['density_limit_units_per_acre'], 0) } : {}),
      ...(zf['parking_min_spaces_per_unit'] != null ? { parkingMinSpacesPerUnit: parseNumeric(zf['parking_min_spaces_per_unit'], 0) } : {}),
      ...(zf['setback_front_ft']            != null ? { setbackFrontFt:          parseNumeric(zf['setback_front_ft'], 0)            } : {}),
      ...(zf['setback_side_ft']             != null ? { setbackSideFt:           parseNumeric(zf['setback_side_ft'], 0)             } : {}),
      ...(zf['setback_rear_ft']             != null ? { setbackRearFt:           parseNumeric(zf['setback_rear_ft'], 0)             } : {}),
    }

    // Build zone citations from zone-level field data
    const zoneCitations: Record<string, FieldCitation> = {}
    if (zs.citations) {
      for (const [fieldName, c] of Object.entries(zs.citations)) {
        // usingDefault = true only when neither a numeric nor a categorical value
        // was extracted — same logic as jurisdiction-level citations above.
        const zoneHasExtractedValue =
          (c.fieldValue != null && !isNaN(parseFloat(c.fieldValue))) ||
          (c.fieldValueText != null && c.fieldValueText.trim() !== '')
        zoneCitations[fieldName] = {
          fieldValueText: c.fieldValueText,
          sourceSection: c.sourceSection,
          sourcePage: c.sourcePage,
          sourceDocument: null,
          confidence: c.confidence ?? null,
          reasoning: c.reasoning ?? null,
          usingDefault: !zoneHasExtractedValue,
        }
      }
    }

    return {
      zoneCode:                  zs.zoneCode,
      zoneName:                  zs.zoneName,
      multifamilyClassification: zs.multifamilyClassification,
      dci:                       Math.round(parseNumeric(zs.dci, 0)),
      dcoi:                      Math.round(parseNumeric(zs.dcoi, 0)),
      pci:                       Math.round(parseNumeric(zs.pci, 0)),
      crp:                       Math.round(parseNumeric(zs.crp, 0)),
      risComposite:              Math.round(parseNumeric(zs.risComposite, 0)),
      fields:                    zoneFieldsPartial,
      citations:                 zoneCitations,
      feasibility:               zoneFeasibility,
    }
  })

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
    citations,
    zoneScores,
    dataVintage: {
      fmrVintage:        apiResponse.marketData?.fmrVintage ?? null,
      permitsVintage:    apiResponse.marketData?.permitsVintage ?? null,
      retrievedAt:       apiResponse.marketData?.retrievedAt
        ? new Date(apiResponse.marketData.retrievedAt as string | Date).toISOString()
        : null,
      zoningExtractedAt: apiResponse.zoningExtractedAt
        ? new Date(apiResponse.zoningExtractedAt as string | Date).toISOString()
        : null,
    },
  }
}
