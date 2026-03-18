/**
 * CLI script to run the extraction pipeline for one or all jurisdictions.
 *
 * Usage:
 *   tsx -r dotenv/config scripts/run-pipeline.ts [jurisdictionId]
 *
 * Examples:
 *   tsx -r dotenv/config scripts/run-pipeline.ts               # all 3 jurisdictions
 *   tsx -r dotenv/config scripts/run-pipeline.ts arlington_va  # one jurisdiction
 *
 * Environment variables (set in .env.local):
 *   DATABASE_URL         — PostgreSQL connection string
 *   GOOGLE_CLOUD_PROJECT — GCP project ID (required for Gemini calls)
 *   RAW_DATA_BUCKET      — GCS bucket name; omit to use local data/raw/ fallback
 *
 * The script uses LocalFetcher when RAW_DATA_BUCKET is not set, so you can
 * run it locally with PDFs in data/raw/zoning/{jurisdictionId}/.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { runPipeline } from '../lib/pipeline/runner'
import { GcsFetcher } from '../lib/pipeline/gcs-fetcher'
import { LocalFetcher } from '../lib/pipeline/local-fetcher'
import { PdfParserImpl } from '../lib/pipeline/pdf-parser'
import { buildExtractors } from '../lib/extractors/index'

const ALL_JURISDICTION_IDS = ['fairfax_va', 'arlington_va', 'loudoun_va']

async function main() {
  const targetArg = process.argv[2]
  const targets = targetArg ? [targetArg] : ALL_JURISDICTION_IDS

  // Resolve jurisdiction IDs to UUIDs
  const allJurisdictions = await db.select().from(jurisdictions)

  const fetcher = process.env.RAW_DATA_BUCKET
    ? new GcsFetcher()
    : new LocalFetcher()

  const parser = new PdfParserImpl()
  const extractors = buildExtractors()

  console.log(`\nParcela extraction pipeline`)
  console.log(`Fetcher: ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/raw/)'}`)
  console.log(`Model:   ${process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-001'}`)
  console.log(`Target:  ${targets.join(', ')}\n`)

  for (const jurisdictionId of targets) {
    // Match by name pattern: "arlington_va" → "Arlington County"
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

    const result = await runPipeline(db, jur.id, {
      fetcher,
      parser,
      extractors,
      logger: {
        info: (msg, ctx) => console.log(`   ${msg}`, ctx ?? ''),
        warn: (msg, ctx) => console.warn(`   ⚠ ${msg}`, ctx ?? ''),
        error: (msg, ctx) => console.error(`   ✗ ${msg}`, ctx ?? ''),
      },
    })

    console.log(`   status: ${result.run.status}`)
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
