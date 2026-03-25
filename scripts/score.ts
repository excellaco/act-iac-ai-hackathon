/**
 * Pipeline Stage 4 — RIS Scoring
 *
 * Computes RIS scores for a jurisdiction from zone_extracted_fields in the DB,
 * writes results to zone_ris_scores, ris_scores, and feasibility_outputs,
 * then writes a ScoresArtifact to data/artifacts/{slug}/{slug}_scores.json.
 *
 * Usage:
 *   npm run pipeline:score <jurisdiction_slug>
 *   npm run pipeline:score fairfax_va
 *
 * This is Stage 4 — run after pipeline:load.
 */

import { db } from '../db/client'
import { jurisdictions, extractedFields, marketData, zoneExtractedFields, zoneRisScores, risScores, feasibilityOutputs } from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import { computeZoneRIS, averageZoneRIS, REGIONAL_MULTIPLIERS, DEFAULT_REGIONAL_MULTIPLIER } from '../lib/scoringEngine'
import { computeFeasibility } from '../lib/feasibility'
import { computeRIS } from '../lib/scoring'
import { buildLoadArtifactStore } from '../lib/pipeline/artifact-store'
import { ScoresArtifact, ZoneScoreEntry } from '../lib/pipeline/artifact'
import type { ReviewType, PeerComposite } from '../lib/scoringEngine'

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveJurisdiction(
  slug: string,
  allJurisdictions: { id: string; slug: string; name: string; displayName: string }[],
) {
  const exact = allJurisdictions.find((j) => j.slug === slug)
  if (exact) return exact
  const prefix = slug.split(/[_-]/)[0]
  return allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase())) ?? null
}

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

function asReviewType(v: string | null | undefined): ReviewType {
  if (v === 'by_right' || v === 'by-right') return 'by-right'
  if (v === 'conditional_use_permit' || v === 'conditional-use-permit') return 'conditional-use-permit'
  if (v === 'special_use_permit' || v === 'special-use-permit') return 'special-use-permit'
  return 'conditional-use-permit'
}

/**
 * Returns true when a field_value_text looks like a cross-reference to another
 * code section rather than a genuine "not found" result.
 * Example: "Refer to Section 7.06.02", "See Section 4.3", "Per Article 5".
 * Parking deferred to another section should use 0 spaces, not the 1.5 default,
 * to avoid overstating the parking burden in transit-oriented zones.
 */
