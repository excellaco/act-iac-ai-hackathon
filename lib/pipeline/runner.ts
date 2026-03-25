/**
 * E0-1 / E0-8: Pipeline runner
 *
 * Orchestrates the full ingestion-to-extraction sequence for one jurisdiction.
 * As of E0-8, the pipeline is split into two independently runnable stages:
 *
 *   EXTRACT: fetch PDF → parse → chunk → Gemini extraction → normalize → validate
 *            → write ExtractionArtifact (GCS or local file; no DB writes)
 *
 *   LOAD:    read artifact → normalize → validate → upsert to DB → run record
 *            (re-runnable against any artifact, including hand-authored synthetic ones)
 *
 * `runPipeline` chains both stages and preserves the pre-E0-8 behavior for CI.
 *
 * Dependencies are injected via interfaces so each stage is independently
 * testable and replaceable (e.g. GCS fetch vs. local fallback, real LLM vs. mock).
 *
 * The runner never throws.  All errors are caught, logged, and reflected in
 * the pipeline run record (E0-5).  Individual field failures are handled by
 * safeExtract (E0-3) and produce partial results rather than aborting the run.
 */

import { desc, eq, sql } from 'drizzle-orm'
import { Database } from '../../db/client'
import { extractedFields, pipelineRuns, zoneExtractedFields } from '../../db/schema'
import { chunkText } from './chunk'
import { normalizeExtractionResult, RawExtractionResult } from './normalize'
import { validateExtractionResult } from './validate'
import { runExtractions } from './errors'
import { startRun, completeRun, failRun, PipelineRun } from './run-record'
import { PipelineLogger, consoleLogger } from './errors'
import { ExtractionArtifact, FieldArtifact, ParsedPage, ZoneFieldArtifact } from './artifact'
import { ArtifactStore } from './artifact-store'
import { toNumericString } from './numeric'
import { discoverZones } from '../../lib/extractors/zone-discovery.extractor'
import { injectCanonicalZones, injectLimiter } from '../../lib/extractors/multi-zone-gemini.extractor'
import { createGeminiLimiter } from './gemini-concurrency'

// ─── injectable interfaces ────────────────────────────────────────────────────

export interface PdfFetcher {
  fetch(jurisdictionId: string, slug: string): Promise<{ bytes: Buffer; sourceDocument: string }>
}

export interface PdfParser {
  parse(bytes: Buffer): Promise<{ text: string; pages: ParsedPage[] }>
}

/**
 * Per-zone extraction result for a single field in a single zone.
 * Extends RawExtractionResult with zone identity fields.
 */
export interface ZoneRawResult extends RawExtractionResult {
  zone_code: string
  zone_name: string | null
  multifamily_classification: 'primary' | 'permitted' | 'limited' | 'none'
}

export interface FieldExtractor {
  fieldName: string
  extract(chunk: string): Promise<RawExtractionResult | null>
  /**
   * Optional: extract field values for ALL residential zones in the chunk.
   * When present, the runner collects results into artifact.zoneFields.
   * Existing extractors without this method remain fully valid.
   */
  extractAllZones?(chunks: string[]): Promise<ZoneRawResult[]>
}

// ─── result types ─────────────────────────────────────────────────────────────

export interface RunResult {
  run: PipelineRun
  fieldsExtracted: number
  fieldsFailed: number
  errors: Array<{ fieldName: string; message: string }>
}

