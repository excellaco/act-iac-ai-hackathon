import { db } from '../client'
import { jurisdictions, risScores } from '../schema'
import { eq } from 'drizzle-orm'
import { computeRIS } from '../../lib/scoring'

// RIS scores for the 3 real demo jurisdictions (Fairfax, Arlington, Loudoun).
// These mirror the mock data in lib/mockData.ts and will be replaced by
// pipeline-extracted values once E2/E3 stories are complete.
const REAL_SCORES: Record<string, { dci: number; dcoi: number; pci: number; crp: number }> = {
  'Fairfax County, VA':   { dci: 75, dcoi: 70, pci: 65, crp: 80 },
  'Arlington County, VA': { dci: 40, dcoi: 50, pci: 35, crp: 45 },
  'Loudoun County, VA':   { dci: 80, dcoi: 55, pci: 60, crp: 60 },
}

export async function seedRealScores() {
  console.log('Seeding RIS scores for real jurisdictions...')

  for (const [displayName, subScores] of Object.entries(REAL_SCORES)) {
    const record = await db.query.jurisdictions.findFirst({
      where: eq(jurisdictions.displayName, displayName),
    })

    if (!record) {
      console.warn(`  ⚠ Jurisdiction not found: ${displayName} — run jurisdictions seed first`)
      continue
    }

    const risComposite = computeRIS(subScores)

    await db
      .insert(risScores)
      .values({
        jurisdictionId: record.id,
        risComposite: risComposite.toString(),
        dci: subScores.dci.toString(),
        dcoi: subScores.dcoi.toString(),
        pci: subScores.pci.toString(),
        crp: subScores.crp.toString(),
        peerSet: [],
      })
      .onConflictDoNothing()

    console.log(`  ✓ ${displayName} — RIS ${risComposite}`)
  }

  console.log('Done.')
}

if (require.main === module) {
  seedRealScores()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1) })
}