function isParkingDeferredToSection(text: string | null | undefined): boolean {
  if (!text) return false
  return /\b(refer|see|per|pursuant to)\b.{0,30}\b(section|article|chapter|§)\b/i.test(text)
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slugArg = process.argv[2]

  if (!slugArg) {
    console.error('Usage: npm run pipeline:score <jurisdiction_slug>')
    console.error('Example: npm run pipeline:score fairfax_va')
    process.exit(1)
  }

  const logger = {
    info:  (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
    warn:  (msg: string, ctx?: object) => console.warn(`   WARN ${msg}`, ctx ?? ''),
    error: (msg: string, ctx?: object) => console.error(`   ERROR ${msg}`, ctx ?? ''),
  }

  console.log(`\nParcela — pipeline:score`)
  console.log(`Slug:     ${slugArg}\n`)

  // 1. Resolve jurisdiction
  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = resolveJurisdiction(slugArg, allJurisdictions)

  if (!jur) {
    console.error(`ERROR: Jurisdiction not found in DB for slug: ${slugArg}`)
    console.error(`  Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    console.error(`  Run npm run db:seed first.`)
    process.exit(1)
  }

  logger.info(`Jurisdiction: ${jur.displayName} (${jur.id})`)

  // 2. Load jurisdiction-level extracted fields (fallbacks)
  const jFields = await db.select().from(extractedFields).where(eq(extractedFields.jurisdictionId, jur.id))
  const fieldMap: Record<string, number | string | null> = {}
  for (const f of jFields) {
    fieldMap[f.fieldName] = f.fieldValue != null ? parseNum(f.fieldValue, 0) : f.fieldValueText
  }

  // 3. Load market data
  const market = await db.query.marketData.findFirst({ where: eq(marketData.jurisdictionId, jur.id) })
  const fmr2br = parseNum(market?.fmr2br, 1800)
  const permits5plus = market?.permits5plus ?? 500
  const totalPermits = market?.totalPermits ?? 1000
  const regionalMultiplier = REGIONAL_MULTIPLIERS[jur.slug] ?? DEFAULT_REGIONAL_MULTIPLIER

  // Jurisdiction-level fallbacks
  const fallbacks = {
    minLotSizeSqft:          parseNum(fieldMap['min_lot_size_sqft'] as string, 20_000),
    heightLimitFt:           parseNum(fieldMap['height_limit_ft'] as string, 50),
    densityLimitUpa:         parseNum(fieldMap['density_limit_units_per_acre'] as string, 20),
    parkingMinSpacesPerUnit: parseNum(fieldMap['parking_min_spaces_per_unit'] as string, 1.5),
    setbackFrontFt:          parseNum(fieldMap['setback_front_ft'] as string, 20),
    setbackSideFt:           parseNum(fieldMap['setback_side_ft'] as string, 10),
    setbackRearFt:           parseNum(fieldMap['setback_rear_ft'] as string, 20),
    discretionaryReviewType: asReviewType(fieldMap['discretionary_review_required'] as string),
    permits5plus,
    totalPermits,
    regionalMultiplier,
    fmr2br,
    slug: jur.slug,
  }

  const pciInputs = {
    permits5plus,
    totalPermits,
    discretionaryReviewType: fallbacks.discretionaryReviewType,
  }

  // 3a. Load live peer composites from ris_scores for accurate CRP calculation.
  // Passing live composites ensures CRP is computed against the current scoring
  // output rather than stale hardcoded fallback values.  computeCRP() will
  // automatically fall back to FALLBACK_PEER_COMPOSITES if the live set is
  // empty after self-exclusion (e.g. first jurisdiction scored on a fresh DB).
  const peerRows = await db
    .select({
      slug: jurisdictions.slug,
      dci:  risScores.dci,
      dcoi: risScores.dcoi,
      pci:  risScores.pci,
    })
    .from(risScores)
    .innerJoin(jurisdictions, eq(risScores.jurisdictionId, jurisdictions.id))

  const livePeerSet: PeerComposite[] = peerRows
    .filter((r) => r.dci != null && r.dcoi != null && r.pci != null)
    .map((r) => ({
      slug:      r.slug,
      composite: parseNum(r.dci, 50) + parseNum(r.dcoi, 50) + parseNum(r.pci, 50),
    }))

  if (livePeerSet.length > 0) {
    logger.info(`Peer set: ${livePeerSet.length} jurisdiction(s) loaded from DB for CRP`)
  } else {
    logger.warn('No peer scores in DB — CRP will use fallback composites (run pipeline:score for all jurisdictions first)')
  }

  // 4. Load zone extracted fields
  const zFields = await db.select().from(zoneExtractedFields).where(eq(zoneExtractedFields.jurisdictionId, jur.id))

  if (zFields.length === 0) {
    logger.warn('No zone fields found in DB — run npm run pipeline:load first.')
    process.exit(0)
  }

  logger.info(`Loaded ${zFields.length} zone field row(s) from DB`)

  // Group by zone_code
  const byZone = new Map<string, typeof zFields>()
  for (const f of zFields) {
    const arr = byZone.get(f.zoneCode) ?? []
    arr.push(f)
    byZone.set(f.zoneCode, arr)
  }

  logger.info(`Zones found: ${byZone.size}`)

  // 5. Score each zone
  const zoneResults = []
  for (const [zoneCode, fields] of byZone) {
    const zoneFm: Record<string, number> = {}
    const zoneFmText: Record<string, string> = {}
    for (const f of fields) {
      if (f.fieldValue != null) zoneFm[f.fieldName] = parseNum(f.fieldValue, 0)
      if (f.fieldValueText != null) zoneFmText[f.fieldName] = f.fieldValueText
    }

    const classification = fields[0].multifamilyClassification
    const zoneName = fields[0].zoneName ?? null

    if (classification !== 'primary' && classification !== 'permitted') {
      logger.info(`Zone ${zoneCode} (${classification}) — not scored (limited/none excluded from RIS)`)
      continue
    }

    // Determine parking value for this zone.
    // If the numeric value is absent but the text looks like a cross-reference
    // (e.g. "Refer to Section 7.06.02"), treat as 0 — the zone code explicitly
    // defers parking, often to a transit-oriented or reduced-parking provision.
    // Applying the 1.5-space default in that case would overstate the burden.
    let zoneParkingSpaces: number | undefined = zoneFm['parking_min_spaces_per_unit']
    if (zoneParkingSpaces === undefined && isParkingDeferredToSection(zoneFmText['parking_min_spaces_per_unit'])) {
      zoneParkingSpaces = 0
      logger.info(`Zone ${zoneCode}: parking deferred to code section — using 0 spaces (not 1.5 default)`)
    }

    const zoneInputs = {
      minLotSizeSqft:          zoneFm['min_lot_size_sqft'],
      heightLimitFt:           zoneFm['height_limit_ft'],
      densityLimitUpa:         zoneFm['density_limit_units_per_acre'],
      parkingMinSpacesPerUnit: zoneParkingSpaces,
      setbackFrontFt:          zoneFm['setback_front_ft'],
      setbackSideFt:           zoneFm['setback_side_ft'],
      setbackRearFt:           zoneFm['setback_rear_ft'],
    }

    // Use zone-level discretionary review type when available — it is 70% of PCI
    // and may differ per zone (e.g. one zone by-right, another requiring a SUP).
    const zoneReviewTypeRaw = zoneFmText['discretionary_review_required']
    const zoneReviewType = zoneReviewTypeRaw ? asReviewType(zoneReviewTypeRaw) : undefined

    const result = computeZoneRIS(zoneInputs, fallbacks, pciInputs, zoneCode, zoneName, classification, zoneReviewType)
    zoneResults.push(result)
    logger.info(`Zone ${zoneCode} (${classification}) — DCI ${result.dci} / DCOI ${result.dcoi} / PCI ${result.pci}`)
  }

  if (zoneResults.length === 0) {
    logger.warn('No scoreable zones (need primary or permitted classification).')
    process.exit(0)
  }

  // 6. Average zones → jurisdiction composite.
  // Pass live peer set so CRP reflects current DB scores, not stale hardcoded values.
  const peerSetForCRP = livePeerSet.length > 0 ? livePeerSet : undefined
  const { zoneScores: filledZoneScores, averaged } = averageZoneRIS(zoneResults, jur.slug, peerSetForCRP)

  // 7. Upsert zone_ris_scores
  for (const z of filledZoneScores) {
    const risComposite = computeRIS(z)
    await db
      .insert(zoneRisScores)
      .values({
        jurisdictionId:            jur.id,
        zoneCode:                  z.zoneCode,
        zoneName:                  z.zoneName,
        multifamilyClassification: z.multifamilyClassification,
        risComposite:              risComposite.toString(),
        dci:                       z.dci.toString(),
        dcoi:                      z.dcoi.toString(),
        pci:                       z.pci.toString(),
        crp:                       z.crp.toString(),
      })
      .onConflictDoUpdate({
        target: [zoneRisScores.jurisdictionId, zoneRisScores.zoneCode],
        set: {
          zoneName:                  sql`excluded.zone_name`,
          multifamilyClassification: sql`excluded.multifamily_classification`,
          risComposite:              sql`excluded.ris_composite`,
          dci:                       sql`excluded.dci`,
          dcoi:                      sql`excluded.dcoi`,
          pci:                       sql`excluded.pci`,
          crp:                       sql`excluded.crp`,
          scoredAt:                  sql`now()`,
        },
      })

    // Upsert per-zone feasibility
    const zoneFieldRows = byZone.get(z.zoneCode) ?? []
    const zoneFm2: Record<string, number> = {}
    for (const f of zoneFieldRows) {
      if (f.fieldValue != null) zoneFm2[f.fieldName] = parseNum(f.fieldValue, 0)
    }

    const densityLimitUpa = zoneFm2['density_limit_units_per_acre'] ?? fallbacks.densityLimitUpa
    const parkingMin = zoneFm2['parking_min_spaces_per_unit'] ?? fallbacks.parkingMinSpacesPerUnit

    const feas = computeFeasibility({ densityLimitUpa, parkingMinSpacesPerUnit: parkingMin, regionalMultiplier, fmr2br })

    await db
      .insert(feasibilityOutputs)
      .values({
        jurisdictionId:         jur.id,
        zoneCode:               z.zoneCode,
        maxUnitsPerAcre:        feas.maxUnitsPerAcre.toString(),
        parkingFootprintPct:    feas.parkingFootprintPct.toString(),
        estimatedCostPerUnit:   feas.estimatedCostPerUnit.toString(),
        regionalCostMultiplier: regionalMultiplier.toString(),
        fmr2br:                 fmr2br.toString(),
        rentFeasibilityRatio:   (feas.monthlyCarryingCost / fmr2br).toFixed(3),
      })
      .onConflictDoUpdate({
        target: [feasibilityOutputs.jurisdictionId, feasibilityOutputs.zoneCode],
        set: {
          maxUnitsPerAcre:        sql`excluded.max_units_per_acre`,
          parkingFootprintPct:    sql`excluded.parking_footprint_pct`,
          estimatedCostPerUnit:   sql`excluded.estimated_cost_per_unit`,
          regionalCostMultiplier: sql`excluded.regional_cost_multiplier`,
          fmr2br:                 sql`excluded.fmr_2br`,
          rentFeasibilityRatio:   sql`excluded.rent_feasibility_ratio`,
          scoredAt:               sql`now()`,
        },
      })
  }

  // 8. Upsert ris_scores (jurisdiction-level averaged composite)
  const risComposite = computeRIS(averaged)
  await db
    .insert(risScores)
    .values({
      jurisdictionId: jur.id,
      risComposite:   risComposite.toString(),
      dci:            averaged.dci.toString(),
      dcoi:           averaged.dcoi.toString(),
      pci:            averaged.pci.toString(),
      crp:            averaged.crp.toString(),
      peerSet:        [],
    })
    .onConflictDoUpdate({
      target: risScores.jurisdictionId,
      set: {
        risComposite: sql`excluded.ris_composite`,
        dci:          sql`excluded.dci`,
        dcoi:         sql`excluded.dcoi`,
        pci:          sql`excluded.pci`,
        crp:          sql`excluded.crp`,
        scoredAt:     sql`now()`,
      },
    })

  logger.info(`Jurisdiction avg — RIS ${risComposite} (DCI ${averaged.dci} / DCOI ${averaged.dcoi} / PCI ${averaged.pci} / CRP ${averaged.crp})`)

  // 9. Write ScoresArtifact to data/artifacts/{slug}/{slug}_scores.json
  const store = buildLoadArtifactStore()

  const zoneScoreEntries: ZoneScoreEntry[] = filledZoneScores.map((z) => ({
    zone_code:                 z.zoneCode,
    zone_name:                 z.zoneName,
    multifamily_classification: z.multifamilyClassification,
    ris_composite:             computeRIS(z),
    dci:                       z.dci,
    dcoi:                      z.dcoi,
    pci:                       z.pci,
    crp:                       z.crp,
  }))

  const scoresArtifact: ScoresArtifact = {
    jurisdictionId: jur.id,
    slug:           jur.slug,
    scoredAt:       new Date().toISOString(),
    jurisdiction: {
      ris_composite: risComposite,
      dci:           averaged.dci,
      dcoi:          averaged.dcoi,
      pci:           averaged.pci,
      crp:           averaged.crp,
    },
    zones: zoneScoreEntries,
  }

  await store.writeScores(jur.slug, scoresArtifact)
  logger.info(`Scores artifact written: data/artifacts/${jur.slug}/${jur.slug}_scores.json`)

  console.log(`\nDone.`)
  console.log(`  Zones scored: ${filledZoneScores.length}`)
  console.log(`  RIS composite: ${risComposite}`)

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
