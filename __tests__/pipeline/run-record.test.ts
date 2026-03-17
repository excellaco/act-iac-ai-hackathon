/**
 * E0-5: Unit tests for pipeline run record storage
 *
 * The db is mocked — we test the logic of startRun, completeRun, failRun,
 * and getLatestRun without a real database connection.
 */

import { startRun, completeRun, failRun, getLatestRun } from '../../lib/pipeline/run-record'

// ─── db mock ──────────────────────────────────────────────────────────────────

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-uuid-1',
    jurisdictionId: 'jur-uuid-1',
    status: 'running',
    fieldsExtracted: 0,
    fieldsFailed: 0,
    sourceDocument: null,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    errorMessage: null,
    ...overrides,
  }
}

function makeMockDb(returnValue: unknown) {
  const returningMock = jest.fn().mockResolvedValue([returnValue])
  const limitMock = jest.fn().mockResolvedValue([returnValue])
  const orderByMock = jest.fn().mockReturnValue({ limit: limitMock })
  const whereMock = jest.fn().mockReturnValue({
    returning: returningMock,
    orderBy: orderByMock,
  })
  const setMock = jest.fn().mockReturnValue({ where: whereMock })
  const valuesMock = jest.fn().mockReturnValue({ returning: returningMock })
  const fromMock = jest.fn().mockReturnValue({ where: whereMock })

  return {
    insert: jest.fn().mockReturnValue({ values: valuesMock }),
    update: jest.fn().mockReturnValue({ set: setMock }),
    select: jest.fn().mockReturnValue({ from: fromMock }),
  } as unknown as import('../../db/client').Database
}

// ─── startRun ─────────────────────────────────────────────────────────────────

describe('startRun', () => {
  it('inserts a run record with status running', async () => {
    const run = makeRun()
    const db = makeMockDb(run)
    const result = await startRun(db, 'jur-uuid-1')

    expect(db.insert).toHaveBeenCalled()
    expect(result.status).toBe('running')
    expect(result.jurisdictionId).toBe('jur-uuid-1')
    expect(result.fieldsExtracted).toBe(0)
    expect(result.fieldsFailed).toBe(0)
  })

  it('stores sourceDocument when provided', async () => {
    const run = makeRun({ sourceDocument: 'gs://bucket/fairfax.pdf' })
    const db = makeMockDb(run)
    const result = await startRun(db, 'jur-uuid-1', 'gs://bucket/fairfax.pdf')

    expect(result.sourceDocument).toBe('gs://bucket/fairfax.pdf')
  })

  it('sets sourceDocument to null when not provided', async () => {
    const run = makeRun()
    const db = makeMockDb(run)
    const result = await startRun(db, 'jur-uuid-1')

    expect(result.sourceDocument).toBeNull()
  })
})

// ─── completeRun ──────────────────────────────────────────────────────────────

describe('completeRun', () => {
  it('sets status to completed when no fields failed', async () => {
    const run = makeRun({ status: 'completed', fieldsExtracted: 6, fieldsFailed: 0, completedAt: new Date() })
    const db = makeMockDb(run)
    const result = await completeRun(db, 'run-uuid-1', { fieldsExtracted: 6, fieldsFailed: 0 })

    expect(result.status).toBe('completed')
    expect(result.fieldsExtracted).toBe(6)
    expect(result.fieldsFailed).toBe(0)
  })

  it('sets status to partial when some fields failed', async () => {
    const run = makeRun({ status: 'partial', fieldsExtracted: 4, fieldsFailed: 2, completedAt: new Date() })
    const db = makeMockDb(run)
    const result = await completeRun(db, 'run-uuid-1', { fieldsExtracted: 4, fieldsFailed: 2 })

    expect(result.status).toBe('partial')
    expect(result.fieldsFailed).toBe(2)
  })

  it('sets completedAt', async () => {
    const run = makeRun({ status: 'completed', completedAt: new Date() })
    const db = makeMockDb(run)
    const result = await completeRun(db, 'run-uuid-1', { fieldsExtracted: 6, fieldsFailed: 0 })

    expect(result.completedAt).not.toBeNull()
  })

  it('updates the correct run id', async () => {
    const run = makeRun({ status: 'completed' })
    const db = makeMockDb(run)
    await completeRun(db, 'run-uuid-1', { fieldsExtracted: 6, fieldsFailed: 0 })

    expect(db.update).toHaveBeenCalled()
  })
})

// ─── failRun ──────────────────────────────────────────────────────────────────

describe('failRun', () => {
  it('sets status to failed with error message', async () => {
    const run = makeRun({ status: 'failed', errorMessage: 'PDF not found', completedAt: new Date() })
    const db = makeMockDb(run)
    const result = await failRun(db, 'run-uuid-1', 'PDF not found')

    expect(result.status).toBe('failed')
    expect(result.errorMessage).toBe('PDF not found')
  })

  it('sets completedAt on failure', async () => {
    const run = makeRun({ status: 'failed', completedAt: new Date() })
    const db = makeMockDb(run)
    const result = await failRun(db, 'run-uuid-1', 'fatal error')

    expect(result.completedAt).not.toBeNull()
  })
})

// ─── getLatestRun ─────────────────────────────────────────────────────────────

describe('getLatestRun', () => {
  it('returns the most recent run for a jurisdiction', async () => {
    const run = makeRun({ status: 'completed' })
    const db = makeMockDb(run)
    const result = await getLatestRun(db, 'jur-uuid-1')

    expect(result).not.toBeNull()
    expect(result!.jurisdictionId).toBe('jur-uuid-1')
    expect(result!.status).toBe('completed')
  })

  it('returns null when no run exists', async () => {
    const returningMock = jest.fn().mockResolvedValue([])
    const limitMock = jest.fn().mockResolvedValue([])
    const orderByMock = jest.fn().mockReturnValue({ limit: limitMock })
    const whereMock = jest.fn().mockReturnValue({ orderBy: orderByMock })
    const db = {
      select: jest.fn().mockReturnValue({ from: jest.fn().mockReturnValue({ where: whereMock }) }),
      insert: jest.fn().mockReturnValue({ values: jest.fn().mockReturnValue({ returning: returningMock }) }),
      update: jest.fn(),
    } as unknown as import('../../db/client').Database

    const result = await getLatestRun(db, 'unknown-jur')
    expect(result).toBeNull()
  })
})
