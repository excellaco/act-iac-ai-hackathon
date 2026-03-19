/**
 * E0-8: Load stage CLI
 *
 * Reads an extraction artifact and writes results to the database.
 * No Gemini calls — re-runnable against any artifact, including hand-authored
 * synthetic ones in data/extractions/.
 *
 * Usage:
 *   npm run pipeline:load                    # all jurisdictions with artifacts
 *   npm run pipeline:load arlington_va       # one jurisdiction by slug prefix
 *   npm run pipeline:load montgomery-md      # synthetic jurisdiction by slug
 *
 * Reads from:
 *   GCS:   gs://{RAW_DATA_BUCKET}/zoning/{slug}/extractions/latest.json  (if RAW_DATA_BUCKET set)
 *   Local: data/extractions/{slug}.json  (if RAW_DATA_BUCKET unset)
 *
 * To load synthetic artifacts (always local), run without RAW_DATA_BUCKET set.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { runLoadStage } from '../lib/pipeline/runner'
import { buildArtifactStore } from '../lib/pipeline/artifact-store'
import { consoleLogger } from '../lib/pipeline/errors'

const ALL_REAL_SLUGS = ['fairfax-va', 'arlington-va', 'loudoun-va']
const ALL_SYNTHETIC_SLUGS = [
  'montgomery-md',
  'prince-georges-md',
  'alexandria-va',
  'prince-william-va',
  'stafford-va',
  'frederick-va',
  'howard-md',
]

async function main() {
  const targetArg = process.argv[2]

  // Resolve slugs to load
  let slugs: string[]
  if (targetArg) {
    // Accept both slug format (fairfax-va) and jurisdiction_id format (fairfax_va)
    slugs = [targetArg.replace(/_/g, '-')]
  } else {
    // Default: all real jurisdictions (not synthetic — those are loaded explicitly)
    slugs = ALL_REAL_SLUGS
  }

  const allJurisdictions = await db.select().from(jurisdictions)
  const store = buildArtifactStore()

  console.log(`\nParcela — load stage`)
  console.log(`Artifact: ${process.env.RAW_DATA_BUCKET ? `GCS (zoning/{slug}/extractions/latest.json)` : 'local (data/extractions/)'}`)
  console.log(`Target:   ${slugs.join(', ')}\n`)

  for (const slug of slugs) {
    console.log(`── ${slug}`)

    // Resolve jurisdiction UUID from DB by slug
    const jur = allJurisdictions.find((j) => j.slug === slug)
    if (!jur) {
      console.error(`   ✗ Jurisdiction not found in DB for slug: ${slug}`)
      console.error(`     Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
      console.error(`     Run npm run db:seed first.`)
      continue
    }

    // Read artifact
    let artifact
    try {
      artifact = await store.read(slug)
    } catch (err) {
      console.error(`   ✗ ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    const result = await runLoadStage(db, jur.id, artifact, {
      info: (msg, ctx) => console.log(`   ${msg}`, ctx ?? ''),
      warn: (msg, ctx) => console.warn(`   ⚠ ${msg}`, ctx ?? ''),
      error: (msg, ctx) => console.error(`   ✗ ${msg}`, ctx ?? ''),
    })

    console.log(`   status:           ${result.run.status}`)
    console.log(`   fields extracted: ${result.fieldsExtracted}`)
    console.log(`   fields failed:    ${result.fieldsFailed}`)
    if (result.errors.length > 0) {
      for (const e of result.errors) {
        console.error(`   ✗ ${e.fieldName}: ${e.message}`)
      }
    }
    console.log()
  }

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })

// Export ALL_SYNTHETIC_SLUGS so callers can reference the full list
export { ALL_REAL_SLUGS, ALL_SYNTHETIC_SLUGS }
