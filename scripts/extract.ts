/**
 * E0-8: Extract stage CLI
 *
 * Fetches a zoning PDF, runs Gemini extraction, and writes a JSON artifact.
 * No database writes — requires only GOOGLE_CLOUD_PROJECT + RAW_DATA_BUCKET (or local PDFs).
 *
 * Usage:
 *   npm run pipeline:extract                    # all 3 jurisdictions
 *   npm run pipeline:extract arlington_va       # one jurisdiction
 *
 * Output:
 *   GCS:   gs://{RAW_DATA_BUCKET}/zoning/{slug}/extractions/latest.json
 *   Local: data/extractions/{slug}.json
 *
 * Run load.ts afterwards to write results to the database.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { runExtractStage } from '../lib/pipeline/runner'
import { GcsFetcher } from '../lib/pipeline/gcs-fetcher'
import { LocalFetcher } from '../lib/pipeline/local-fetcher'
import { PdfParserImpl } from '../lib/pipeline/pdf-parser'
import { buildZoneAwareExtractors } from '../lib/extractors/index'
import { buildArtifactStore } from '../lib/pipeline/artifact-store'

const ALL_JURISDICTION_IDS = ['fairfax_va', 'arlington_va', 'loudoun_va']

async function main() {
  const targetArg = process.argv[2]
  const targets = targetArg ? [targetArg] : ALL_JURISDICTION_IDS

  const allJurisdictions = await db.select().from(jurisdictions)

  const fetcher = process.env.RAW_DATA_BUCKET ? new GcsFetcher() : new LocalFetcher()
  const parser = new PdfParserImpl()
  const extractors = buildZoneAwareExtractors()
  const store = buildArtifactStore()

  console.log(`\nParcela — extract stage`)
  console.log(`Fetcher:  ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/raw/)'}`)
  console.log(`Artifact: ${process.env.RAW_DATA_BUCKET ? `GCS (zoning/{slug}/extractions/latest.json)` : 'local (data/extractions/)'}`)
  console.log(`Model:    ${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}`)
  console.log(`Target:   ${targets.join(', ')}\n`)

  for (const jurisdictionId of targets) {
    const [prefix] = jurisdictionId.split('_')
    const jur = allJurisdictions.find(
      (j) => j.name.toLowerCase().startsWith(prefix.toLowerCase()),
    )

    if (!jur) {
      console.error(`✗ Jurisdiction not found: ${jurisdictionId}`)
      console.error(`  Available: ${allJurisdictions.map((j) => j.name).join(', ')}`)
      console.error(`  Run npm run db:seed first.`)
      continue
    }

    console.log(`── ${jur.displayName} (${jur.id})`)

    try {
      const artifact = await runExtractStage(jur.id, jur.slug, {
        fetcher,
        parser,
        extractors,
        logger: {
          info:  (msg, ctx) => console.log(`   ${msg}`, ctx ?? ''),
          warn:  (msg, ctx) => console.warn(`   ⚠ ${msg}`, ctx ?? ''),
          error: (msg, ctx) => console.error(`   ✗ ${msg}`, ctx ?? ''),
          debug: (msg, ctx) => {
            if (process.env.LOG_LEVEL === 'debug') console.log(`   [debug] ${msg}`, ctx ?? '')
          },
        },
      })

      await store.write(jur.slug, artifact)

      const fieldCount = Object.keys(artifact.fields).length
      const highConf = Object.values(artifact.fields).filter((f) => f.confidence === 'high').length
      const zoneCount = artifact.zoneFields?.length ?? 0
      const zoneCodeCount = new Set(artifact.zoneFields?.map((z) => z.zone_code) ?? []).size
      console.log(`   fields extracted: ${fieldCount}`)
      console.log(`   high confidence:  ${highConf}`)
      console.log(`   zone fields:      ${zoneCount} (${zoneCodeCount} zones)`)
      console.log(`   artifact written: ${jur.slug}.json`)
    } catch (err) {
      console.error(`   ✗ extract failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    console.log()
  }

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
