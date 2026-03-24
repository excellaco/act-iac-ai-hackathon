/**
 * Pipeline Stage 2 — Per-Zone Field Extraction
 *
 * Reads the approved zones artifact, then for each target zone runs Gemini
 * field extraction and writes a ZoneFieldsArtifact.
 *
 * Usage:
 *   npm run pipeline:extract <jurisdiction_slug>            # all zones
 *   npm run pipeline:extract <jurisdiction_slug> <zone>    # single zone
 *
 * Two-pass chunk narrowing:
 *   For each zone, we first filter the full chunk set to chunks containing
 *   the zone code (case-insensitive). Extraction runs against these "narrow"
 *   chunks. If no high-confidence result is found for a field, we fall back
 *   to all chunks.
 *
 * Gates:
 *   - Requires zones artifact with approved: true.
 *   - Skips zones where a fields artifact already exists with approved: true.
 *   - Errors if a fields artifact exists with approved: false (conflict).
 *
 * Run pipeline:load after approving each zone fields artifact.
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { buildExtractArtifactStore } from '../lib/pipeline/artifact-store'
import { buildZoneAwareExtractors } from '../lib/extractors/index'
import { chunkText, TextChunk } from '../lib/pipeline/chunk'
import { normalizeExtractionResult } from '../lib/pipeline/normalize'
import { validateExtractionResult } from '../lib/pipeline/validate'
import { createGeminiLimiter } from '../lib/pipeline/gemini-concurrency'
import { FieldExtractor } from '../lib/pipeline/runner'
import { ZoneFieldsArtifact, FieldArtifact, ZonesArtifact, ZoneEntry } from '../lib/pipeline/artifact'
import { ParsedPage } from '../lib/pipeline/artifact'

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

// ─── confidence ranking ───────────────────────────────────────────────────────

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

function isHighConfidenceWithValue(result: { confidence: string; raw_value: number | null; field_value_text: string }): boolean {
  return (
    result.confidence === 'high' &&
    (result.raw_value !== null || (result.field_value_text ?? '').trim().length > 0)
  )
}

// ─── inline page search (same logic as page-resolver findPage) ────────────────

function findSourcePage(pages: ParsedPage[], searchText: string): number | null {
  if (!searchText || searchText === 'Not found in document') return null
  const needle = searchText.toLowerCase().trim()
  for (const { page, text } of pages) {
    if (text.toLowerCase().includes(needle)) return page
  }
  return null
}

// ─── two-pass extraction for one field ───────────────────────────────────────

/**
 * Try narrow chunks first; fall back to all chunks if no high-confidence result.
 * Returns a normalized + validated FieldArtifact (never null).
 */
