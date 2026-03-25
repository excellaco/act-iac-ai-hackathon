import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions, risScores, extractedFields, feasibilityOutputs, marketData, zoneExtractedFields, zoneRisScores } from '@/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import type { InferSelectModel } from 'drizzle-orm'

type ZoneScoreRow = InferSelectModel<typeof zoneRisScores>
type FeasibilityRow = InferSelectModel<typeof feasibilityOutputs>

type ZoneCitations = Record<string, { fieldValueText: string | null; sourceSection: string | null; sourcePage: number | null; confidence: string | null; reasoning: string | null; fieldValue: string | null }>

function buildZoneScoreRow(
  zs: ZoneScoreRow,
  fieldsObj: Record<string, string | null>,
  citationsObj: ZoneCitations,
  zoneFeasibility: FeasibilityRow | undefined,
) {
  return {
    zoneCode: zs.zoneCode,
    zoneName: zs.zoneName,
    multifamilyClassification: zs.multifamilyClassification,
    dci: zs.dci,
    dcoi: zs.dcoi,
    pci: zs.pci,
    crp: zs.crp,
    risComposite: zs.risComposite,
    fields: fieldsObj,
    citations: citationsObj,
    feasibility: zoneFeasibility
      ? {
          maxUnitsPerAcre:      zoneFeasibility.maxUnitsPerAcre,
          parkingFootprintPct:  zoneFeasibility.parkingFootprintPct,
          estimatedCostPerUnit: zoneFeasibility.estimatedCostPerUnit,
          fmr2br:               zoneFeasibility.fmr2br,
        }
      : null,
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(jurisdictions.id, id),
  })

  if (!jurisdiction) {
    return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 })
  }

  const score = await db.query.risScores.findFirst({
    where: eq(risScores.jurisdictionId, id),
  })

  const fields = await db
    .select()
    .from(extractedFields)
    .where(eq(extractedFields.jurisdictionId, id))

  // Jurisdiction-level feasibility (__avg__ zone code)
  const feasibility = await db.query.feasibilityOutputs.findFirst({
    where: and(eq(feasibilityOutputs.jurisdictionId, id), eq(feasibilityOutputs.zoneCode, '__avg__')),
  })

  const market = await db.query.marketData.findFirst({
    where: eq(marketData.jurisdictionId, id),
  })

  // Most recent zoning extraction date — used for data vintage disclosure.
  // Prefer zone field extraction date; fall back to jurisdiction-level field date.
  const latestZoneField = await db
    .select({ extractedAt: zoneExtractedFields.extractedAt })
    .from(zoneExtractedFields)
    .where(eq(zoneExtractedFields.jurisdictionId, id))
    .orderBy(desc(zoneExtractedFields.extractedAt))
    .limit(1)
    .then((rows) => rows[0] ?? null)

  const latestField = !latestZoneField
    ? await db
        .select({ extractedAt: extractedFields.extractedAt })
        .from(extractedFields)
        .where(eq(extractedFields.jurisdictionId, id))
        .orderBy(desc(extractedFields.extractedAt))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null

  const zoningExtractedAt = latestZoneField?.extractedAt ?? latestField?.extractedAt ?? null

  // Zone scores (E2-155) — empty array for synthetic/pre-zone jurisdictions
  const zoneScoreRows = await db
    .select()
    .from(zoneRisScores)
    .where(eq(zoneRisScores.jurisdictionId, id))

  // Build zoneScores response — batch fetch fields and feasibility to avoid N+1
  let zoneScores: ReturnType<typeof buildZoneScoreRow>[] = []
  if (zoneScoreRows.length > 0) {
    const zoneCodes = zoneScoreRows.map((zs) => zs.zoneCode)

    const [allZoneFields, allZoneFeasibility] = await Promise.all([
      db.select().from(zoneExtractedFields).where(
        and(eq(zoneExtractedFields.jurisdictionId, id), inArray(zoneExtractedFields.zoneCode, zoneCodes))
      ),
      db.select().from(feasibilityOutputs).where(
        and(eq(feasibilityOutputs.jurisdictionId, id), inArray(feasibilityOutputs.zoneCode, zoneCodes))
      ),
    ])

    const fieldsByZone = new Map<string, typeof allZoneFields>()
    for (const f of allZoneFields) {
      const arr = fieldsByZone.get(f.zoneCode) ?? []
      arr.push(f)
      fieldsByZone.set(f.zoneCode, arr)
    }

    const feasibilityByZone = new Map(allZoneFeasibility.map((f) => [f.zoneCode, f]))

    zoneScores = zoneScoreRows.map((zs) => {
      const zFields = fieldsByZone.get(zs.zoneCode) ?? []
      const zoneFeasibility = feasibilityByZone.get(zs.zoneCode)

      const fieldsObj: Record<string, string | null> = {}
      const citationsObj: ZoneCitations = {}
      for (const f of zFields) {
        fieldsObj[f.fieldName] = f.fieldValue
        citationsObj[f.fieldName] = {
          fieldValueText: f.fieldValueText ?? null,
          sourceSection: f.sourceSection ?? null,
          sourcePage: f.sourcePage ?? null,
          confidence: f.confidence ?? null,
          reasoning: f.reasoning ?? null,
          fieldValue: f.fieldValue ?? null,
        }
      }

      return buildZoneScoreRow(zs, fieldsObj, citationsObj, zoneFeasibility)
    })
  }

  return NextResponse.json({
    jurisdiction,
    score,
    extractedFields: fields.map((f) => ({
      ...f,
      reasoning: f.reasoning ?? null,
    })),
    feasibility: feasibility
      ? {
          maxUnitsPerAcre:     feasibility.maxUnitsPerAcre,
          parkingFootprintPct: feasibility.parkingFootprintPct,
          estimatedCostPerUnit: feasibility.estimatedCostPerUnit,
          fmr2br:              feasibility.fmr2br,
        }
      : null,
    marketData: market
      ? {
          fmr2br:             market.fmr2br,
          permits5plus:       market.permits5plus,
          totalPermits:       market.totalPermits,
          fmrVintage:         market.fmrVintage,
          permitsVintage:     market.permitsVintage,
          retrievedAt:        market.retrievedAt,
          zoningExtractedAt:  zoningExtractedAt,
        }
      : null,
    zoneScores,
  })
}
