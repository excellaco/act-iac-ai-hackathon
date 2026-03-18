const mockGenerateContent = jest.fn()

jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}))

import {
  SetbackFrontExtractor,
  SetbackSideExtractor,
  SetbackRearExtractor,
  SetbacksGeminiCall,
  buildSetbackExtractors,
} from '../../lib/extractors/setbacks.extractor'

const CHUNK = 'Front yard: 25 ft. Side yard: 10 ft. Rear yard: 20 ft.'

const mockSetbacks = [
  { field_name: 'setback_front_ft', raw_value: 25, raw_unit: 'ft', field_value: null, field_value_text: 'Front yard: 25 ft', unit: 'ft', confidence: 'high', source_section: '', district_context: '', reasoning: '' },
  { field_name: 'setback_side_ft', raw_value: 10, raw_unit: 'ft', field_value: null, field_value_text: 'Side yard: 10 ft', unit: 'ft', confidence: 'high', source_section: '', district_context: '', reasoning: '' },
  { field_name: 'setback_rear_ft', raw_value: 20, raw_unit: 'ft', field_value: null, field_value_text: 'Rear yard: 20 ft', unit: 'ft', confidence: 'high', source_section: '', district_context: '', reasoning: '' },
]

beforeEach(() => {
  process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
  mockGenerateContent.mockReset()
  mockGenerateContent.mockResolvedValue({
    response: { candidates: [{ content: { parts: [{ text: JSON.stringify(mockSetbacks) }] } }] },
  })
})

describe('SetbacksGeminiCall', () => {
  it('calls Gemini once and caches the result for repeated chunks', async () => {
    const shared = new SetbacksGeminiCall()
    await shared.call(CHUNK)
    await shared.call(CHUNK)
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })

  it('calls Gemini separately for different chunks', async () => {
    const shared = new SetbacksGeminiCall()
    await shared.call('chunk one')
    await shared.call('chunk two')
    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
  })
})

describe('SetbackFrontExtractor', () => {
  it('returns the front setback result', async () => {
    const shared = new SetbacksGeminiCall()
    const extractor = new SetbackFrontExtractor(shared)
    const result = await extractor.extract(CHUNK)
    expect(result?.field_name).toBe('setback_front_ft')
    expect(result?.raw_value).toBe(25)
  })
})

describe('SetbackSideExtractor', () => {
  it('returns the side setback result', async () => {
    const shared = new SetbacksGeminiCall()
    const extractor = new SetbackSideExtractor(shared)
    const result = await extractor.extract(CHUNK)
    expect(result?.field_name).toBe('setback_side_ft')
    expect(result?.raw_value).toBe(10)
  })
})

describe('SetbackRearExtractor', () => {
  it('returns the rear setback result', async () => {
    const shared = new SetbacksGeminiCall()
    const extractor = new SetbackRearExtractor(shared)
    const result = await extractor.extract(CHUNK)
    expect(result?.field_name).toBe('setback_rear_ft')
    expect(result?.raw_value).toBe(20)
  })
})

describe('buildSetbackExtractors', () => {
  it('returns 3 extractors sharing one Gemini call per chunk', async () => {
    const extractors = buildSetbackExtractors()
    expect(extractors).toHaveLength(3)
    // All three extract from same chunk — should only call Gemini once
    for (const extractor of extractors) {
      await extractor.extract(CHUNK)
    }
    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
  })
})
