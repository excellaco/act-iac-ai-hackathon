/**
 * E0-3: Pipeline error handling for LLM extraction failures
 *
 * Provides a safe wrapper for individual field extractions so that one
 * failing field never blocks the rest of the pipeline run.
 *
 * Design:
 * - `safeExtract` wraps any extraction call and returns a guaranteed result.
 *   On failure it returns a null-value result with confidence 'low' and
 *   captures the error details in `ExtractionError`.
 * - `PipelineLogger` is a minimal structured logger interface so callers can
 *   inject their preferred sink (console in dev, Cloud Logging in prod).
 * - `ExtractionError` carries enough context to populate the pipeline run
 *   record (E0-5): field name, error message, and optional stack trace.
 */

import { NormalizedExtractionResult } from './normalize'
import { GeminiLimiter } from './gemini-concurrency'
import { PipelineLogger, consoleLogger } from './logger'

export type { PipelineLogger }
export { consoleLogger }

// ─── types ────────────────────────────────────────────────────────────────────

export interface ExtractionError {
  fieldName: string
  message: string
  stack?: string
}

export interface ExtractionOutcome {
  /** True when extraction and normalization succeeded without error */
  ok: boolean
  result: NormalizedExtractionResult
  error: ExtractionError | null
}

// ─── null result factory ──────────────────────────────────────────────────────

/**
 * Returns a well-formed null result for a field that could not be extracted.
 * Used both as the error fallback and for "not found" cases.
 */
export function nullResult(
  fieldName: string,
  reason: string,
): NormalizedExtractionResult {
  return {
    field_name: fieldName,
    raw_value: null,
    raw_unit: '',
    field_value: null,
    field_value_text: reason,
    unit: '',
    confidence: 'low',
    source_section: '',
    district_context: '',
    reasoning: reason,
  }
}

// ─── safe wrapper ─────────────────────────────────────────────────────────────

/**
 * Safely executes an async extraction function for a single field.
 *
 * If the extractor throws or rejects, the error is caught, logged, and a
 * null result with confidence 'low' is returned.  The pipeline can inspect
 * `outcome.ok` to count field-level failures without re-throwing.
 *
 * @param fieldName  The field being extracted (used in error messages and logs)
 * @param extractor  Async function that returns the extraction result
 * @param logger     Optional logger (defaults to consoleLogger)
 */
export async function safeExtract(
  fieldName: string,
  extractor: () => Promise<NormalizedExtractionResult>,
  logger: PipelineLogger = consoleLogger,
): Promise<ExtractionOutcome> {
  try {
    logger.info('extraction started', { fieldName })
    const result = await extractor()
    logger.info('extraction completed', {
      fieldName,
      confidence: result.confidence,
      hasValue: result.field_value !== null,
    })
    return { ok: true, result, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    const extractionError: ExtractionError = { fieldName, message, stack }

    logger.error('extraction failed', { fieldName, message })

    return {
      ok: false,
      result: nullResult(fieldName, `Extraction failed: ${message}`),
      error: extractionError,
    }
  }
}

/**
 * Run multiple field extractions in parallel, collecting all outcomes.
 * Never rejects — every field either succeeds or produces a null result.
 *
 * Returns a summary alongside individual outcomes so the pipeline runner
 * can log totals and update the pipeline run record (E0-5).
 */
export async function runExtractions(
  extractions: Array<{ fieldName: string; extractor: () => Promise<NormalizedExtractionResult> }>,
  logger: PipelineLogger = consoleLogger,
  limiter?: GeminiLimiter,
): Promise<{
  outcomes: ExtractionOutcome[]
  fieldsExtracted: number
  fieldsFailed: number
  errors: ExtractionError[]
}> {
  const outcomes = await Promise.all(
    extractions.map(({ fieldName, extractor }) =>
      limiter
        ? limiter(() => safeExtract(fieldName, extractor, logger))
        : safeExtract(fieldName, extractor, logger),
    ),
  )

  const errors = outcomes.filter((o) => !o.ok).map((o) => o.error!)
  const fieldsExtracted = outcomes.filter((o) => o.ok && o.result.field_value !== null).length
  const fieldsFailed = outcomes.filter((o) => !o.ok).length

  return { outcomes, fieldsExtracted, fieldsFailed, errors }
}
