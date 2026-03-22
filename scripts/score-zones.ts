/**
 * E2-155: Zone-level scoring script
 *
 * Reads zone_extracted_fields grouped by zone_code, scores each zone using
 * computeZoneRIS(), averages primary+permitted zones into the jurisdiction RIS
 * via averageZoneRIS(), and writes results to zone_ris_scores, ris_scores, and
 * feasibility_outputs.
 *
 * Usage:
 *   npm run score:zones              # all real jurisdictions
 *   npm run score:zones fairfax      # one jurisdiction by slug prefix
 *
 * Chainable after pipeline:load to produce fully scored zone data.
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { db } from '../db/client'
import { jurisdictions, extractedFields, marketData, zoneExtractedFields, zoneRisScores, risScores, feasibilityOutputs } from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { computeZoneRIS, averageZoneRIS, REGIONAL_MULTIPLIERS, DEFAULT_REGIONAL_MULTIPLIER } from '../lib/scoringEngine'
import { computeFeasibility } from '../lib/feasibility'
import { computeRIS } from '../lib/scoring'
import type { ReviewType } from '../lib/scoringEngine'

const REAL_JURISDICTION_SLUGS = ['fairfax', 'arlington', 'loudoun']

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

function asReviewType(v: string | null | undefined): ReviewType {
  if (v === 'by_right' || v === 'by-right') return 'by-right'
  if (v === 'conditional_use_permit' || v === 'conditional-use-permit') return 'conditional-use-permit'
  if (v === 'special_use_permit' || v === 'special-use-permit') return 'special-use-permit'
  return 'conditional-use-permit' // safe fallback
}

async function scoreJurisdiction(jurisdictionId: string, slug: string): Promise<void> {
  console.log(`\n── ${slug}`)

  // 1. Load jurisdiction-level extracted fields (fallbacks for missing zone fields)
  const jFields = await db.select().from(extractedFields).where(eq(extractedFields.jurisdictionId, jurisdictionId))
  const fieldMap: Record<string, number | string | null> = {}
  for (const f of jFields) {
    fieldMap[f.fieldName] = f.fieldValue != null ? parseNum(f.fieldValue, 0) : f.fieldValueText
  }

  // 2. Load market data
  const market = await db.query.marketData.findFirst({ where: eq(marketData.jurisdictionId, jurisdictionId) })
  const fmr2br = parseNum(market?.fmr2br, 1800)
  const permits5plus = market?.permits5plus ?? 500
  const totalPermits = market?.totalPermits ?? 1000
  const regionalMultiplier = REGIONAL_MULTIPLIERS[slug] ?? DEFAULT_REGIONAL_MULTIPLIER

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
    slug,
  }

  const pciInputs = {
    permits5plus,
    totalPermits,
    discretionaryReviewType: fallbacks.discretionaryReviewType,
  }

  // 3. Load zone extracted fields
  const zFields = await db.select().from(zoneExtractedFields).where(eq(zoneExtractedFields.jurisdictionId, jurisdictionId))

  if (zFields.length === 0) {
    console.log(`   ⚠ No zone fields found — skipping zone scoring (run pipeline:extract first)`)
    return
  }

  // Group by zone_code
  const byZone = new Map<string, typeof zFields>()
  for (const f of zFields) {
    const arr = byZone.get(f.zoneCode) ?? []
    arr.push(f)
    byZone.set(f.zoneCode, arr)
  }

  console.log(`   zones found: ${byZone.size}`)

  // 4. Score each zone
  const zoneResults = []
  for (const [zoneCode, fields] of byZone) {
    const zoneFm: Record<string, number> = {}
    for (const f of fields) {
      if (f.fieldValue != null) zoneFm[f.fieldName] = parseNum(f.fieldValue, 0)
    }

    const classification = fields[0].multifamilyClassification
    const zoneName = fields[0].zoneName ?? null

    // Only score primary and permitted zones.
    // 'limited' and 'none' zones are stored in zone_extracted_fields (for
    // completeness and chat agent access) but excluded from zone_ris_scores
    // because they don't contribute to the jurisdiction-level RIS average.
    // The score API returns all zone_ris_scores rows; the ZoneSelector lists
    // only scored zones. This is intentional — zones with no multifamily
    // allowance don't affect housing supply capacity and should not dilute the score.
    if (classification !== 'primary' && classification !== 'permitted') {
      console.log(`   ○ ${zoneCode} (${classification}) — not scored (limited/none zones excluded from RIS)`)
      continue
    }

    const zoneInputs = {
      minLotSizeSqft:          zoneFm['min_lot_size_sqft'],
      heightLimitFt:           zoneFm['height_limit_ft'],
      densityLimitUpa:         zoneFm['density_limit_units_per_acre'],
      parkingMinSpacesPerUnit: zoneFm['parking_min_spaces_per_unit'],
      setbackFrontFt:          zoneFm['setback_front_ft'],
      setbackSideFt:           zoneFm['setback_side_ft'],
      setbackRearFt:           zoneFm['setback_rear_ft'],
    }

    const result = computeZoneRIS(zoneInputs, fallbacks, pciInputs, zoneCode, zoneName, classification)
    zoneResults.push(result)
    console.log(`   ✓ ${zoneCode} (${classification}) — DCI ${result.dci} / DCOI ${result.dcoi} / PCI ${result.pci}`)
  }

  if (zoneResults.length === 0) {
    console.log(`   ⚠ No scoreable zones (need primary or permitted classification)`)
    return
  }

  // 5. Average zones → get filled CRP + jurisdiction composite
  const { zoneScores: filledZoneScores, averaged } = averageZoneRIS(zoneResults, slug)

  // 6. Upsert zone_ris_scores
  for (const z of filledZoneScores) {
    const risComposite = computeRIS(z)
    await db
      .insert(zoneRisScores)
      .values({
        jurisdictionId:            jurisdictionId,
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

    // 7. Upsert per-zone feasibility
    const zoneFields = byZone.get(z.zoneCode) ?? []
    const zoneFm: Record<string, number> = {}
    for (const f of zoneFields) {
      if (f.fieldValue != null) zoneFm[f.fieldName] = parseNum(f.fieldValue, 0)
    }

    const densityLimitUpa = zoneFm['density_limit_units_per_acre'] ?? fallbacks.densityLimitUpa
    const parkingMin = zoneFm['parking_min_spaces_per_unit'] ?? fallbacks.parkingMinSpacesPerUnit

    const feas = computeFeasibility({ densityLimitUpa, parkingMinSpacesPerUnit: parkingMin, regionalMultiplier, fmr2br })

    await db
      .insert(feasibilityOutputs)
      .values({
        jurisdictionId:        jurisdictionId,
        zoneCode:              z.zoneCode,
        maxUnitsPerAcre:       feas.maxUnitsPerAcre.toString(),
        parkingFootprintPct:   feas.parkingFootprintPct.toString(),
        estimatedCostPerUnit:  feas.estimatedCostPerUnit.toString(),
        regionalCostMultiplier: regionalMultiplier.toString(),
        fmr2br:                fmr2br.toString(),
        rentFeasibilityRatio:  (feas.monthlyCarryingCost / fmr2br).toFixed(3),
      })
      .onConflictDoUpdate({
        target: [feasibilityOutputs.jurisdictionId, feasibilityOutputs.zoneCode],
        set: {
          maxUnitsPerAcre:       sql`excluded.max_units_per_acre`,
          parkingFootprintPct:   sql`excluded.parking_footprint_pct`,
          estimatedCostPerUnit:  sql`excluded.estimated_cost_per_unit`,
          regionalCostMultiplier: sql`excluded.regional_cost_multiplier`,
          fmr2br:                sql`excluded.fmr_2br`,
          rentFeasibilityRatio:  sql`excluded.rent_feasibility_ratio`,
          scoredAt:              sql`now()`,
        },
      })
  }

  // 8. Update ris_scores with zone-averaged composite (backward-compatible jurisdiction-level score)
  const risComposite = computeRIS(averaged)
  await db
    .insert(risScores)
    .values({
      jurisdictionId: jurisdictionId,
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

  console.log(`   ✓ jurisdiction avg — RIS ${risComposite} (DCI ${averaged.dci} / DCOI ${averaged.dcoi} / PCI ${averaged.pci} / CRP ${averaged.crp})`)
}

async function main() {
  const targetArg = process.argv[2]
  const allJurisdictions = await db.select().from(jurisdictions)

  const targets = targetArg
    ? allJurisdictions.filter((j) => j.slug.startsWith(targetArg) || j.name.toLowerCase().startsWith(targetArg.toLowerCase()))
    : allJurisdictions.filter((j) => REAL_JURISDICTION_SLUGS.includes(j.slug))

  if (targets.length === 0) {
    console.error(`No jurisdictions matched: ${targetArg}`)
    console.error(`Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    process.exit(1)
  }

  console.log(`\nParcela — score:zones`)
  console.log(`Scoring ${targets.length} jurisdiction(s)…`)

  for (const j of targets) {
    await scoreJurisdiction(j.id, j.slug)
  }

  console.log('\nDone.')
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
