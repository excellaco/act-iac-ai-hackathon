/**
 * E0-8: Unit tests for runLoadStage
 */
import { runLoadStage } from '../../lib/pipeline/runner'
import { ExtractionArtifact } from '../../lib/pipeline/artifact'
import { Database } from '../../db/client'
import { PipelineLogger } from '../../lib/pipeline/errors'

const JURISDICTION_ID = 'jur-uuid-1'
const RUN_ID = 'run-uuid-1'

const silentLogger: PipelineLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

function makeDb() {
  const run = {
    id: RUN_ID,
    jurisdictionId: JURISDICTION_ID,
    status: 'completed',
    fieldsExtracted: 0,
    fieldsFailed: 0,
    sourceDocument: 'synthetic',
    startedAt: new Date(),
    completedAt: null,
    errorMessage: null,
  }
  const returningMock = jest.fn().mockResolvedValue([run])
  const onConflictMock = jest.fn().mockResolvedValue([])
  const valuesMock = jest.fn().mockReturnValue({ returning: returningMock, onConflictDoUpdate: onConflictMock })
  const whereMock = jest.fn().mockReturnValue({ returning: returningMock })
  const setMock = jest.fn().mockReturnValue({ where: whereMock })

  return {
    insert: jest.fn().mockReturnValue({ values: valuesMock }),
    update: jest.fn().mockReturnValue({ set: setMock }),
  } as unknown as Database
}

function makeArtifact(fields: ExtractionArtifact['fields'] = {}): ExtractionArtifact {
  return {
    jurisdictionId: JURISDICTION_ID,
    slug: 'fairfax-va',
    sourceDocument: 'gs://bucket/test.pdf',
    extractedAt: '2026-03-18T00:00:00.000Z',
    fields,
  }
}

describe('runLoadStage', () => {
  it('creates a pipeline run record', async () => {
    const db = makeDb()
    await runLoadStage(db, JURISDICTION_ID, makeArtifact(), silentLogger)
    expect(db.insert).toHaveBeenCalled()
  })

  it('upserts extracted fields for each field in the artifact', async () => {
    const db = makeDb()
    const artifact = makeArtifact({
      height_limit_ft: {
        raw_value: 35,
        raw_unit: 'ft',
        field_value: 35,
        field_value_text: '35 feet',
        unit: 'ft',
        confidence: 'high',
        source_section: 'Section 1',
        district_context: 'R-1',
        reasoning: 'extracted',
      },
      min_lot_size_sqft: {
        raw_value: 8000,
        raw_unit: 'sq ft',
        field_value: 8000,
        field_value_text: '8,000 sq ft',
        unit: 'sqft',
        confidence: 'high',
        source_section: 'Section 2',
        district_context: 'R-1',
        reasoning: 'extracted',
      },
    })

    await runLoadStage(db, JURISDICTION_ID, artifact, silentLogger)
    // db.insert called twice: once for startRun, once for field upsert
    expect(db.insert).toHaveBeenCalledTimes(2)
  })

  it('returns RunResult with run id', async () => {
    const db = makeDb()
    const result = await runLoadStage(db, JURISDICTION_ID, makeArtifact(), silentLogger)
    expect(result.run.id).toBe(RUN_ID)
  })

  it('handles empty fields artifact without error', async () => {
    const db = makeDb()
    const result = await runLoadStage(db, JURISDICTION_ID, makeArtifact({}), silentLogger)
    // no field insert — only startRun insert
    expect(db.insert).toHaveBeenCalledTimes(1)
    expect(result.errors).toHaveLength(0)
  })

  it('handles discretionary_review_required (null raw_value) correctly', async () => {
    const db = makeDb()
    const artifact = makeArtifact({
      discretionary_review_required: {
        raw_value: null,
        raw_unit: null,
        field_value: null,
        field_value_text: 'by_right',
        unit: null,
        confidence: 'high',
        source_section: 'Section 5',
        district_context: 'R-1',
        reasoning: 'By-right approval',
      },
    })

    const result = await runLoadStage(db, JURISDICTION_ID, artifact, silentLogger)
    expect(result.errors).toHaveLength(0)
    // field IS counted as extracted (categorical field with null raw_value)
    expect(result.fieldsExtracted).toBe(1)
  })

  it('returns failed run when DB insert throws', async () => {
    const failingDb = {
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockRejectedValue(new Error('DB connection lost')),
          onConflictDoUpdate: jest.fn().mockRejectedValue(new Error('DB connection lost')),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as unknown as Database

    const result = await runLoadStage(failingDb, JURISDICTION_ID, makeArtifact(), silentLogger)
    expect(result.run.status).toBe('failed')
    expect(result.errors[0].message).toContain('DB connection lost')
  })
})
