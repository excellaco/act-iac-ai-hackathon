/**
 * Pipeline — Purge Jurisdiction Data
 *
 * Deletes all zone extracted fields, RIS scores, and feasibility outputs
 * for a jurisdiction.  Use this before re-loading a jurisdiction to remove
 * stale zone data that would otherwise persist alongside freshly-loaded zones.
 *
 * Usage:
 *   npm run pipeline:purge <jurisdiction_slug>
 *   npm run pipeline:purge arlington_va
 */

import { db } from '../db/client'
import { jurisdictions, zoneExtractedFields, zoneRisScores, feasibilityOutputs } from '../db/schema'
import { eq } from 'drizzle-orm'

const slug = process.argv[2]
if (!slug) {
  console.error('Usage: npm run pipeline:purge <jurisdiction_slug>')
  process.exit(1)
}

async function main() {
  console.log(`\nParcela — pipeline:purge`)
  console.log(`Slug:     ${slug}\n`)

  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = allJurisdictions.find((j) => j.slug === slug)
    ?? allJurisdictions.find((j) => j.name.toLowerCase().startsWith(slug.split(/[_-]/)[0].toLowerCase()))

  if (!jur) {
    console.error(`Jurisdiction not found for slug: ${slug}`)
    process.exit(1)
  }

  console.log(`   Jurisdiction: ${jur.displayName} (${jur.id}) `)

  const deletedFo = await db.delete(feasibilityOutputs).where(eq(feasibilityOutputs.jurisdictionId, jur.id)).returning()
  const deletedRs = await db.delete(zoneRisScores).where(eq(zoneRisScores.jurisdictionId, jur.id)).returning()
  const deletedEf = await db.delete(zoneExtractedFields).where(eq(zoneExtractedFields.jurisdictionId, jur.id)).returning()

  console.log(`\nPurge complete for ${jur.displayName}:`)
  console.log(`  feasibility_outputs deleted:     ${deletedFo.length}`)
  console.log(`  zone_ris_scores deleted:         ${deletedRs.length}`)
  console.log(`  zone_extracted_fields deleted:   ${deletedEf.length}`)
  console.log(`\nNext step: npm run pipeline:load ${slug}`)

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
