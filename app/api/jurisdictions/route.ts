import { NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions, risScores } from '@/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const rows = await db
    .select({
      id: jurisdictions.id,
      name: jurisdictions.name,
      state: jurisdictions.state,
      displayName: jurisdictions.displayName,
      dataType: jurisdictions.dataType,
      risComposite: risScores.risComposite,
    })
    .from(jurisdictions)
    .leftJoin(risScores, eq(jurisdictions.id, risScores.jurisdictionId))
    .orderBy(jurisdictions.displayName)

  return NextResponse.json(rows)
}
