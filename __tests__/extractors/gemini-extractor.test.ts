const mockGenerateContent = jest.fn()

jest.mock('@google-cloud/vertexai', () => ({
  VertexAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}))

import { MinLotSizeExtractor } from '../../lib/extractors/min-lot-size.extractor'
import { HeightLimitExtractor } from '../../lib/extractors/height-limit.extractor'
import { DensityLimitExtractor } from '../../lib/extractors/density-limit.extractor'
import { ParkingMinExtractor } from '../../lib/extractors/parking-min.extractor'
import { DiscretionaryReviewExtractor } from '../../lib/extractors/discretionary-review.extractor'
import { buildExtractors } from '../../lib/extractors/index'

const CHUNK = 'Section 3-201: R-1 District. Minimum Lot Area: 8,000 square feet.'

function mockResponse(json: object) {
  mockGenerateContent.mockResolvedValue({
    response: {
      candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] } }],
    },
  })
}

const validResult = {
  field_name: 'min_lot_size_sqft',
  raw_value: 8000,
  raw_unit: 'square feet',
  field_value: null,
  field_value_text: 'Minimum Lot Area: 8,000 square feet',
  unit: 'sqft',
  confidence: 'high',
  source_section: 'Section 3-201',
  district_context: 'R-1 District',
  reasoning: 'Explicitly stated.',
}

beforeEach(() => {
  process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
  mockGenerateContent.mockReset()
})

describe('GeminiExtractor', () => {
  it('returns parsed extraction result', async () => {
    mockResponse(validResult)
    const extractor = new MinLotSizeExtractor()
    const result = await extractor.extract(CHUNK)
    expect(result).toMatchObject({ field_name: 'min_lot_size_sqft', raw_value: 8000 })
  })

  it('returns null when response has no candidates', async () => {
    mockGenerateContent.mockResolvedValue({ response: { candidates: [] } })
    const extractor = new MinLotSizeExtractor()
    const result = await extractor.extract(CHUNK)
    expect(result).toBeNull()
  })

  it('propagates errors from the API', async () => {
    mockGenerateContent.mockRejectedValue(new Error('quota exceeded'))
    const extractor = new MinLotSizeExtractor()
    await expect(extractor.extract(CHUNK)).rejects.toThrow('quota exceeded')
  })

  it('throws on construction without GOOGLE_CLOUD_PROJECT', () => {
    delete process.env.GOOGLE_CLOUD_PROJECT
    delete process.env.GCLOUD_PROJECT
    expect(() => new MinLotSizeExtractor()).toThrow('GOOGLE_CLOUD_PROJECT')
  })
})

describe('extractor fieldNames', () => {
  beforeEach(() => { process.env.GOOGLE_CLOUD_PROJECT = 'test-project' })

  it('MinLotSizeExtractor has correct fieldName', () => {
    expect(new MinLotSizeExtractor().fieldName).toBe('min_lot_size_sqft')
  })
  it('HeightLimitExtractor has correct fieldName', () => {
    expect(new HeightLimitExtractor().fieldName).toBe('height_limit_ft')
  })
  it('DensityLimitExtractor has correct fieldName', () => {
    expect(new DensityLimitExtractor().fieldName).toBe('density_limit_units_per_acre')
  })
  it('ParkingMinExtractor has correct fieldName', () => {
    expect(new ParkingMinExtractor().fieldName).toBe('parking_min_spaces_per_unit')
  })
  it('DiscretionaryReviewExtractor has correct fieldName', () => {
    expect(new DiscretionaryReviewExtractor().fieldName).toBe('discretionary_review_required')
  })
})

describe('buildExtractors', () => {
  beforeEach(() => { process.env.GOOGLE_CLOUD_PROJECT = 'test-project' })

  it('returns 8 extractors covering all E2 fields', () => {
    const extractors = buildExtractors()
    expect(extractors).toHaveLength(8)
    const names = extractors.map((e) => e.fieldName)
    expect(names).toContain('min_lot_size_sqft')
    expect(names).toContain('height_limit_ft')
    expect(names).toContain('density_limit_units_per_acre')
    expect(names).toContain('parking_min_spaces_per_unit')
    expect(names).toContain('setback_front_ft')
    expect(names).toContain('setback_side_ft')
    expect(names).toContain('setback_rear_ft')
    expect(names).toContain('discretionary_review_required')
  })
})
