/**
 * E0-3: Unit tests for pipeline error handling
 */
import {
  safeExtract,
  runExtractions,
  nullResult,
  PipelineLogger,
  ExtractionOutcome,
} from '../../lib/pipeline/errors'
import { NormalizedExtractionResult } from '../../lib/pipeline/normalize'

// ─── test helpers ─────────────────────────────────────────────────────────────

function makeResult(fieldName: string, fieldValue: number | null = 35): NormalizedExtractionResult {
  return {
    field_name: fieldName,
    raw_value: fieldValue,
    raw_unit: 'feet',
    field_value: fieldValue,
    field_value_text: 'verbatim quote',
    unit: 'ft',
    confidence: 'high',
    source_section: 'Section 1',
    district_context: 'R-1',
    reasoning: 'test',
  }
}

const silentLogger: PipelineLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// ─── nullResult ───────────────────────────────────────────────────────────────

describe('nullResult', () => {
  it('returns a well-formed null result with low confidence', () => {
    const r = nullResult('height_limit_ft', 'not found')
    expect(r.field_name).toBe('height_limit_ft')
    expect(r.field_value).toBeNull()
    expect(r.raw_value).toBeNull()
    expect(r.confidence).toBe('low')
    expect(r.field_value_text).toBe('not found')
  })
})

// ─── safeExtract ──────────────────────────────────────────────────────────────

describe('safeExtract', () => {
  it('returns ok=true and the result on success', async () => {
    const extractor = jest.fn().mockResolvedValue(makeResult('height_limit_ft'))
    const outcome = await safeExtract('height_limit_ft', extractor, silentLogger)

    expect(outcome.ok).toBe(true)
    expect(outcome.error).toBeNull()
    expect(outcome.result.field_name).toBe('height_limit_ft')
    expect(outcome.result.field_value).toBe(35)
  })

  it('returns ok=false and a null result when extractor throws', async () => {
    const extractor = jest.fn().mockRejectedValue(new Error('LLM timeout'))
    const outcome = await safeExtract('height_limit_ft', extractor, silentLogger)

    expect(outcome.ok).toBe(false)
    expect(outcome.result.field_value).toBeNull()
    expect(outcome.result.confidence).toBe('low')
    expect(outcome.error).not.toBeNull()
    expect(outcome.error!.message).toBe('LLM timeout')
    expect(outcome.error!.fieldName).toBe('height_limit_ft')
  })

  it('captures stack trace on error', async () => {
    const err = new Error('parse error')
    const extractor = jest.fn().mockRejectedValue(err)
    const outcome = await safeExtract('min_lot_size_sqft', extractor, silentLogger)

    expect(outcome.error!.stack).toBeDefined()
  })

  it('handles non-Error throws (string rejection)', async () => {
    const extractor = jest.fn().mockRejectedValue('something went wrong')
    const outcome = await safeExtract('height_limit_ft', extractor, silentLogger)

    expect(outcome.ok).toBe(false)
    expect(outcome.error!.message).toBe('something went wrong')
  })

  it('logs info on success', async () => {
    const logger: PipelineLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    const extractor = jest.fn().mockResolvedValue(makeResult('height_limit_ft'))
    await safeExtract('height_limit_ft', extractor, logger)

    expect(logger.info).toHaveBeenCalledWith('extraction started', expect.objectContaining({ fieldName: 'height_limit_ft' }))
    expect(logger.info).toHaveBeenCalledWith('extraction completed', expect.objectContaining({ fieldName: 'height_limit_ft' }))
  })

  it('logs error on failure', async () => {
    const logger: PipelineLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
    const extractor = jest.fn().mockRejectedValue(new Error('boom'))
    await safeExtract('height_limit_ft', extractor, logger)

    expect(logger.error).toHaveBeenCalledWith('extraction failed', expect.objectContaining({ fieldName: 'height_limit_ft', message: 'boom' }))
  })
})

// ─── runExtractions ───────────────────────────────────────────────────────────

describe('runExtractions', () => {
  it('runs all extractions and returns outcomes for each', async () => {
    const extractions = [
      { fieldName: 'height_limit_ft',    extractor: jest.fn().mockResolvedValue(makeResult('height_limit_ft')) },
      { fieldName: 'min_lot_size_sqft',  extractor: jest.fn().mockResolvedValue(makeResult('min_lot_size_sqft', 8000)) },
    ]
    const { outcomes } = await runExtractions(extractions, silentLogger)

    expect(outcomes).toHaveLength(2)
    expect(outcomes[0].ok).toBe(true)
    expect(outcomes[1].ok).toBe(true)
  })

  it('continues when one extractor fails', async () => {
    const extractions = [
      { fieldName: 'height_limit_ft',   extractor: jest.fn().mockRejectedValue(new Error('LLM error')) },
      { fieldName: 'min_lot_size_sqft', extractor: jest.fn().mockResolvedValue(makeResult('min_lot_size_sqft', 8000)) },
      { fieldName: 'setback_front_ft',  extractor: jest.fn().mockResolvedValue(makeResult('setback_front_ft', 30)) },
    ]
    const { outcomes, fieldsExtracted, fieldsFailed, errors } =
      await runExtractions(extractions, silentLogger)

    expect(outcomes).toHaveLength(3)
    expect(fieldsFailed).toBe(1)
    expect(fieldsExtracted).toBe(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldName).toBe('height_limit_ft')
  })

  it('handles all extractors failing', async () => {
    const extractions = [
      { fieldName: 'height_limit_ft',  extractor: jest.fn().mockRejectedValue(new Error('x')) },
      { fieldName: 'min_lot_size_sqft', extractor: jest.fn().mockRejectedValue(new Error('y')) },
    ]
    const { fieldsExtracted, fieldsFailed } = await runExtractions(extractions, silentLogger)

    expect(fieldsFailed).toBe(2)
    expect(fieldsExtracted).toBe(0)
  })

  it('counts null field_value results as not extracted (not as failures)', async () => {
    // A successful extraction that found no value — ok=true but field_value=null
    const notFound = makeResult('height_limit_ft', null)
    const extractions = [
      { fieldName: 'height_limit_ft', extractor: jest.fn().mockResolvedValue(notFound) },
    ]
    const { fieldsExtracted, fieldsFailed } = await runExtractions(extractions, silentLogger)

    expect(fieldsFailed).toBe(0)   // no error thrown
    expect(fieldsExtracted).toBe(0) // but no value found either
  })

  it('runs extractions in parallel (all start before any completes)', async () => {
    const order: string[] = []
    const extractions = ['a', 'b', 'c'].map((name) => ({
      fieldName: name,
      extractor: jest.fn().mockImplementation(async () => {
        order.push(`start:${name}`)
        await Promise.resolve()
        order.push(`end:${name}`)
        return makeResult(name)
      }),
    }))

    await runExtractions(extractions, silentLogger)

    // All three should have started before any ended
    const startIndices = ['a', 'b', 'c'].map((n) => order.indexOf(`start:${n}`))
    const firstEnd = Math.min(...['a', 'b', 'c'].map((n) => order.indexOf(`end:${n}`)))
    expect(Math.max(...startIndices)).toBeLessThan(firstEnd)
  })
})
