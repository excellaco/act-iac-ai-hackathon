/**
 * Pipeline Stage 0 — Document Pre-processing
 *
 * Fetches and parses the source document for a jurisdiction, then writes a
 * parsed-pages artifact that all subsequent pipeline stages read from.
 *
 * Two extraction modes (configured in data/config/<slug>.json):
 *   "text" (default) — pdf-parse text layer extraction (works for searchable PDFs)
 *   "ocr"            — Google Cloud Vision OCR output (required for scanned PDFs)
 *
 * Usage:
 *   npm run pipeline:parse <jurisdiction_slug>
 *   npm run pipeline:parse fairfax_va
 *
 * Output:
 *   data/artifacts/{slug}/{slug}_pages.json  (local)
 *   gs://{RAW_DATA_BUCKET}/zoning/{slug}/artifacts/{slug}_pages.json  (GCS)
 *
 * Run pipeline:zones after this stage completes.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { buildExtractArtifactStore } from '../lib/pipeline/artifact-store'
import { GcsFetcher } from '../lib/pipeline/gcs-fetcher'
import { LocalFetcher } from '../lib/pipeline/local-fetcher'
import { PdfParserImpl } from '../lib/pipeline/pdf-parser'
import { OcrReader } from '../lib/pipeline/ocr-reader'
import { loadJurisdictionConfig } from '../lib/pipeline/jurisdiction-config'
import { ParsedPagesArtifact } from '../lib/pipeline/artifact'

// ─── jurisdiction resolution ──────────────────────────────────────────────────

function resolveJurisdiction(
  slug: string,
  allJurisdictions: { id: string; slug: string; name: string; displayName: string }[],
) {
  const exact = allJurisdictions.find((j) => j.slug === slug)
  if (exact) return exact
  const prefix = slug.split(/[_-]/)[0]
  return allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase())) ?? null
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slug = process.argv[2]

  if (!slug) {
    console.error('Usage: npm run pipeline:parse <jurisdiction_slug>')
    console.error('Example: npm run pipeline:parse fairfax_va')
    process.exit(1)
  }

  const logger = {
    info:  (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
    warn:  (msg: string, ctx?: object) => console.warn(`   WARN ${msg}`, ctx ?? ''),
    error: (msg: string, ctx?: object) => console.error(`   ERROR ${msg}`, ctx ?? ''),
  }

  // Load jurisdiction config
  const config = loadJurisdictionConfig(slug)
  const extractionMethod = config.pdf_extraction ?? 'text'

  console.log(`\nParcela — pipeline:parse`)
  console.log(`Slug:      ${slug}`)
  console.log(`Method:    ${extractionMethod}`)
  if (config.pdf_source) console.log(`Source:    ${config.pdf_source}`)
  console.log(`Store:     ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/artifacts/)'}\n`)

  // Resolve jurisdiction from DB
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

  let pages: { page: number; text: string }[]
  let sourceDocument: string

  if (extractionMethod === 'ocr') {
    // OCR path — read assembled Vision API output
    logger.info('Reading OCR output...')
    const ocrReader = new OcrReader()
    pages = await ocrReader.readPages(jur.slug, config.ocr_source)
    // Source document is the original PDF — from config or convention
    sourceDocument = config.pdf_source ?? resolveGcsSourceDocument(jur.slug)
    logger.info(`OCR pages loaded`, { pageCount: pages.length })
  } else {
    // Text path — fetch and parse PDF
    logger.info('Fetching PDF...')
    const fetcher = process.env.RAW_DATA_BUCKET
      ? new GcsFetcher(undefined, config.pdf_source)
      : new LocalFetcher()
    const fetched = await fetcher.fetch(jur.id, jur.slug)
    sourceDocument = fetched.sourceDocument
    logger.info(`PDF fetched: ${sourceDocument}`)

    logger.info('Parsing PDF...')
    const parser = new PdfParserImpl()
    const parsed = await parser.parse(fetched.bytes)
    pages = parsed.pages
    logger.info(`PDF parsed`, { pageCount: pages.length })
  }

  if (pages.length === 0) {
    logger.warn('No pages found — check source document and extraction method.')
  }

  // Write pages artifact
  const artifact: ParsedPagesArtifact = {
    sourceDocument,
    parsedAt: new Date().toISOString(),
    extractionMethod,
    pages,
  }

  logger.info('Writing pages artifact...')
  await store.writePages(jur.slug, artifact)

  console.log(`\nDone.`)
  console.log(`  Pages:    ${pages.length}`)
  console.log(`  Source:   ${sourceDocument}`)
  console.log(`  Method:   ${extractionMethod}`)
  console.log(`\nNext steps:`)
  console.log(`  Run: npm run pipeline:zones ${jur.slug}`)

  process.exit(0)
}

/**
 * Convention-based fallback source document URI for OCR mode when pdf_source
 * is not set in config. Matches the GcsFetcher convention but without downloading.
 */
function resolveGcsSourceDocument(slug: string): string {
  const bucket = process.env.RAW_DATA_BUCKET ?? 'parcela-490518-raw-data'
  return `gs://${bucket}/zoning/${slug}/<source-pdf>`
}

main().catch((err) => { console.error(err); process.exit(1) })
