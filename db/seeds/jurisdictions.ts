import { db } from '../client'
import { jurisdictions } from '../schema'

const MVP_JURISDICTIONS = [
  { name: 'Fairfax County',   state: 'VA', fipsState: '51', fipsCounty: '059', displayName: 'Fairfax County, VA' },
  { name: 'Arlington County', state: 'VA', fipsState: '51', fipsCounty: '013', displayName: 'Arlington County, VA' },
  { name: 'Loudoun County',   state: 'VA', fipsState: '51', fipsCounty: '107', displayName: 'Loudoun County, VA' },
]

async function seed() {
  console.log('Seeding jurisdictions...')
  for (const j of MVP_JURISDICTIONS) {
    await db.insert(jurisdictions)
      .values(j)
      .onConflictDoNothing()
    console.log(`  ✓ ${j.displayName}`)
  }
  console.log('Done.')
  process.exit(0)
}

seed().catch((err) => { console.error(err); process.exit(1) })