async function extractFieldTwoPass(
  extractor: FieldExtractor,
  narrowChunks: string[],
  allChunks: string[],
  logger: { warn: (msg: string, ctx?: object) => void; debug?: (msg: string, ctx?: object) => void },
): Promise<{ raw_value: number | null; raw_unit: string | null; field_value: number | null; field_value_text: string; unit: string | null; confidence: 'high' | 'medium' | 'low'; source_section: string | null; district_context: string | null; reasoning: string | null; _pass: 'narrow' | 'fallback' | 'none' }> {
  // Helper: run through a chunk list and find the best result
  const scanChunks = async (chunks: string[], passLabel: string) => {
    let best: Awaited<ReturnType<FieldExtractor['extract']>> = null
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await extractor.extract(chunks[i])
        logger.debug?.(`[${extractor.fieldName}] ${passLabel} chunk ${i + 1}/${chunks.length} raw response`, {
          raw_value: result?.raw_value ?? null,
          field_value_text: result?.field_value_text ?? null,
          confidence: result?.confidence ?? null,
          source_section: result?.source_section ?? null,
          reasoning: result?.reasoning ?? null,
        })
        if (!result) continue

        const resultHasValue = result.raw_value !== null || result.field_value_text?.trim()
        const bestHasValue = best && (best.raw_value !== null || best.field_value_text?.trim())

        if (
          !best ||
          (!bestHasValue && resultHasValue) ||
          (bestHasValue === resultHasValue && confidenceRank(result.confidence) > confidenceRank(best.confidence))
        ) {
          best = result
        }

        if (best && isHighConfidenceWithValue(best)) break
      } catch (err) {
        logger.warn('extractor error on chunk', {
          fieldName: extractor.fieldName,
          chunkIndex: i + 1,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return best
  }

  // Narrow chunks only — no fallback to all chunks
  let result = narrowChunks.length > 0 ? await scanChunks(narrowChunks, 'narrow') : null
  const usedPass: 'narrow' | 'fallback' | 'none' = result ? 'narrow' : 'none'

  if (!result || !isHighConfidenceWithValue(result)) {
    logger.debug?.(`[${extractor.fieldName}] narrow pass result: ${result?.confidence ?? 'no result'} — no fallback`)
  }

  // Build a safe null result if nothing was found
  if (!result) {
    result = {
      field_name: extractor.fieldName,
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'Not found in document',
      unit: '',
      confidence: 'low',
      source_section: '',
      district_context: '',
      reasoning: 'Field not found in any text chunk',
    }
  }

  const normalized = normalizeExtractionResult(result)
  const { result: validated } = validateExtractionResult(normalized)

  return {
    raw_value:        validated.raw_value,
    raw_unit:         validated.raw_unit || null,
    field_value:      validated.field_value,
    field_value_text: validated.field_value_text,
    unit:             validated.unit || null,
    confidence:       validated.confidence,
    source_section:   validated.source_section || null,
    district_context: validated.district_context || null,
    reasoning:        validated.reasoning || null,
    _pass:            result ? usedPass : 'none',
  }
}

// ─── extract one zone ─────────────────────────────────────────────────────────

async function extractZone(
  jur: { id: string; slug: string; displayName: string },
  zone: ZoneEntry,
  allChunks: TextChunk[],
  pages: ParsedPage[],
  extractors: FieldExtractor[],
  store: ReturnType<typeof buildExtractArtifactStore>,
  logger: { info: (m: string, c?: object) => void; warn: (m: string, c?: object) => void; error: (m: string, c?: object) => void; debug?: (m: string, c?: object) => void },
): Promise<{ skipped: boolean; error?: string }> {
  const { zone_code, zone_name, multifamily_classification } = zone

  // Check for existing fields artifact
  try {
    const existing = await store.readZoneFields(jur.slug, zone_code)
    if (existing.approved) {
      logger.info(`Zone ${zone_code}: fields artifact already approved — skipping.`)
      return { skipped: true }
    } else {
      // Unapproved conflict — this is an error condition, not a routine skip.
      // The caller checks for error presence and exits non-zero.
      logger.error(`Zone ${zone_code}: fields artifact already exists with approved: false.`)
      logger.error(`  Delete or rename the file before re-running extraction for this zone.`)
      return { skipped: true, error: `fields artifact conflict for zone ${zone_code}` }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('No fields artifact')) {
      return { skipped: false, error: `unexpected read error for zone ${zone_code}: ${msg}` }
    }
    // No artifact yet — proceed
  }

  // Build narrow chunks from source_pages if defined; fall back to zone-code text match
  const sourcePageNums = zone.source_pages && zone.source_pages.length > 0
    ? new Set(zone.source_pages)
    : null
  let narrowChunks: string[]
  if (sourcePageNums) {
    const zonePageText = pages
      .filter((p) => sourcePageNums.has(p.page))
      .map((p) => p.text)
      .join('\n\n')
    narrowChunks = chunkText(zonePageText).map((c) => c.text)
    logger.debug?.(`Zone ${zone_code}: narrow chunks from ${sourcePageNums.size} source pages → ${narrowChunks.length} chunks`)
  } else {
    narrowChunks = allChunks
      .filter((c) => c.text.toLowerCase().includes(zone_code.toLowerCase()))
      .map((c) => c.text)
    logger.debug?.(`Zone ${zone_code}: narrow chunks from zone-code text match → ${narrowChunks.length} chunks`)
  }
  const allChunkTexts = allChunks.map((c) => c.text)

  logger.info(`Zone ${zone_code}: ${narrowChunks.length} narrow / ${allChunkTexts.length} total chunks`)

  // Run extractors in parallel per field, bounded by the per-zone limiter
  const fields: Record<string, FieldArtifact> = {}

  await Promise.all(
    extractors.map(async (extractor) => {
      try {
        const fieldResult = await extractFieldTwoPass(extractor, narrowChunks, allChunkTexts, logger)

        // Resolve source_page inline from field_value_text
        const sourcePage = findSourcePage(pages, fieldResult.field_value_text)
        logger.debug?.(`[${extractor.fieldName}] result — pass: ${fieldResult._pass}, confidence: ${fieldResult.confidence}, value: ${fieldResult.field_value ?? fieldResult.field_value_text}, source_page: ${sourcePage ?? 'not found'}`)

        const { _pass, ...fieldResultWithoutPass } = fieldResult
        fields[extractor.fieldName] = {
          ...fieldResultWithoutPass,
          source_page: sourcePage,
        }
      } catch (err) {
        logger.warn(`Zone ${zone_code}: field ${extractor.fieldName} failed`, {
          error: err instanceof Error ? err.message : String(err),
        })
        // Produce a safe null result
        fields[extractor.fieldName] = {
          raw_value: null,
          raw_unit: null,
          field_value: null,
          field_value_text: 'Not found in document',
          unit: null,
          confidence: 'low',
          source_section: null,
          district_context: zone_code,
          reasoning: 'Extraction failed',
          source_page: null,
        }
      }
    }),
  )

  // Write fields artifact
  const artifact: ZoneFieldsArtifact = {
    jurisdictionId: jur.id,
    slug: jur.slug,
    zoneCode: zone_code,
    zoneName: zone_name,
    multifamilyClassification: multifamily_classification,
    extractedAt: new Date().toISOString(),
    approved: false,
    fields,
  }

  await store.writeZoneFields(jur.slug, zone_code, artifact)

  const highConf = Object.values(fields).filter((f) => f.confidence === 'high').length
  const withValue = Object.values(fields).filter((f) => f.field_value !== null).length
  logger.info(`Zone ${zone_code}: written (${highConf} high-conf, ${withValue} with value)`)

  return { skipped: false }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slugArg = process.argv[2]
  const zoneArg = process.argv[3]

  if (!slugArg) {
    console.error('Usage: npm run pipeline:extract <jurisdiction_slug> [zone_code]')
    console.error('Example: npm run pipeline:extract fairfax_va')
    console.error('Example: npm run pipeline:extract fairfax_va R-MF')
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

  console.log(`\nParcela — pipeline:extract`)
  console.log(`Slug:     ${slugArg}`)
  console.log(`Zone:     ${zoneArg ?? '(all eligible zones)'}`)
  console.log(`Store:    ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/artifacts/)'}`)
  console.log(`Model:    ${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}\n`)

  // 1. Resolve jurisdiction
  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = resolveJurisdiction(slugArg, allJurisdictions)

  if (!jur) {
    console.error(`ERROR: Jurisdiction not found in DB for slug: ${slugArg}`)
    console.error(`  Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    console.error(`  Run npm run db:seed first.`)
    process.exit(1)
  }

  logger.info(`Jurisdiction: ${jur.displayName} (${jur.id})`)

  const store = buildExtractArtifactStore()

  // 2. Read and validate zones artifact
  let zonesArtifact: ZonesArtifact
  try {
    zonesArtifact = await store.readZones(jur.slug)
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    console.error(`  Run npm run pipeline:zones ${slugArg} first.`)
    process.exit(1)
  }

  if (!zonesArtifact.approved) {
    console.error(`ERROR: Zones artifact exists but is not approved.`)
    console.error(`  File: data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
    console.error(`  Review the zones list and set "approved": true before running extraction.`)
    process.exit(1)
  }

  // 3. Check jurisdiction-level master switch
  if (!zonesArtifact.include_in_extraction) {
    logger.info(`Jurisdiction-level include_in_extraction is false — nothing to extract.`)
    process.exit(0)
  }

  // 4. Determine target zones
  let targetZones: ZoneEntry[]
  if (zoneArg) {
    const found = zonesArtifact.zones.find(
      (z) => z.zone_code.toLowerCase() === zoneArg.toLowerCase(),
    )
    if (!found) {
      console.error(`ERROR: Zone "${zoneArg}" not found in zones artifact.`)
      console.error(`  Available zones: ${zonesArtifact.zones.map((z) => z.zone_code).join(', ')}`)
      process.exit(1)
    }
    if (!found.include_in_extraction) {
      const { createInterface } = await import('readline')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      const answer = await new Promise<string>((resolve) => {
        rl.question(`  WARN Zone "${zoneArg}" has include_in_extraction: false. Run anyway? [y/N] `, resolve)
      })
      rl.close()
      if (answer.trim().toLowerCase() !== 'y') {
        console.log('Aborted.')
        process.exit(0)
      }
    }
    targetZones = [found]
  } else {
    targetZones = zonesArtifact.zones.filter((z) => z.include_in_extraction)
    logger.info(`Targeting ${targetZones.length} of ${zonesArtifact.zones.length} zones (include_in_extraction: true)`)
  }

  if (targetZones.length === 0) {
    logger.info('No zones to extract (all have include_in_extraction: false).')
    process.exit(0)
  }

  // 5. Read pages artifact (written by pipeline:parse)
  let pages!: ParsedPage[]
  let allChunks!: TextChunk[]

  try {
    const pagesArtifact = await store.readPages(jur.slug)
    pages = pagesArtifact.pages
    logger.info(`Pages artifact loaded`, { pageCount: pages.length, extractionMethod: pagesArtifact.extractionMethod })
    const text = pages.map((p) => p.text).join('\n\n')
    allChunks = chunkText(text)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`ERROR: ${msg}`)
    console.error(`  Run \`npm run pipeline:parse ${slugArg}\` first.`)
    process.exit(1)
  }

  logger.info(`Chunks: ${allChunks.length} total`)

  // 6. Build extractors
  const extractors = buildZoneAwareExtractors()

  // Use a single shared concurrency limiter for all Gemini calls
  createGeminiLimiter()

  // 7. Process each zone (run in parallel within GeminiLimiter bounds)
  const results = await Promise.all(
    targetZones.map(async (zone) => {
      try {
        const result = await extractZone(jur, zone, allChunks, pages, extractors, store, logger)
        return { zone_code: zone.zone_code, ...result }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        logger.error(`Zone ${zone.zone_code}: unexpected error`, { error })
        return { zone_code: zone.zone_code, skipped: false, error }
      }
    }),
  )

  // 8. Summary
  const succeeded = results.filter((r) => !r.skipped && !r.error).length
  const skipped   = results.filter((r) => r.skipped && !r.error).length
  const failed    = results.filter((r) => !!r.error).length

  console.log(`\nSummary:`)
  console.log(`  Zones extracted: ${succeeded}`)
  console.log(`  Zones skipped:   ${skipped}`)
  console.log(`  Zones failed:    ${failed}`)

  if (failed > 0) {
    console.log('\nFailed zones:')
    for (const r of results.filter((r) => r.error)) {
      console.error(`  ${r.zone_code}: ${r.error}`)
    }
  }

  console.log(`\nNext steps:`)
  console.log(`  1. Review each zone fields artifact in data/artifacts/${jur.slug}/.`)
  console.log(`  2. Set "approved": true on zones you want loaded.`)
  console.log(`  3. Run: npm run pipeline:load ${slugArg}`)

  // Exit non-zero if any zone had a conflict (approved: false artifact exists).
  // Routine skips (approved: true) are not errors.
  const hasConflicts = results.some((r) => r.error?.includes('conflict'))
  process.exit(hasConflicts ? 1 : 0)
}

main().catch((err) => { console.error(err); process.exit(1) })
