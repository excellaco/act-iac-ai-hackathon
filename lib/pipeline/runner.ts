/**
 * E0-1: Pipeline runner
 *
 * Orchestrates the full ingestion-to-extraction sequence for one jurisdiction:
 *
 *   fetch PDF → parse text → chunk → extract fields → normalize → validate → store
 *
 * Dependencies are injected via interfaces so each stage is independently
 * testable and replaceable (e.g. GCS fetch vs. local fallback, real LLM vs.
 * mock extractor).
 *
 * The runner never throws.  All errors are caught, logged, and reflected in
 * the pipeline run record (E0-5).  Individual field failures are handled by
 * safeExtract (E0-3) and produce partial results rather than aborting the run.
 */

import { Database } from '../../db/client'
import { extractedFields } from '../../db/schema'
import { chunkText } from './chunk'
import { normalizeExtractionResult, RawExtractionResult } from './normalize'
import { validateExtractionResult } from './validate'
import { runExtractions } from './errors'
import { startRun, completeRun, failRun, PipelineRun } from './run-record'
import { PipelineLogger, consoleLogger } from './errors'

// ─── injectable interfaces ────────────────────────────────────────────────────

/**
 * Fetches the raw PDF bytes for a jurisdiction.
 * Implementations: GCS fetch (prod) or local file read (dev fallback).
 */
export interface PdfFetcher {
  fetch(jurisdictionId: string): Promise<{ bytes: Buffer; sourceDocument: string }>
}

/**
 * Parses raw PDF bytes into plain text.
 * Implementation: pdf-parse (added in E1).
 */
export interface PdfParser {
  parse(bytes: Buffer): Promise<string>
}

/**
 * Extracts a single regulatory field from a text chunk.
 * Implementation: ADK LlmAgent (added in E2-1 through E2-7).
 *
 * Returns null if the field is not present in this chunk — the runner
 * aggregates across all chunks and picks the highest-confidence result.
 */
export interface FieldExtractor {
  fieldName: string
  extract(chunk: string): Promise<RawExtractionResult | null>
}

// ─── result types ─────────────────────────────────────────────────────────────

export interface RunResult {
  run: PipelineRun
  fieldsExtracted: number
  fieldsFailed: number
  errors: Array<{ fieldName: string; message: string }>
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

  for (const chunk of chunks) {
    try {
      const result = await extractor.extract(chunk)
      if (!result) continue

      if (!bestResult || confidenceRank(result.confidence) > confidenceRank(bestResult.confidence)) {
        bestResult = result
      }

      // stop as soon as we have a high-confidence result
      if (bestResult.confidence === 'high') break
    } catch (err) {
      logger.warn('extractor error on chunk', {
        fieldName: extractor.fieldName,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return bestResult
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

// ─── runner ───────────────────────────────────────────────────────────────────

export interface RunnerOptions {
  fetcher: PdfFetcher
  parser: PdfParser
  extractors: FieldExtractor[]
  logger?: PipelineLogger
}

/**
 * Run the full pipeline for a single jurisdiction.
 *
 * Stage order:
 * 1. Start run record
 * 2. Fetch PDF
 * 3. Parse PDF → text
 * 4. Chunk text
 * 5. Extract fields (parallel across extractors, sequential across chunks)
 * 6. Normalize each result
 * 7. Validate each result
 * 8. Store results to DB
 * 9. Complete run record
 */
export async function runPipeline(
  db: Database,
  jurisdictionId: string,
  options: RunnerOptions,
): Promise<RunResult> {
  const logger = options.logger ?? consoleLogger
  let run: PipelineRun | null = null

  try {
    // 1. start run record
    run = await startRun(db, jurisdictionId)
    logger.info('pipeline started', { jurisdictionId, runId: run.id })

    // 2. fetch PDF
    logger.info('fetching PDF', { jurisdictionId })
    const { bytes, sourceDocument } = await options.fetcher.fetch(jurisdictionId)

    // 3. parse PDF → text
    logger.info('parsing PDF', { sourceDocument })
    const text = await options.parser.parse(bytes)

    // 4. chunk text
    const chunks = chunkText(text)
    logger.info('text chunked', { chunkCount: chunks.length })

    // 5–7. extract, normalize, validate — one task per extractor
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

    const { outcomes, fieldsExtracted, fieldsFailed, errors } =
      await runExtractions(extractions, logger)

    // 8. store results to DB
    const rows = outcomes.map((o) => ({
      jurisdictionId,
      fieldName: o.result.field_name,
      rawValue: o.result.raw_value !== null ? String(o.result.raw_value) : null,
      rawUnit: o.result.raw_unit || null,
      fieldValue: o.result.field_value !== null ? String(o.result.field_value) : null,
      fieldValueText: o.result.field_value_text,
      unit: o.result.unit || null,
      confidence: o.result.confidence,
      sourceDocument,
      sourceSection: o.result.source_section || null,
      districtContext: o.result.district_context || null,
      pipelineRunId: run.id,
    }))

    if (rows.length > 0) {
      await db
        .insert(extractedFields)
        .values(rows)
        .onConflictDoUpdate({
          target: [extractedFields.jurisdictionId, extractedFields.fieldName],
          set: {
            rawValue: rows[0].rawValue,   // drizzle requires a set — actual values applied per row
            fieldValue: rows[0].fieldValue,
            confidence: rows[0].confidence,
            pipelineRunId: run.id,
          },
        })
    }

    logger.info('fields stored', { count: rows.length })

    // 9. complete run record
    run = await completeRun(db, run.id, { fieldsExtracted, fieldsFailed })
    logger.info('pipeline complete', { runId: run.id, status: run.status, fieldsExtracted, fieldsFailed })

    return {
      run,
      fieldsExtracted,
      fieldsFailed,
      errors: errors.map((e) => ({ fieldName: e.fieldName, message: e.message })),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('pipeline fatal error', { jurisdictionId, message })

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
        sourceDocument: null,
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: message,
      } as PipelineRun),
      fieldsExtracted: 0,
      fieldsFailed: 0,
      errors: [{ fieldName: 'pipeline', message }],
    }
  }
}
