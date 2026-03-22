import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions, risScores, extractedFields, feasibilityOutputs, marketData, zoneExtractedFields, zoneRisScores } from '@/db/schema'
import { eq, and, ne } from 'drizzle-orm'

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

  // Zone scores (E2-155) — empty array for synthetic/pre-zone jurisdictions
  const zoneScoreRows = await db
    .select()
    .from(zoneRisScores)
    .where(eq(zoneRisScores.jurisdictionId, id))

  // Build zoneScores response — include per-zone fields and feasibility
  const zoneScores = await Promise.all(
    zoneScoreRows.map(async (zs) => {
      const zFields = await db
        .select()
        .from(zoneExtractedFields)
        .where(and(eq(zoneExtractedFields.jurisdictionId, id), eq(zoneExtractedFields.zoneCode, zs.zoneCode)))

      const zoneFeasibility = await db.query.feasibilityOutputs.findFirst({
        where: and(eq(feasibilityOutputs.jurisdictionId, id), eq(feasibilityOutputs.zoneCode, zs.zoneCode)),
      })

      const fieldsObj: Record<string, string | null> = {}
      for (const f of zFields) {
        fieldsObj[f.fieldName] = f.fieldValue
      }

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
        feasibility: zoneFeasibility
          ? {
              maxUnitsPerAcre:      zoneFeasibility.maxUnitsPerAcre,
              parkingFootprintPct:  zoneFeasibility.parkingFootprintPct,
              estimatedCostPerUnit: zoneFeasibility.estimatedCostPerUnit,
              fmr2br:               zoneFeasibility.fmr2br,
            }
          : null,
      }
    }),
  )

  return NextResponse.json({
    jurisdiction,
    score,
    extractedFields: fields,
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
          fmr2br:       market.fmr2br,
          permits5plus: market.permits5plus,
          totalPermits: market.totalPermits,
        }
      : null,
    zoneScores,
  })
}
