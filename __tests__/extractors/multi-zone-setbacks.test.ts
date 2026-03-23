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

import {
  MultiZoneSetbacksCall,
  MultiZoneSetbackFrontExtractor,
  MultiZoneSetbackSideExtractor,
  MultiZoneSetbackRearExtractor,
  buildMultiZoneSetbackExtractors,
} from '../../lib/extractors/multi-zone-setbacks.extractor'
import type { DiscoveredZone } from '../../lib/extractors/zone-discovery.extractor'

function mockResponse(json: unknown) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    },
  })
}

const ZONES: DiscoveredZone[] = [
  { zone_code: 'R-1', zone_name: 'Low Density', multifamily_classification: 'none' },
]

const SETBACK_RESULTS = [
  { zone_code: 'R-1', field_name: 'setback_front_ft', raw_value: 25, confidence: 'high', raw_unit: 'ft', field_value: null, field_value_text: '25 feet', unit: 'ft', source_section: '§5.1', district_context: 'R-1', reasoning: 'found' },
  { zone_code: 'R-1', field_name: 'setback_side_ft', raw_value: 10, confidence: 'high', raw_unit: 'ft', field_value: null, field_value_text: '10 feet', unit: 'ft', source_section: '§5.2', district_context: 'R-1', reasoning: 'found' },
  { zone_code: 'R-1', field_name: 'setback_rear_ft', raw_value: 20, confidence: 'medium', raw_unit: 'ft', field_value: null, field_value_text: '20 feet', unit: 'ft', source_section: '§5.3', district_context: 'R-1', reasoning: 'found' },
]

const originalEnv = process.env

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...originalEnv, GOOGLE_CLOUD_PROJECT: 'test-project' }
})

afterAll(() => {
  process.env = originalEnv
})

describe('MultiZoneSetbacksCall', () => {
  it('calls Gemini and returns parsed results', async () => {
    mockResponse(SETBACK_RESULTS)
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    const result = await call.call('chunk text')

    expect(result).toHaveLength(3)
    expect(result[0].field_name).toBe('setback_front_ft')
    expect(result[0].raw_value).toBe(25)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('caches results per chunk', async () => {
    mockResponse(SETBACK_RESULTS)
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    await call.call('same chunk')
    await call.call('same chunk')

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('calls Gemini separately for different chunks', async () => {
    mockResponse(SETBACK_RESULTS)
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    await call.call('chunk A')
    await call.call('chunk B')

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('clears cache when canonical zones change', async () => {
    mockResponse(SETBACK_RESULTS)
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    await call.call('chunk')
    call.setCanonicalZones(ZONES) // re-set clears cache
    await call.call('chunk')

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })

  it('returns empty array when no canonical zones set', async () => {
    const call = new MultiZoneSetbacksCall()

    const result = await call.call('chunk')

    expect(result).toEqual([])
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('normalizes zone codes against canonical list', async () => {
    mockResponse([
      { zone_code: 'r_1', field_name: 'setback_front_ft', raw_value: 25, confidence: 'high' },
    ])
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    const result = await call.call('chunk')

    expect(result[0].zone_code).toBe('R-1')
    expect(result[0].zone_name).toBe('Low Density')
  })

  it('handles malformed JSON gracefully', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] },
    })
    const call = new MultiZoneSetbacksCall()
    call.setCanonicalZones(ZONES)

    const result = await call.call('chunk')

    expect(result).toEqual([])
  })

  it('throws when GOOGLE_CLOUD_PROJECT is not set', () => {
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GCLOUD_PROJECT

    expect(() => new MultiZoneSetbacksCall())
      .toThrow('GOOGLE_CLOUD_PROJECT is required')
  })
})

describe('MultiZoneSetback wrapper extractors', () => {
  it('extractAllZones filters by field name for front', async () => {
    mockResponse(SETBACK_RESULTS)
    const shared = new MultiZoneSetbacksCall()
    shared.setCanonicalZones(ZONES)
    const extractor = new MultiZoneSetbackFrontExtractor(shared, {} as never)

    const result = await extractor.extractAllZones(['chunk'])

    expect(result).toHaveLength(1)
    expect(result[0].field_name).toBe('setback_front_ft')
    expect(result[0].raw_value).toBe(25)
  })

  it('extractAllZones filters by field name for side', async () => {
    mockResponse(SETBACK_RESULTS)
    const shared = new MultiZoneSetbacksCall()
    shared.setCanonicalZones(ZONES)
    const extractor = new MultiZoneSetbackSideExtractor(shared, {} as never)

    const result = await extractor.extractAllZones(['chunk'])

    expect(result).toHaveLength(1)
    expect(result[0].field_name).toBe('setback_side_ft')
    expect(result[0].raw_value).toBe(10)
  })

  it('extractAllZones filters by field name for rear', async () => {
    mockResponse(SETBACK_RESULTS)
    const shared = new MultiZoneSetbacksCall()
    shared.setCanonicalZones(ZONES)
    const extractor = new MultiZoneSetbackRearExtractor(shared, {} as never)

    const result = await extractor.extractAllZones(['chunk'])

    expect(result).toHaveLength(1)
    expect(result[0].field_name).toBe('setback_rear_ft')
    expect(result[0].raw_value).toBe(20)
  })

  it('deduplicates across chunks — higher confidence wins', async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', field_name: 'setback_front_ft', raw_value: 25, confidence: 'medium' },
        ]) }] } }] },
      })
      .mockResolvedValueOnce({
        response: { candidates: [{ content: { parts: [{ text: JSON.stringify([
          { zone_code: 'R-1', field_name: 'setback_front_ft', raw_value: 30, confidence: 'high' },
        ]) }] } }] },
      })

    const shared = new MultiZoneSetbacksCall()
    shared.setCanonicalZones(ZONES)
    const extractor = new MultiZoneSetbackFrontExtractor(shared, {} as never)

    const result = await extractor.extractAllZones(['chunk1', 'chunk2'])

    expect(result).toHaveLength(1)
    expect(result[0].raw_value).toBe(30)
    expect(result[0].confidence).toBe('high')
  })
})

describe('buildMultiZoneSetbackExtractors', () => {
  it('returns 3 extractors with correct field names', () => {
    const extractors = buildMultiZoneSetbackExtractors()

    expect(extractors).toHaveLength(3)
    expect(extractors[0].fieldName).toBe('setback_front_ft')
    expect(extractors[1].fieldName).toBe('setback_side_ft')
    expect(extractors[2].fieldName).toBe('setback_rear_ft')
  })
})