export interface RunnerOptions {
  fetcher: PdfFetcher
  parser: PdfParser
  extractors: FieldExtractor[]
  logger?: PipelineLogger
  /** Optional artifact store — when provided, runPipeline writes the artifact after extraction */
  artifactStore?: ArtifactStore
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Given a field extractor and all text chunks, try each chunk in sequence and
 * return the first result with confidence !== 'low', or the best result found,
 * or null if nothing was extracted from any chunk.
 */
async function extractBestResult(
  extractor: FieldExtractor,
  chunks: string[],
  logger: PipelineLogger,
): Promise<RawExtractionResult | null> {
  let bestResult: RawExtractionResult | null = null
  const total = chunks.length

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    try {
      const result = await extractor.extract(chunk)
      if (!result) {
        logger.debug?.(`${extractor.fieldName}: chunk ${i + 1}/${total} → no result`)
        continue
      }

      // Prefer results that have a value over null results, even at lower confidence.
      // A null result with high confidence means "I'm sure it's not in this chunk" —
      // that should not stop the search before chunks with actual values are tried.
      const resultHasValue = result.raw_value !== null || result.field_value_text?.trim()
      const bestHasValue = bestResult && (bestResult.raw_value !== null || bestResult.field_value_text?.trim())

      if (
        !bestResult ||
        (!bestHasValue && resultHasValue) ||
        (bestHasValue === resultHasValue && confidenceRank(result.confidence) > confidenceRank(bestResult.confidence))
      ) {
        bestResult = result
      }

      // Only stop early if we have a high-confidence result with an actual value
      if (bestResult.confidence === 'high' && (bestResult.raw_value !== null || bestResult.field_value_text?.trim())) {
        logger.debug?.(`${extractor.fieldName}: chunk ${i + 1}/${total} → high confidence, stopping early`)
        break
      }

      logger.debug?.(`${extractor.fieldName}: chunk ${i + 1}/${total} → ${result.confidence} confidence, continuing`)
    } catch (err) {
      logger.warn('extractor error on chunk', {
        fieldName: extractor.fieldName,
        chunkIndex: i + 1,
        chunkTotal: total,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return bestResult
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

/** Strip null bytes and non-printable control chars — PostgreSQL rejects 0x00 in UTF-8 */
function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const r = s.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ').trim()
  return r || null
}

// ─── run history ──────────────────────────────────────────────────────────────

export async function getRunHistory(
  db: Database,
  jurisdictionId: string,
): Promise<PipelineRun[]> {
  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.jurisdictionId, jurisdictionId))
    .orderBy(desc(pipelineRuns.startedAt))

  return rows as PipelineRun[]
}

// ─── extract stage ────────────────────────────────────────────────────────────

/**
 * Extract stage (E0-8): fetch PDF → parse → chunk → Gemini extraction → normalize → validate.
 * Returns an ExtractionArtifact. No database writes.
 *
 * Used by scripts/extract.ts and called internally by runPipeline.
 */
export async function runExtractStage(
  jurisdictionId: string,
  slug: string,
  options: RunnerOptions,
): Promise<ExtractionArtifact> {
  const logger = options.logger ?? consoleLogger

  // 1. fetch PDF
  logger.info('fetching PDF', { jurisdictionId, slug })
  const { bytes, sourceDocument } = await options.fetcher.fetch(jurisdictionId, slug)

  // 2. parse PDF → text + per-page index
  logger.info('parsing PDF', { sourceDocument })
  const { text, pages } = await options.parser.parse(bytes)

  // 3. chunk text
  const chunks = chunkText(text)
  logger.info('text chunked', { chunkCount: chunks.length })

  // Create one shared concurrency limiter for all Gemini calls in this run
  const limiter = createGeminiLimiter()

  // 4–6. extract, normalize, validate — one task per extractor, run in parallel
  const extractionStart = Date.now()
  const extractions = options.extractors.map((extractor) => ({
    fieldName: extractor.fieldName,
    extractor: async () => {
      const raw = await extractBestResult(extractor, chunks.map((c) => c.text), logger)

      if (!raw) {
        return normalizeExtractionResult({
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
        })
      }

      const normalized = normalizeExtractionResult(raw)
      const { result: validated } = validateExtractionResult(normalized)
      return validated
    },
  }))

  const { outcomes } = await runExtractions(extractions, logger, limiter)
  logger.info('extraction run complete', {
    fieldsExtracted: outcomes.filter((o) => o.ok && o.result.field_value !== null).length,
    fieldsFailed: outcomes.filter((o) => !o.ok).length,
    elapsedMs: Date.now() - extractionStart,
  })

  // 7. build artifact
  const fields: Record<string, FieldArtifact> = {}
  for (const outcome of outcomes) {
    const r = outcome.result
    fields[r.field_name] = {
      raw_value: r.raw_value,
      raw_unit: r.raw_unit || null,
      field_value: r.field_value,
      field_value_text: r.field_value_text,
      unit: r.unit || null,
      confidence: r.confidence,
      source_section: r.source_section || null,
      district_context: r.district_context || null,
      reasoning: r.reasoning || null,
    }
  }

  // ── Multi-zone extraction (E2-155) ─────────────────────────────────────────
  // Run zone discovery then call extractAllZones() on extractors that support it.
  // This is skipped if no extractor implements extractAllZones to keep the pipeline
  // backward-compatible for synthetic jurisdictions and legacy runs.

  const zoneAwareExtractors = options.extractors.filter((e) => typeof e.extractAllZones === 'function')
  let zoneFields: ZoneFieldArtifact[] | undefined

  if (zoneAwareExtractors.length > 0) {
    try {
      logger.info('running zone discovery', { slug })
      const zoneDiscoveryStart = Date.now()
      const chunkTexts = chunks.map((c) => c.text)
      const canonicalZones = await discoverZones(chunkTexts, limiter, logger)
      logger.info('zones discovered', { count: canonicalZones.length, slug, elapsedMs: Date.now() - zoneDiscoveryStart })

      const MAX_EXPECTED_ZONES = 75
      if (canonicalZones.length > MAX_EXPECTED_ZONES) {
        logger.warn('zone count unusually high — possible over-extraction of non-residential districts', {
          count: canonicalZones.length,
          threshold: MAX_EXPECTED_ZONES,
          slug,
        })
      }

      if (canonicalZones.length > 0) {
        injectCanonicalZones(zoneAwareExtractors, canonicalZones)
        injectLimiter(zoneAwareExtractors, limiter)

        const zoneResults: import('./artifact').ZoneFieldArtifact[] = []

        for (const extractor of zoneAwareExtractors) {
          if (!extractor.extractAllZones) continue
          try {
            const raw = await extractor.extractAllZones(chunkTexts)
            for (const r of raw) {
              const normalized = normalizeExtractionResult(r)
              const { result: validated } = validateExtractionResult(normalized)
              zoneResults.push({
                field_name: extractor.fieldName,
                zone_code: r.zone_code,
                zone_name: r.zone_name ?? null,
                multifamily_classification: r.multifamily_classification,
                raw_value: validated.raw_value,
                raw_unit: validated.raw_unit || null,
                field_value: validated.field_value,
                field_value_text: validated.field_value_text,
                unit: validated.unit || null,
                confidence: validated.confidence,
                source_section: validated.source_section || null,
                district_context: validated.district_context || null,
                reasoning: validated.reasoning || null,
              })
            }
          } catch (err) {
            logger.warn('zone extraction error', {
              fieldName: extractor.fieldName,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }

        if (zoneResults.length > 0) {
          zoneFields = zoneResults
          logger.info('zone fields extracted', { count: zoneResults.length, slug })
        }
      }
    } catch (err) {
      // Zone extraction failure is non-fatal — artifact still has jurisdiction-level fields
      logger.warn('zone extraction stage failed', {
        slug,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const artifact: ExtractionArtifact = {
    jurisdictionId,
    slug,
    sourceDocument,
    extractedAt: new Date().toISOString(),
    fields,
    ...(zoneFields ? { zoneFields } : {}),
  }

  // Write parsed pages to store so the page-resolve stage can find source page numbers
  if (options.artifactStore) {
    logger.info('writing parsed pages', { slug, pageCount: pages.length })
    await options.artifactStore.writePages(slug, {
      sourceDocument,
      parsedAt: new Date().toISOString(),
      extractionMethod: 'text',
      pages,
    })
  }

  return artifact
}

// ─── load stage ───────────────────────────────────────────────────────────────

/**
 * Load stage (E0-8): read artifact → normalize → validate → upsert to DB → run record.
 * Re-runnable: can be used with any artifact, including hand-authored synthetic ones.
 *
 * Used by scripts/load.ts and called internally by runPipeline.
 *
 * @param jurisdictionId  UUID from the jurisdictions table (resolved by the caller)
 */
export async function runLoadStage(
  db: Database,
  jurisdictionId: string,
  artifact: ExtractionArtifact,
  logger: PipelineLogger = consoleLogger,
): Promise<RunResult> {
  let run: PipelineRun | null = null

  try {
    // 1. start run record
    run = await startRun(db, jurisdictionId, artifact.sourceDocument)
    logger.info('load stage started', { jurisdictionId, runId: run.id, slug: artifact.slug })

    // 2. normalize → validate each field
    const fieldEntries = Object.entries(artifact.fields)
    let fieldsExtracted = 0
    let fieldsFailed = 0

    const rows = fieldEntries.map(([fieldName, fa]) => {
      // Re-run normalize + validate (idempotent — catches logic changes since extraction)
      const asRaw: RawExtractionResult = {
        field_name: fieldName,
        raw_value: fa.raw_value,
        raw_unit: fa.raw_unit ?? '',
        field_value: fa.field_value,
        field_value_text: fa.field_value_text,
        unit: fa.unit ?? '',
        confidence: fa.confidence,
        source_section: fa.source_section ?? '',
        district_context: fa.district_context ?? '',
        reasoning: fa.reasoning ?? '',
      }
      const normalized = normalizeExtractionResult(asRaw)
      const { result: validated } = validateExtractionResult(normalized)

      if (validated.field_value !== null || fieldName === 'discretionary_review_required') {
        fieldsExtracted++
      } else if (validated.confidence === 'low' && validated.field_value === null) {
        fieldsFailed++
      }

      return {
        jurisdictionId,
        fieldName,
        rawValue:       toNumericString(validated.raw_value),
        rawUnit:        clean(validated.raw_unit),
        fieldValue:     toNumericString(validated.field_value),
        fieldValueText: clean(validated.field_value_text) ?? 'Not found in document',
        unit:           clean(validated.unit),
        confidence:     validated.confidence,
        sourceDocument: artifact.sourceDocument,
        sourceSection:  clean(validated.source_section),
        districtContext: clean(validated.district_context),
        reasoning:      clean(fa.reasoning),
        pipelineRunId:  run!.id,
      }
    })

    // 3. upsert to DB
    if (rows.length > 0) {
      await db
        .insert(extractedFields)
        .values(rows)
        .onConflictDoUpdate({
          target: [extractedFields.jurisdictionId, extractedFields.fieldName],
          set: {
            rawValue:        sql`excluded.raw_value`,
            rawUnit:         sql`excluded.raw_unit`,
            fieldValue:      sql`excluded.field_value`,
            fieldValueText:  sql`excluded.field_value_text`,
            unit:            sql`excluded.unit`,
            confidence:      sql`excluded.confidence`,
            sourceDocument:  sql`excluded.source_document`,
            sourceSection:   sql`excluded.source_section`,
            districtContext: sql`excluded.district_context`,
            reasoning:       sql`excluded.reasoning`,
            pipelineRunId:   sql`excluded.pipeline_run_id`,
            extractedAt:     sql`now()`,
          },
        })
    }

    logger.info('fields stored', { count: rows.length })

    // 4. upsert zone fields (E2-155) — skipped when artifact has no zoneFields
    if (artifact.zoneFields && artifact.zoneFields.length > 0) {
      const zoneRows = artifact.zoneFields.map((zf) => ({
        jurisdictionId,
        zoneCode:                  zf.zone_code,
        zoneName:                  zf.zone_name,
        multifamilyClassification: zf.multifamily_classification,
        fieldName:                 zf.field_name,
        rawValue:                  toNumericString(zf.raw_value),
        rawUnit:                   clean(zf.raw_unit),
        fieldValue:                toNumericString(zf.field_value),
        fieldValueText:            clean(zf.field_value_text) ?? 'Not found in document',
        unit:                      clean(zf.unit),
        confidence:                zf.confidence,
        sourceSection:             clean(zf.source_section),
        reasoning:                 clean(zf.reasoning),
        pipelineRunId:             run!.id,
      }))

      const validZoneRows = zoneRows.filter((r) => r.zoneCode && r.fieldName)

      if (validZoneRows.length > 0) {
        await db
          .insert(zoneExtractedFields)
          .values(validZoneRows)
          .onConflictDoUpdate({
            target: [zoneExtractedFields.jurisdictionId, zoneExtractedFields.zoneCode, zoneExtractedFields.fieldName],
            set: {
              zoneName:                   sql`excluded.zone_name`,
              multifamilyClassification:  sql`excluded.multifamily_classification`,
              rawValue:                   sql`excluded.raw_value`,
              rawUnit:                    sql`excluded.raw_unit`,
              fieldValue:                 sql`excluded.field_value`,
              fieldValueText:             sql`excluded.field_value_text`,
              unit:                       sql`excluded.unit`,
              confidence:                 sql`excluded.confidence`,
              sourceSection:              sql`excluded.source_section`,
              reasoning:                  sql`excluded.reasoning`,
              pipelineRunId:              sql`excluded.pipeline_run_id`,
              extractedAt:                sql`now()`,
            },
          })
        logger.info('zone fields stored', { count: validZoneRows.length })
      }
    }

    // 5. complete run record
    run = await completeRun(db, run.id, { fieldsExtracted, fieldsFailed })
    logger.info('load stage complete', { runId: run.id, status: run.status, fieldsExtracted, fieldsFailed })

    return { run, fieldsExtracted, fieldsFailed, errors: [] }
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/\x00/g, '')
    logger.error('load stage fatal error', { jurisdictionId, message })

    if (run) {
      run = await failRun(db, run.id, message)
    }

    return {
      run: run ?? ({
        id: 'unknown',
        jurisdictionId,
        status: 'failed',
        fieldsExtracted: 0,
        fieldsFailed: 0,
        sourceDocument: artifact.sourceDocument,
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: message,
      } as PipelineRun),
      fieldsExtracted: 0,
      fieldsFailed: 0,
      errors: [{ fieldName: 'load', message }],
    }
  }
}

// ─── combined runner ──────────────────────────────────────────────────────────

/**
 * Run the full pipeline for a single jurisdiction (extract + load).
 * Preserves the pre-E0-8 behavior for CI — functionally identical to the old runPipeline.
 *
 * If options.artifactStore is provided, the artifact is written between stages
 * so it can be inspected or replayed without re-running Gemini.
 */
export async function runPipeline(
  db: Database,
  jurisdictionId: string,
  slug: string,
  options: RunnerOptions,
): Promise<RunResult> {
  const logger = options.logger ?? consoleLogger

  try {
    const artifact = await runExtractStage(jurisdictionId, slug, options)

    if (options.artifactStore) {
      logger.info('writing artifact', { slug })
      await options.artifactStore.write(slug, artifact)
      logger.info('artifact written', { slug })
    }

    return await runLoadStage(db, jurisdictionId, artifact, logger)
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/\x00/g, '')
    logger.error('pipeline fatal error', { jurisdictionId, message })

    return {
      run: {
        id: 'unknown',
        jurisdictionId,
        status: 'failed',
        fieldsExtracted: 0,
        fieldsFailed: 0,
        sourceDocument: null,
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: message,
      } as PipelineRun,
      fieldsExtracted: 0,
      fieldsFailed: 0,
      errors: [{ fieldName: 'pipeline', message }],
    }
  }
}

/**
 * Re-run the pipeline for a jurisdiction.
 * Identical to runPipeline — each call creates a new run record so the
 * prior run is preserved in history.
 */
export async function rerunPipeline(
  db: Database,
  jurisdictionId: string,
  slug: string,
  options: RunnerOptions,
): Promise<RunResult> {
  return runPipeline(db, jurisdictionId, slug, options)
}
