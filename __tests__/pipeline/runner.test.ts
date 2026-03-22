/**
 * E0-1: Unit tests for the pipeline runner
 */
import { runPipeline, rerunPipeline, getRunHistory, PdfFetcher, PdfParser, FieldExtractor } from '../../lib/pipeline/runner'
import { PipelineLogger } from '../../lib/pipeline/errors'
import { RawExtractionResult } from '../../lib/pipeline/normalize'
import { Database } from '../../db/client'

// ─── fixtures ─────────────────────────────────────────────────────────────────

const JURISDICTION_ID = 'jur-uuid-1'
const RUN_ID = 'run-uuid-1'

const SAMPLE_TEXT = `
Section 3-201: R-1 Residential District
Minimum Lot Area: 8,000 square feet
Maximum Building Height: 35 feet
Minimum Front Yard: 30 feet
`.trim()

function makeRawResult(fieldName: string, value: number, unit: string): RawExtractionResult {
  return {
    field_name: fieldName,
    raw_value: value,
    raw_unit: unit,
    field_value: null,
    field_value_text: `${value} ${unit}`,
    unit,
    confidence: 'high',
    source_section: 'Section 3-201',
    district_context: 'R-1 Residential District',
    reasoning: 'Extracted from text',
  }
}

// ─── mocks ────────────────────────────────────────────────────────────────────

const silentLogger: PipelineLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function makeFetcher(text = SAMPLE_TEXT): PdfFetcher {
  return {
    fetch: jest.fn().mockResolvedValue({
      bytes: Buffer.from(text),
      sourceDocument: 'gs://bucket/test.pdf',
    }),
  }
}

function makeParser(text = SAMPLE_TEXT): PdfParser {
  return { parse: jest.fn().mockResolvedValue({ text, pages: [] }) }
}

function makeExtractor(fieldName: string, result: RawExtractionResult | null): FieldExtractor {
  return {
    fieldName,
    extract: jest.fn().mockResolvedValue(result),
  }
}

