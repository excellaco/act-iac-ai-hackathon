/**
 * E0-130: Page-resolve stage CLI
 *
 * Reads the parsed-pages artifact for each jurisdiction and updates
 * source_page on extracted_fields rows where the verbatim field_value_text
 * quote can be located in the PDF text.
 *
 * Must be run after pipeline:extract (which writes the parsed-pages artifact).
 *
 * Usage:
 *   npm run pipeline:page-resolve                    # all real jurisdictions
 *   npm run pipeline:page-resolve arlington_va       # one jurisdiction by slug prefix
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { runPageResolveStage, runZonePageResolveStage } from '../lib/pipeline/page-resolver'
import { buildArtifactStore } from '../lib/pipeline/artifact-store'

const ALL_REAL_JURISDICTION_IDS = ['fairfax_va', 'arlington_va', 'loudoun_va']

function resolveJurisdiction(arg: string, allJurisdictions: { id: string; slug: string; name: string; displayName: string }[]) {
  const exact = allJurisdictions.find((j) => j.slug === arg)
  if (exact) return { jur: exact }
  const prefix = arg.split(/[_-]/)[0]
  const byName = allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase()))
  if (byName) return { jur: byName }
  return null
}

async function main() {
  const targetArg = process.argv[2]
  const args = targetArg ? [targetArg] : ALL_REAL_JURISDICTION_IDS

  const allJurisdictions = await db.select().from(jurisdictions)
  const store = buildArtifactStore()

  console.log(`\nParcella — page-resolve stage`)
  console.log(`Artifact: ${process.env.RAW_DATA_BUCKET ? `GCS (zoning/{slug}/extractions/parsed-pages.json)` : 'local (data/extractions/)'}`)
  console.log(`Target:   ${args.join(', ')}\n`)

  for (const arg of args) {
    console.log(`── ${arg}`)

    const resolved = resolveJurisdiction(arg, allJurisdictions)
    if (!resolved) {
      console.error(`   ✗ Jurisdiction not found in DB for: ${arg}`)
      continue
    }
    const { jur } = resolved

    console.log(`   jurisdiction: ${jur.displayName} (slug: ${jur.slug})`)

    const logger = {
      info: (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
      warn: (msg: string, ctx?: object) => console.warn(`   ⚠ ${msg}`, ctx ?? ''),
      error: (msg: string, ctx?: object) => console.error(`   ✗ ${msg}`, ctx ?? ''),
    }

    try {
      const { resolved: r, unresolved: u } = await runPageResolveStage(db, jur.id, jur.slug, store, logger)
      console.log(`   jurisdiction resolved:   ${r}`)
      console.log(`   jurisdiction unresolved: ${u}`)
    } catch (err) {
      console.error(`   ✗ ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const { resolved: r, unresolved: u } = await runZonePageResolveStage(db, jur.id, jur.slug, store, logger)
      console.log(`   zone resolved:   ${r}`)
      console.log(`   zone unresolved: ${u}`)
    } catch (err) {
      console.error(`   ✗ ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log()
  }

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
