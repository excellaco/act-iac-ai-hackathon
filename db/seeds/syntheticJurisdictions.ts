import { db } from '../client'
import { jurisdictions, risScores } from '../schema'
import { eq } from 'drizzle-orm'
import { computeRIS } from '../../lib/scoring'

// ~7 synthetic jurisdictions to expand the CRP peer comparison set.
// All values are plausible but fabricated — not from official zoning sources.
const SYNTHETIC_JURISDICTIONS = [
  { name: 'Montgomery County',    state: 'MD', fipsState: '24', fipsCounty: '031', displayName: 'Montgomery County, MD' },
  { name: "Prince George's County", state: 'MD', fipsState: '24', fipsCounty: '033', displayName: "Prince George's County, MD" },
  { name: 'Alexandria City',      state: 'VA', fipsState: '51', fipsCounty: '510', displayName: 'Alexandria City, VA' },
  { name: 'Prince William County', state: 'VA', fipsState: '51', fipsCounty: '153', displayName: 'Prince William County, VA' },
  { name: 'Stafford County',      state: 'VA', fipsState: '51', fipsCounty: '179', displayName: 'Stafford County, VA' },
  { name: 'Frederick County',     state: 'VA', fipsState: '51', fipsCounty: '069', displayName: 'Frederick County, VA' },
  { name: 'Howard County',        state: 'MD', fipsState: '24', fipsCounty: '027', displayName: 'Howard County, MD' },
]

const SYNTHETIC_SCORES: Record<string, { dci: number; dcoi: number; pci: number; crp: number }> = {
  '24-031': { dci: 65, dcoi: 65, pci: 55, crp: 70 }, // Montgomery County, MD
  '24-033': { dci: 50, dcoi: 55, pci: 45, crp: 50 }, // Prince George's County, MD
  '51-510': { dci: 35, dcoi: 60, pci: 30, crp: 35 }, // Alexandria City, VA
  '51-153': { dci: 70, dcoi: 45, pci: 55, crp: 65 }, // Prince William County, VA
  '51-179': { dci: 85, dcoi: 40, pci: 65, crp: 75 }, // Stafford County, VA
  '51-069': { dci: 75, dcoi: 35, pci: 50, crp: 70 }, // Frederick County, VA
  '24-027': { dci: 60, dcoi: 70, pci: 60, crp: 60 }, // Howard County, MD
}

export async function seedSyntheticJurisdictions() {
  console.log('Seeding synthetic jurisdictions...')

  for (const j of SYNTHETIC_JURISDICTIONS) {
    const [inserted] = await db
      .insert(jurisdictions)
      .values({ ...j, dataType: 'synthetic' })
      .onConflictDoNothing()
      .returning()

    // If onConflictDoNothing skipped insertion, look up the existing record
    const record = inserted ?? (await db.query.jurisdictions.findFirst({
      where: eq(jurisdictions.displayName, j.displayName),
    }))

    if (!record) continue

    const subScores = SYNTHETIC_SCORES[`${j.fipsState}-${j.fipsCounty}`]
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

    console.log(`  ✓ ${j.displayName} (synthetic) — RIS ${risComposite}`)
  }

  console.log('Done.')
}

if (require.main === module) {
  seedSyntheticJurisdictions()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1) })
}
