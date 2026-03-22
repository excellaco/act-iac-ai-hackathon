/**
 * @deprecated Scores for real jurisdictions are now computed by scripts/score-zones.ts
 * (E2-155). Running score-zones.ts will overwrite these seeded values with
 * pipeline-extracted per-zone and averaged scores. This file is retained for
 * local dev bootstrapping only — do not add new score values here.
 */
import { db } from '../client'
import { jurisdictions, risScores } from '../schema'
import { eq } from 'drizzle-orm'
import { computeRIS } from '../../lib/scoring'

// RIS scores for the 3 real demo jurisdictions (Fairfax, Arlington, Loudoun).
// DEPRECATED: Run scripts/score-zones.ts instead.
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
