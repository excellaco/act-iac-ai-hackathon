import { db } from '../client'
import { jurisdictions } from '../schema'

const MVP_JURISDICTIONS = [
  { name: 'Fairfax County',   state: 'VA', fipsState: '51', fipsCounty: '059', displayName: 'Fairfax County, VA',   slug: 'fairfax_va' },
  { name: 'Arlington County', state: 'VA', fipsState: '51', fipsCounty: '013', displayName: 'Arlington County, VA', slug: 'arlington_va' },
  { name: 'Loudoun County',   state: 'VA', fipsState: '51', fipsCounty: '107', displayName: 'Loudoun County, VA',   slug: 'loudoun_va' },
]

async function seed() {
  console.log('Seeding jurisdictions...')
  for (const j of MVP_JURISDICTIONS) {
    await db.insert(jurisdictions)
      .values(j)
      .onConflictDoUpdate({ target: [jurisdictions.fipsState, jurisdictions.fipsCounty], set: { slug: j.slug } })
    console.log(`  ✓ ${j.displayName}`)
  }
  console.log('Done.')
  process.exit(0)
}

seed().catch((err) => { console.error(err); process.exit(1) })
