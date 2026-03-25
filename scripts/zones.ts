/**
 * Pipeline Stage 1 — Zone Discovery
 *
 * Fetches the zoning PDF for a jurisdiction, parses it, runs zone discovery
 * via Gemini, and writes a ZonesArtifact to the artifact store.
 *
 * Usage:
 *   npm run pipeline:zones <jurisdiction_slug>
 *   npm run pipeline:zones fairfax_va
 *
 * Output:
 *   data/artifacts/{slug}/{slug}_zones.json  (local)
 *   gs://{RAW_DATA_BUCKET}/zoning/{slug}/artifacts/{slug}_zones.json  (GCS)
 *
 * Gates:
 *   - If zones artifact already exists with approved: true  → log and exit cleanly.
 *   - If zones artifact already exists with approved: false → error, ask user to delete.
 *
 * Run pipeline:extract after approving the zones artifact.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { buildExtractArtifactStore } from '../lib/pipeline/artifact-store'
import { discoverZones } from '../lib/extractors/zone-discovery.extractor'
import { createGeminiLimiter } from '../lib/pipeline/gemini-concurrency'
import { chunkText } from '../lib/pipeline/chunk'
import { ZonesArtifact, ZoneEntry } from '../lib/pipeline/artifact'

// ─── jurisdiction resolution ──────────────────────────────────────────────────

function resolveJurisdiction(
  slug: string,
  allJurisdictions: { id: string; slug: string; name: string; displayName: string }[],
) {
  // Try exact slug match first
  const exact = allJurisdictions.find((j) => j.slug === slug)
  if (exact) return exact

  // Try name-prefix match: 'fairfax_va' → prefix 'fairfax'
  const prefix = slug.split(/[_-]/)[0]
  return allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase())) ?? null
}

// ─── inline page search (same logic as page-resolver findPage) ────────────────

function findSourcePages(
  pages: Array<{ page: number; text: string }>,
  zoneCode: string,
): number[] {
  const needle = zoneCode.toLowerCase()
  const found: number[] = []
  for (const { page, text } of pages) {
    if (text.toLowerCase().includes(needle)) {
      found.push(page)
    }
  }
  return found
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slug = process.argv[2]

  if (!slug) {
    console.error('Usage: npm run pipeline:zones <jurisdiction_slug>')
    console.error('Example: npm run pipeline:zones fairfax_va')
    process.exit(1)
  }

  const logger = {
    info:  (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
    warn:  (msg: string, ctx?: object) => console.warn(`   WARN ${msg}`, ctx ?? ''),
    error: (msg: string, ctx?: object) => console.error(`   ERROR ${msg}`, ctx ?? ''),
    debug: (msg: string, ctx?: object) => {
      if (process.env.LOG_LEVEL === 'debug') console.log(`   [debug] ${msg}`, ctx ?? '')
    },
  }

  console.log(`\nParcela — pipeline:zones`)
  console.log(`Slug:     ${slug}`)
  console.log(`Store:    ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/artifacts/)'}`)
  console.log(`Model:    ${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}\n`)

  // 1. Resolve jurisdiction from DB
  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = resolveJurisdiction(slug, allJurisdictions)

  if (!jur) {
    console.error(`ERROR: Jurisdiction not found in DB for slug: ${slug}`)
    console.error(`  Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    console.error(`  Run npm run db:seed first.`)
    process.exit(1)
  }

  logger.info(`Jurisdiction: ${jur.displayName} (${jur.id})`)

  const store = buildExtractArtifactStore()

  // 2. Check for existing zones artifact (approval gates)
  try {
    const existing = await store.readZones(jur.slug)
    if (existing.approved) {
      logger.info(`Zones artifact already exists and is approved — skipping.`)
      logger.info(`  File: data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
      logger.info(`  To re-run zone discovery, delete or rename the file first.`)
      process.exit(0)
    } else {
      console.error(`ERROR: Zones artifact already exists with approved: false.`)
      console.error(`  File: data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
      console.error(`  Delete or rename the file before re-running zone discovery.`)
      console.error(`  (Review the existing artifact first — it may already be correct.)`)
      process.exit(1)
    }
  } catch (err) {
    // ENOENT / not-found means no artifact yet — continue
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('No zones artifact')) {
      // Unexpected read error
      console.error(`ERROR reading existing zones artifact: ${msg}`)
      process.exit(1)
    }
    // No artifact exists — proceed normally
  }

  // 3. Read pages artifact (written by pipeline:parse)
  logger.info('Reading pages artifact...')
  let pagesArtifact: Awaited<ReturnType<typeof store.readPages>>
  try {
    pagesArtifact = await store.readPages(jur.slug)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`ERROR: ${msg}`)
    console.error(`  Run \`npm run pipeline:parse ${slug}\` first.`)
    process.exit(1)
  }
  const { pages, sourceDocument } = pagesArtifact
  logger.info(`Pages artifact loaded`, { pageCount: pages.length, extractionMethod: pagesArtifact.extractionMethod })

  // 4. Run zone discovery
  logger.info('Running zone discovery...')
  const fullText = pages.map((p) => p.text).join('\n\n')
  const chunks = chunkText(fullText)
  const chunkTexts = chunks.map((c) => c.text)
  const limiter = createGeminiLimiter()
  const discoveredZones = await discoverZones(chunkTexts, limiter, logger)
  logger.info(`Zone discovery complete`, { zonesFound: discoveredZones.length })

  if (discoveredZones.length === 0) {
    logger.warn('No residential zones discovered — check the PDF and zone discovery prompt.')
  }

  // 5. Build ZoneEntry list with source_pages resolved inline
  const zoneEntries: ZoneEntry[] = discoveredZones.map((dz) => ({
    zone_code: dz.zone_code,
    zone_name: dz.zone_name,
    multifamily_classification: dz.multifamily_classification,
    source_pages: findSourcePages(pages, dz.zone_code),
    include_in_extraction: true,
    include_in_load: true,
  }))

  // 6. Build and write zones artifact
  const artifact: ZonesArtifact = {
    jurisdictionId: jur.id,
    slug: jur.slug,
    sourceDocument,
    extractedAt: new Date().toISOString(),
    approved: false,
    include_in_extraction: true,
    include_in_load: true,
    zones: zoneEntries,
  }

  logger.info('Writing zones artifact...')
  await store.writeZones(jur.slug, artifact)

  console.log(`\nDone.`)
  console.log(`  Zones discovered: ${zoneEntries.length}`)
  console.log(`  Artifact:         data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
  console.log(`\nNext steps:`)
  console.log(`  1. Review and edit the zones artifact (set approved: true when ready).`)
  console.log(`  2. Run: npm run pipeline:extract ${jur.slug}`)

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
