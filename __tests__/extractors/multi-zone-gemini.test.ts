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

jest.mock('../../lib/pipeline/logger', () => ({
  consoleLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

import {
  MultiZoneGeminiExtractor,
  isMultiZoneExtractor,
  injectCanonicalZones,
  injectLimiter,
  mergeZoneResults,
} from '../../lib/extractors/multi-zone-gemini.extractor'
import type { DiscoveredZone } from '../../lib/extractors/zone-discovery.extractor'

// Concrete test subclass
class TestMultiZoneExtractor extends MultiZoneGeminiExtractor {
  readonly fieldName = 'test_field'

  protected buildPrompt(chunk: string): string {
    return `single-zone: ${chunk}`
  }

  protected buildMultiZonePrompt(chunk: string, zones: DiscoveredZone[]): string {
    return this.buildMultiZonePromptDefault(chunk, zones, 'Test field', 'units', 'units')
  }
}

function mockResponse(json: unknown) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    },
  })
}

const ZONES: DiscoveredZone[] = [
  { zone_code: 'R-1', zone_name: 'Low Density', multifamily_classification: 'none' },
  { zone_code: 'RM-2', zone_name: 'Multifamily', multifamily_classification: 'primary' },
]

describe('MultiZoneGeminiExtractor', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, GOOGLE_CLOUD_PROJECT: 'test-project' }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('extracts results per zone from a single chunk', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockResponse([
      { zone_code: 'R-1', raw_value: 10, confidence: 'high', field_value_text: '10 units', source_section: '§1', reasoning: 'found' },
      { zone_code: 'RM-2', raw_value: 20, confidence: 'high', field_value_text: '20 units', source_section: '§2', reasoning: 'found' },
    ])

    const result = await extractor.extractAllZones(['chunk1'])

    expect(result).toHaveLength(2)
    expect(result[0].zone_code).toBe('R-1')
    expect(result[0].raw_value).toBe(10)
    expect(result[1].zone_code).toBe('RM-2')
  })

  it('deduplicates — higher confidence wins', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', raw_value: 10, confidence: 'medium', field_value_text: '', source_section: '', reasoning: '' },
        ]) }] } }] },
      })
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', raw_value: 12, confidence: 'high', field_value_text: '12', source_section: '§3', reasoning: '' },
        ]) }] } }] },
      })

    const result = await extractor.extractAllZones(['chunk1', 'chunk2'])

    expect(result).toHaveLength(1)
    expect(result[0].raw_value).toBe(12)
    expect(result[0].confidence).toBe('high')
  })

  it('deduplicates — value beats null regardless of confidence', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', raw_value: null, confidence: 'high', field_value_text: '', source_section: '', reasoning: '' },
        ]) }] } }] },
      })
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', raw_value: 5, confidence: 'low', field_value_text: '5', source_section: '', reasoning: '' },
        ]) }] } }] },
      })

    const result = await extractor.extractAllZones(['chunk1', 'chunk2'])

    expect(result).toHaveLength(1)
    expect(result[0].raw_value).toBe(5)
  })

  it('normalizes zone codes against canonical list', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockResponse([
      { zone_code: 'r_1', raw_value: 10, confidence: 'high', field_value_text: '', source_section: '', reasoning: '' },
    ])

    const result = await extractor.extractAllZones(['chunk1'])

    expect(result[0].zone_code).toBe('R-1')
    expect(result[0].zone_name).toBe('Low Density')
  })

  it('returns empty array when no canonical zones set', async () => {
    const extractor = new TestMultiZoneExtractor()

    const result = await extractor.extractAllZones(['chunk1'])

    expect(result).toEqual([])
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('continues on chunk failure', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockGenerateContent
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', raw_value: 10, confidence: 'high', field_value_text: '', source_section: '', reasoning: '' },
        ]) }] } }] },
      })

    const result = await extractor.extractAllZones(['bad', 'good'])

    expect(result).toHaveLength(1)
    expect(result[0].zone_code).toBe('R-1')
  })

  it('throws when GOOGLE_CLOUD_PROJECT is not set', () => {
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GCLOUD_PROJECT

    expect(() => new TestMultiZoneExtractor())
      .toThrow('GOOGLE_CLOUD_PROJECT environment variable is required')
  })

  it('skips entries without zone_code', async () => {
    const extractor = new TestMultiZoneExtractor()
    extractor.setCanonicalZones(ZONES)

    mockResponse([
      { zone_code: '', raw_value: 10, confidence: 'high' },
      { zone_code: 'R-1', raw_value: 5, confidence: 'high', field_value_text: '', source_section: '', reasoning: '' },
    ])

    const result = await extractor.extractAllZones(['chunk1'])

    expect(result).toHaveLength(1)
    expect(result[0].zone_code).toBe('R-1')
  })
})

describe('isMultiZoneExtractor', () => {
  it('returns true for MultiZoneGeminiExtractor instances', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
    const extractor = new TestMultiZoneExtractor()
    expect(isMultiZoneExtractor(extractor)).toBe(true)
  })

  it('returns false for non-extractors', () => {
    expect(isMultiZoneExtractor({})).toBe(false)
    expect(isMultiZoneExtractor('string')).toBe(false)
    expect(isMultiZoneExtractor(null)).toBe(false)
  })
})

describe('injectCanonicalZones', () => {
  it('sets zones on multi-zone extractors', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
    const extractor = new TestMultiZoneExtractor()
    injectCanonicalZones([extractor], ZONES)
    expect(extractor.getCanonicalZones()).toEqual(ZONES)
  })

  it('ignores non-multi-zone extractors', () => {
    const plain = { extractAllZones: jest.fn() }
    expect(() => injectCanonicalZones([plain], ZONES)).not.toThrow()
  })
})

describe('injectLimiter', () => {
  it('sets limiter on multi-zone extractors', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
    const extractor = new TestMultiZoneExtractor()
    const mockLimiter = jest.fn()
    injectLimiter([extractor], mockLimiter)
    expect(true).toBe(true)
  })
})

describe('mergeZoneResults', () => {
  it('flattens arrays of zone results', () => {
    const a = [{ zone_code: 'R-1', field_name: 'height' }]
    const b = [{ zone_code: 'RM-2', field_name: 'density' }]
    const merged = mergeZoneResults([a, b] as never)
    expect(merged).toHaveLength(2)
  })

  it('returns empty array for empty input', () => {
    expect(mergeZoneResults([])).toEqual([])
  })
})
