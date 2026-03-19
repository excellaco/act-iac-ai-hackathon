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

const ALL_REAL_JURISDICTION_IDS = ['fairfax_va', 'arlington_va', 'loudoun_va']
const ALL_SYNTHETIC_SLUGS = [
  'montgomery-md',
  'prince-georges-md',
  'alexandria-va',
  'prince-william-va',
  'stafford-va',
  'frederick-va',
  'howard-md',
]

/** Resolve a CLI arg (e.g. 'fairfax_va' or 'montgomery-md') to a DB jurisdiction record. */
function resolveJurisdiction(arg: string, allJurisdictions: { id: string; slug: string; name: string; displayName: string }[]) {
  // Exact slug match first (covers synthetic slugs that match DB directly)
  const exact = allJurisdictions.find((j) => j.slug === arg)
  if (exact) return { jur: exact, artifactSlug: exact.slug }

  // Name-prefix match: 'fairfax_va' → prefix 'fairfax', 'montgomery-md' → prefix 'montgomery'
  const prefix = arg.split(/[_-]/)[0]
  const byName = allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase()))
  if (byName) return { jur: byName, artifactSlug: byName.slug }

  return null
}

async function main() {
  const targetArg = process.argv[2]

  // Resolve args to load
  const args = targetArg ? [targetArg] : ALL_REAL_JURISDICTION_IDS

  const allJurisdictions = await db.select().from(jurisdictions)
  const store = buildArtifactStore()

  console.log(`\nParcela — load stage`)
  console.log(`Artifact: ${process.env.RAW_DATA_BUCKET ? `GCS (zoning/{slug}/extractions/latest.json)` : 'local (data/extractions/)'}`)
  console.log(`Target:   ${args.join(', ')}\n`)

  for (const arg of args) {
    console.log(`── ${arg}`)

    // Resolve jurisdiction UUID from DB by name-prefix or exact slug
    const resolved = resolveJurisdiction(arg, allJurisdictions)
    if (!resolved) {
      console.error(`   ✗ Jurisdiction not found in DB for: ${arg}`)
      console.error(`     Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
      console.error(`     Run npm run db:seed first.`)
      continue
    }
    const { jur, artifactSlug } = resolved

    // Read artifact (using DB slug as the key)
    let artifact
    try {
      artifact = await store.read(artifactSlug)
    } catch (err) {
      console.error(`   ✗ ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    console.log(`   jurisdiction:     ${jur.displayName} (slug: ${jur.slug})`)
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

// Export slug lists so callers can reference them
export { ALL_REAL_JURISDICTION_IDS, ALL_SYNTHETIC_SLUGS }