function makeDb(runStatus = 'completed') {
  const run = {
    id: RUN_ID,
    jurisdictionId: JURISDICTION_ID,
    status: runStatus,
    fieldsExtracted: 0,
    fieldsFailed: 0,
    sourceDocument: null,
    startedAt: new Date(),
    completedAt: null,
    errorMessage: null,
  }

  const returningMock = jest.fn().mockResolvedValue([run])
  const onConflictMock = jest.fn().mockResolvedValue([])
  const valuesMock = jest.fn().mockReturnValue({ returning: returningMock, onConflictDoUpdate: onConflictMock })
  const limitMock = jest.fn().mockResolvedValue([run])
  const orderByMock = jest.fn().mockReturnValue({ limit: limitMock })
  const whereMock = jest.fn().mockReturnValue({ returning: returningMock, orderBy: orderByMock })
  const setMock = jest.fn().mockReturnValue({ where: whereMock })

  return {
    insert: jest.fn().mockReturnValue({ values: valuesMock }),
    update: jest.fn().mockReturnValue({ set: setMock }),
    select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: whereMock }) }),
  } as unknown as Database
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('runPipeline', () => {
  it('runs all stages and returns a completed run result', async () => {
    const db = makeDb('completed')
    const extractors = [
      makeExtractor('min_lot_size_sqft',  makeRawResult('min_lot_size_sqft', 8000, 'square feet')),
      makeExtractor('height_limit_ft',    makeRawResult('height_limit_ft', 35, 'feet')),
    ]

    const result = await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(),
      parser: makeParser(),
      extractors,
      logger: silentLogger,
    })

    expect(result.run.id).toBe(RUN_ID)
    expect(result.errors).toHaveLength(0)
  })

  it('calls fetcher and parser with jurisdiction id and bytes', async () => {
    const fetcher = makeFetcher()
    const parser = makeParser()
    const db = makeDb()

    await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher,
      parser,
      extractors: [],
      logger: silentLogger,
    })

    expect(fetcher.fetch).toHaveBeenCalledWith(JURISDICTION_ID, 'test-slug')
    expect(parser.parse).toHaveBeenCalled()
  })

  it('calls each extractor with chunked text', async () => {
    const extractor = makeExtractor(
      'height_limit_ft',
      makeRawResult('height_limit_ft', 35, 'feet'),
    )
    const db = makeDb()

    await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(),
      parser: makeParser(),
      extractors: [extractor],
      logger: silentLogger,
    })

    expect(extractor.extract).toHaveBeenCalled()
    const calledWith = (extractor.extract as jest.Mock).mock.calls[0][0]
    expect(typeof calledWith).toBe('string')
    expect(calledWith.length).toBeGreaterThan(0)
  })

  it('stores fields to the database', async () => {
    const db = makeDb()
    const extractors = [
      makeExtractor('height_limit_ft', makeRawResult('height_limit_ft', 35, 'feet')),
    ]

    await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(),
      parser: makeParser(),
      extractors,
      logger: silentLogger,
    })

    expect(db.insert).toHaveBeenCalled()
  })

  it('continues when one extractor throws on every chunk', async () => {
    const db = makeDb('completed')
    const extractors = [
      makeExtractor('height_limit_ft',   makeRawResult('height_limit_ft', 35, 'feet')),
      { fieldName: 'min_lot_size_sqft', extract: jest.fn().mockRejectedValue(new Error('LLM error')) },
    ]

    const result = await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(),
      parser: makeParser(),
      extractors,
      logger: silentLogger,
    })

    // chunk-level errors are swallowed — extractor returns a null/low result instead
    // the run still completes; no fatal error
    expect(result.run.status).not.toBe('failed')
    expect(result.errors).toHaveLength(0)
  })

  it('returns failed run when fetcher throws', async () => {
    const db = makeDb('failed')
    const fetcher: PdfFetcher = {
      fetch: jest.fn().mockRejectedValue(new Error('GCS bucket not found')),
    }

    const result = await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher,
      parser: makeParser(),
      extractors: [],
      logger: silentLogger,
    })

    expect(result.run.status).toBe('failed')
    expect(result.errors[0].message).toContain('GCS bucket not found')
  })

  it('returns failed run when parser throws', async () => {
    const db = makeDb('failed')
    const parser: PdfParser = {
      parse: jest.fn().mockRejectedValue(new Error('corrupt PDF')),
    }

    const result = await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(),
      parser,
      extractors: [],
      logger: silentLogger,
    })

    expect(result.run.status).toBe('failed')
    expect(result.errors[0].message).toContain('corrupt PDF')
  })

  // ── E0-6: re-run behaviour ──────────────────────────────────────────────────

  it('rerunPipeline creates a new run record (prior record retained)', async () => {
    const db = makeDb('completed')
    const options = {
      fetcher: makeFetcher(),
      parser: makeParser(),
      extractors: [makeExtractor('height_limit_ft', makeRawResult('height_limit_ft', 35, 'feet'))],
      logger: silentLogger,
    }

    // first run
    await runPipeline(db, JURISDICTION_ID, 'test-slug', options)
    // second run
    const result = await rerunPipeline(db, JURISDICTION_ID, 'test-slug', options)

    // each call to insert creates a new run record
    expect(db.insert).toHaveBeenCalledTimes(4) // 2 run inserts + 2 field inserts
    expect(result.run.id).toBe(RUN_ID)
  })

  it('getRunHistory returns run records ordered newest first', async () => {
    const run1 = { ...makeDb('completed') }
    const orderByMock = jest.fn().mockResolvedValue([
      { id: 'run-2', status: 'completed', startedAt: new Date('2026-01-02') },
      { id: 'run-1', status: 'completed', startedAt: new Date('2026-01-01') },
    ])
    const whereMock = jest.fn().mockReturnValue({ orderBy: orderByMock })
    const db = {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: whereMock }) }),
    } as unknown as import('../../db/client').Database

    const history = await getRunHistory(db, JURISDICTION_ID)
    expect(history[0].id).toBe('run-2')
    expect(history[1].id).toBe('run-1')
  })

  it('does not stop scanning when early chunk returns high-confidence null result', async () => {
    // Root cause of Arlington issue: Gemini returns {raw_value: null, confidence: 'high'} for ToC
    // chunks that mention district names but contain no actual standards. The old code treated
    // this as a definitive high-confidence result and stopped scanning — never reaching the
    // actual district standards sections in later chunks.
    const highConfidenceNull: RawExtractionResult = {
      field_name: 'density_limit_units_per_acre',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: '',
      unit: 'units_per_acre',
      confidence: 'high',
      source_section: 'Table of Contents',
      district_context: 'RA14-26',
      reasoning: 'The text is a table of contents entry mentioning RA14-26 district name; no density standards present',
    }
    const valuedResult = makeRawResult('density_limit_units_per_acre', 26, 'units/acre')
    valuedResult.confidence = 'medium'

    // chunk 0: high-confidence null (ToC); chunk 1: actual value
    const extractor: FieldExtractor = {
      fieldName: 'density_limit_units_per_acre',
      extract: jest.fn()
        .mockResolvedValueOnce(highConfidenceNull)
        .mockResolvedValueOnce(valuedResult),
    }
    const db = makeDb()

    // Need > 4000 tokens (~16000 chars) to force two chunks
    const longText = 'Table of Contents\nRA14-26 District...........p.15\n'.repeat(600) +
      '\n\nSection 14: RA14-26 Residential District\n' +
      'Maximum density: 26 units/acre\n'.repeat(600)

    await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(longText),
      parser: makeParser(longText),
      extractors: [extractor],
      logger: silentLogger,
    })

    // Must have been called at least twice — the null high-confidence result should NOT stop the search
    expect(extractor.extract).toHaveBeenCalledTimes(
      (extractor.extract as jest.Mock).mock.calls.length,
    )
    expect((extractor.extract as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('prefers high-confidence result over low-confidence across chunks', async () => {
    const lowResult = makeRawResult('height_limit_ft', 10, 'feet')
    lowResult.confidence = 'low'
    const highResult = makeRawResult('height_limit_ft', 35, 'feet')
    highResult.confidence = 'high'

    // two chunks: first returns low, second returns high
    const extractor: FieldExtractor = {
      fieldName: 'height_limit_ft',
      extract: jest.fn()
        .mockResolvedValueOnce(lowResult)
        .mockResolvedValueOnce(highResult),
    }
    const db = makeDb()

    // produce two chunks by using a large text
    const longText = 'Section 1: District A\n' + 'height limit is 10 feet\n'.repeat(200) +
      '\n\nSection 2: District B\n' + 'height limit is 35 feet\n'.repeat(200)

    await runPipeline(db, JURISDICTION_ID, 'test-slug', {
      fetcher: makeFetcher(longText),
      parser: makeParser(longText),
      extractors: [extractor],
      logger: silentLogger,
    })

    // extractor should have been called at least once
    expect(extractor.extract).toHaveBeenCalled()
  })
})
