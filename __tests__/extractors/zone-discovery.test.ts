/**
 * @jest-environment node
 */

const mockGenerateContent = jest.fn()

jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}))

jest.mock('../../lib/pipeline/gemini-concurrency', () => ({
  withRetry: jest.fn((fn: () => Promise<string>) => fn()),
}))

import { discoverZones, matchZoneCode } from '../../lib/extractors/zone-discovery.extractor'

function mockResponse(json: unknown) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    },
  })
}

function mockResponseText(text: string) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text }] } }],
    },
  })
}

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}

describe('discoverZones', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, GOOGLE_CLOUD_PROJECT: 'test-project' }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('discovers zones from a single chunk', async () => {
    mockResponse([
      { zone_code: 'R-1', zone_name: 'Low Density Residential', multifamily_classification: 'none' },
      { zone_code: 'RM-2', zone_name: 'Multifamily', multifamily_classification: 'primary' },
    ])

    const result = await discoverZones(['chunk text'], undefined, mockLogger)

    expect(result).toHaveLength(2)
    expect(result[0].zone_code).toBe('R-1')
    expect(result[1].zone_code).toBe('RM-2')
    expect(result[1].multifamily_classification).toBe('primary')
  })

  it('deduplicates zones across chunks — higher classification wins', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', zone_name: null, multifamily_classification: 'limited' },
        ]) }] } }] },
      })
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', zone_name: 'Low Density', multifamily_classification: 'permitted' },
        ]) }] } }] },
      })

    const result = await discoverZones(['chunk1', 'chunk2'], undefined, mockLogger)

    expect(result).toHaveLength(1)
    expect(result[0].multifamily_classification).toBe('permitted')
    expect(result[0].zone_name).toBe('Low Density')
  })

  it('normalizes zone codes for deduplication (r-1 and R_1 merge)', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'r-1', zone_name: null, multifamily_classification: 'none' },
        ]) }] } }] },
      })
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R_1', zone_name: 'Residential', multifamily_classification: 'primary' },
        ]) }] } }] },
      })

    const result = await discoverZones(['chunk1', 'chunk2'], undefined, mockLogger)

    expect(result).toHaveLength(1)
    expect(result[0].multifamily_classification).toBe('primary')
  })

  it('recovers from a failed chunk and continues', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-2', zone_name: null, multifamily_classification: 'permitted' },
        ]) }] } }] },
      })

    const result = await discoverZones(['bad-chunk', 'good-chunk'], undefined, mockLogger)

    expect(result).toHaveLength(1)
    expect(result[0].zone_code).toBe('R-2')
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('handles empty response array', async () => {
    mockResponse([])

    const result = await discoverZones(['chunk'], undefined, mockLogger)

    expect(result).toHaveLength(0)
  })

  it('sanitizes control characters in response', async () => {
    mockResponseText('[{"zone_code":"R-1\x00","zone_name":null,"multifamily_classification":"primary"}]')

    const result = await discoverZones(['chunk'], undefined, mockLogger)

    expect(result).toHaveLength(1)
    expect(result[0].zone_code).toBe('R-1')
  })

  it('throws when GOOGLE_CLOUD_PROJECT is not set', async () => {
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GCLOUD_PROJECT

    await expect(discoverZones(['chunk'], undefined, mockLogger))
      .rejects.toThrow('GOOGLE_CLOUD_PROJECT environment variable is required')
  })

  it('uses limiter when provided', async () => {
    mockResponse([])
    const mockLimiter = jest.fn((fn: () => Promise<string>) => fn()) as unknown as ReturnType<typeof jest.fn>

    await discoverZones(['chunk1', 'chunk2'], mockLimiter, mockLogger)

    expect(mockLimiter).toHaveBeenCalledTimes(2)
  })

  it('skips entries missing zone_code or classification', async () => {
    mockResponse([
      { zone_code: '', zone_name: null, multifamily_classification: 'primary' },
      { zone_code: 'R-1', zone_name: null, multifamily_classification: '' },
      { zone_code: 'R-2', zone_name: null, multifamily_classification: 'permitted' },
    ])

    const result = await discoverZones(['chunk'], undefined, mockLogger)

    expect(result).toHaveLength(1)
    expect(result[0].zone_code).toBe('R-2')
  })
})

describe('matchZoneCode', () => {
  const zones = [
    { zone_code: 'R-1', zone_name: 'Low Density', multifamily_classification: 'none' as const },
    { zone_code: 'RM-2', zone_name: 'Multifamily', multifamily_classification: 'primary' as const },
  ]

  it('returns exact match', () => {
    expect(matchZoneCode('R-1', zones)).toBe('R-1')
  })

  it('returns canonical code for normalized match', () => {
    expect(matchZoneCode('r_1', zones)).toBe('R-1')
    expect(matchZoneCode('rm-2', zones)).toBe('RM-2')
  })

  it('returns raw code when no match', () => {
    expect(matchZoneCode('C-2', zones)).toBe('C-2')
  })
})
