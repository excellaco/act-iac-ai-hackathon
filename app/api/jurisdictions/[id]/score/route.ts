import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions, risScores, extractedFields, feasibilityOutputs, marketData } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

  const feasibility = await db.query.feasibilityOutputs.findFirst({
    where: eq(feasibilityOutputs.jurisdictionId, id),
  })

  const market = await db.query.marketData.findFirst({
    where: eq(marketData.jurisdictionId, id),
  })

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
  })
}
