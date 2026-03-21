/**
 * @jest-environment node
 */

// Mock ADK to avoid lodash-es ESM import issues in Jest
jest.mock('@google/adk', () => ({
  FunctionTool: class FunctionTool {
    name: string
    execute: (...args: unknown[]) => unknown
    constructor(config: { name: string; execute: (...args: unknown[]) => unknown }) {
      this.name = config.name
      this.execute = config.execute
    }
  },
}))

jest.mock('zod', () => {
  const describe = () => proxy
  const proxy: Record<string, unknown> = new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'describe') return describe
      if (prop === 'object') return () => proxy
      return () => proxy
    },
  })
  return { z: { object: () => proxy, string: () => proxy, number: () => proxy } }
})

jest.mock('@/db/client', () => ({
  db: {
    query: {
      jurisdictions:      { findFirst: jest.fn() },
      risScores:          { findFirst: jest.fn() },
      feasibilityOutputs: { findFirst: jest.fn() },
      marketData:         { findFirst: jest.fn() },
    },
    select: jest.fn(),
  },
}))

jest.mock('@google-cloud/storage', () => {
  const mockDownload = jest.fn()
  const mockExists = jest.fn()
  const mockSave = jest.fn()
  const mockFile = jest.fn().mockReturnValue({
    exists: mockExists,
    download: mockDownload,
    save: mockSave,
  })
  const mockGetFiles = jest.fn()
  const mockBucket = jest.fn().mockReturnValue({
    file: mockFile,
    getFiles: mockGetFiles,
  })
  return {
    Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
    __mockExists: mockExists,
    __mockDownload: mockDownload,
  }
})

jest.mock('@/lib/pipeline/gcs-fetcher', () => ({
  GcsFetcher: jest.fn().mockImplementation(() => ({
    fetch: jest.fn().mockResolvedValue({
      bytes: Buffer.from('fake pdf content'),
      sourceDocument: 'gs://test-bucket/zoning/fairfax/ordinance.pdf',
    }),
  })),
}))

jest.mock('@/lib/pipeline/pdf-parser', () => ({
  PdfParserImpl: jest.fn().mockImplementation(() => ({
    parse: jest.fn().mockResolvedValue('Parsed zoning ordinance text...'),
  })),
}))

import { db } from '@/db/client'
import {
  getJurisdictionDataTool,
  getPdfTextTool,
  computeFeasibilityToolDef,
} from '../../lib/chat/tools'

const {
  __mockExists: mockExists,
  __mockDownload: mockDownload,
} = jest.requireMock('@google-cloud/storage')

const mockJurisdiction = {
  id: 'uuid-1',
  name: 'Fairfax County',
  state: 'VA',
  displayName: 'Fairfax County, VA',
  slug: 'fairfax',
  dataType: 'real',
}

const mockSyntheticJurisdiction = {
  id: 'uuid-synth',
  name: 'Test County',
  state: 'TX',
  displayName: 'Test County, TX',
  slug: 'test-county',
  dataType: 'synthetic',
}

describe('get_jurisdiction_data tool', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    })
    ;(db.query.risScores.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.query.feasibilityOutputs.findFirst as jest.Mock).mockResolvedValue(null)
    ;(db.query.marketData.findFirst as jest.Mock).mockResolvedValue(null)
  })

  it('returns jurisdiction data with all fields', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    ;(db.query.risScores.findFirst as jest.Mock).mockResolvedValue({
      risComposite: '73', dci: '75', dcoi: '70', pci: '65', crp: '80',
    })

    const result = await getJurisdictionDataTool.execute({ jurisdictionId: 'uuid-1' })

    expect(result).toEqual(expect.objectContaining({
      jurisdiction: expect.objectContaining({ name: 'Fairfax County' }),
      risScore: expect.objectContaining({ risComposite: '73' }),
      extractedFields: [],
      feasibility: null,
      marketData: null,
    }))
  })

  it('returns error for unknown jurisdiction', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await getJurisdictionDataTool.execute({ jurisdictionId: 'unknown' })

    expect(result).toEqual({ error: 'Jurisdiction not found' })
  })
})

describe('get_pdf_text tool', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, RAW_DATA_BUCKET: 'test-bucket' }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unavailable for synthetic jurisdictions', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockSyntheticJurisdiction)

    const result = await getPdfTextTool.execute({ jurisdictionId: 'uuid-synth' })

    expect(result).toEqual(expect.objectContaining({ unavailable: true }))
  })

  it('returns cached text when available', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    mockExists.mockResolvedValue([true])
    mockDownload.mockResolvedValue([Buffer.from('Cached ordinance text')])

    const result = await getPdfTextTool.execute({ jurisdictionId: 'uuid-1' })

    expect(result).toEqual(expect.objectContaining({
      text: 'Cached ordinance text',
      cached: true,
    }))
  })

  it('fetches and parses PDF when not cached', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    mockExists.mockResolvedValue([false])

    const result = await getPdfTextTool.execute({ jurisdictionId: 'uuid-1' })

    expect(result).toEqual(expect.objectContaining({
      text: 'Parsed zoning ordinance text...',
      sourceDocument: 'gs://test-bucket/zoning/fairfax/ordinance.pdf',
    }))
  })

  it('returns unavailable when RAW_DATA_BUCKET is not set', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    delete process.env.RAW_DATA_BUCKET

    const result = await getPdfTextTool.execute({ jurisdictionId: 'uuid-1' })

    expect(result).toEqual(expect.objectContaining({ unavailable: true }))
  })
})

describe('compute_feasibility tool', () => {
  it('returns feasibility outputs for given inputs', () => {
    const result = computeFeasibilityToolDef.execute({
      densityLimitUpa: 20,
      parkingMinSpacesPerUnit: 1.5,
      regionalMultiplier: 1.10,
      fmr2br: 2280,
    })

    expect(result).toEqual(expect.objectContaining({
      maxUnitsPerAcre: 20,
      parkingFootprintPct: expect.any(Number),
      estimatedCostPerUnit: expect.any(Number),
      monthlyCarryingCost: expect.any(Number),
      rentFeasibility: expect.stringMatching(/^(Feasible|Marginal|Infeasible)$/),
      fmr2br: 2280,
    }))
  })

  it('produces internally consistent results', () => {
    const result = computeFeasibilityToolDef.execute({
      densityLimitUpa: 12,
      parkingMinSpacesPerUnit: 2.0,
      regionalMultiplier: 1.12,
      fmr2br: 2280,
    })

    expect(result.monthlyCarryingCost).toBe(Math.round(result.estimatedCostPerUnit / 240))
  })
})
