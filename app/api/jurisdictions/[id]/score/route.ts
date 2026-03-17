import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions, risScores, extractedFields } from '@/db/schema'
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

  return NextResponse.json({ jurisdiction, score, extractedFields: fields })
}
