// Mock @google-cloud/storage before importing OcrReader
const mockDownload = jest.fn()
const mockGetFiles = jest.fn()

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn().mockReturnValue({
      getFiles: mockGetFiles,
    }),
  })),
}))

// Mock fs/promises for local mode tests
jest.mock('fs/promises')
import fs from 'fs/promises'
const mockReadFile = fs.readFile as jest.Mock

import { OcrReader } from '../../lib/pipeline/ocr-reader'

const makeGcsFile = (name: string, content: object) => ({
  name,
  download: jest.fn().mockResolvedValue([Buffer.from(JSON.stringify(content))]),
})

const makeOcrResponse = (pageNumber: number, text: string) => ({
  context: { pageNumber },
  fullTextAnnotation: { text },
})

describe('OcrReader — local mode', () => {
  beforeEach(() => {
    delete process.env.RAW_DATA_BUCKET
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('reads from data/ocr/<slug>_ocr.json', async () => {
    const ocrData = {
      jurisdiction: 'fairfax_va',
      pages: [
        { page: 1, text: 'Page one text' },
        { page: 2, text: 'Page two text' },
      ],
    }
    mockReadFile.mockResolvedValue(JSON.stringify(ocrData))

    const reader = new OcrReader()
    const pages = await reader.readPages('fairfax_va')

    expect(pages).toEqual(ocrData.pages)
    expect(mockReadFile).toHaveBeenCalledWith(
      expect.stringContaining('fairfax_va_ocr.json'),
      'utf-8',
    )
  })

  it('correctly unwraps the { jurisdiction, pages } wrapper format', async () => {
    const ocrData = {
      jurisdiction: 'loudoun_va',
      pages: [{ page: 1, text: 'Section 1' }],
    }
    mockReadFile.mockResolvedValue(JSON.stringify(ocrData))

    const reader = new OcrReader()
    const pages = await reader.readPages('loudoun_va')

    expect(pages).toHaveLength(1)
    expect(pages[0].page).toBe(1)
    expect(pages[0].text).toBe('Section 1')
  })

  it('throws a descriptive error when the OCR file is not found', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValue(err)

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va')).rejects.toThrow(
      /OCR file not found/,
    )
  })

  it('includes the slug and run command in the not-found error', async () => {
    const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValue(err)

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va')).rejects.toThrow('fairfax_va')
  })

  it('re-throws non-ENOENT read errors', async () => {
    const err = Object.assign(new Error('EACCES'), { code: 'EACCES' })
    mockReadFile.mockRejectedValue(err)

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va')).rejects.toThrow('EACCES')
  })

  it('ignores the ocrSource parameter in local mode', async () => {
    const ocrData = { jurisdiction: 'fairfax_va', pages: [{ page: 1, text: 'text' }] }
    mockReadFile.mockResolvedValue(JSON.stringify(ocrData))

    const reader = new OcrReader()
    const pages = await reader.readPages('fairfax_va', 'gs://bucket/zoning/fairfax_va/ocr/')

    expect(pages).toHaveLength(1)
  })
})

describe('OcrReader — GCS mode', () => {
  beforeEach(() => {
    process.env.RAW_DATA_BUCKET = 'test-bucket'
  })

  afterEach(() => {
    delete process.env.RAW_DATA_BUCKET
    jest.clearAllMocks()
  })

  it('assembles pages from GCS JSON files in sorted order', async () => {
    const file1 = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      responses: [makeOcrResponse(1, 'Page 1'), makeOcrResponse(2, 'Page 2')],
    })
    const file2 = makeGcsFile('zoning/fairfax_va/ocr/output-21-to-40.json', {
      responses: [makeOcrResponse(21, 'Page 21')],
    })
    mockGetFiles.mockResolvedValue([[file2, file1]]) // unsorted intentionally

    const reader = new OcrReader()
    const pages = await reader.readPages('fairfax_va')

    // Files should be sorted by name; pages should be sorted by page number
    expect(pages.map((p) => p.page)).toEqual([1, 2, 21])
  })

  it('uses convention-based prefix when no ocr_source is given', async () => {
    const file = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      responses: [makeOcrResponse(1, 'text')],
    })
    mockGetFiles.mockResolvedValue([[file]])

    const reader = new OcrReader()
    await reader.readPages('fairfax_va')

    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'zoning/fairfax_va/ocr/' })
  })

  it('uses explicit ocr_source prefix when provided', async () => {
    const file = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      responses: [makeOcrResponse(1, 'text')],
    })
    mockGetFiles.mockResolvedValue([[file]])

    const reader = new OcrReader()
    await reader.readPages('fairfax_va', 'gs://other-bucket/zoning/fairfax_va/ocr/')

    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'zoning/fairfax_va/ocr/' })
  })

  it('throws a descriptive error when the GCS prefix has no JSON files', async () => {
    mockGetFiles.mockResolvedValue([[]])

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va')).rejects.toThrow(/No OCR output found/)
  })

  it('includes the source location in the zero-files error', async () => {
    mockGetFiles.mockResolvedValue([[]])

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va')).rejects.toThrow('fairfax_va')
  })

  it('handles files with missing responses array gracefully', async () => {
    const file = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      // no responses key
    })
    mockGetFiles.mockResolvedValue([[file]])

    const reader = new OcrReader()
    const pages = await reader.readPages('fairfax_va')

    expect(pages).toEqual([])
  })

  it('handles responses with missing fullTextAnnotation gracefully', async () => {
    const file = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      responses: [{ context: { pageNumber: 1 } }], // no fullTextAnnotation
    })
    mockGetFiles.mockResolvedValue([[file]])

    const reader = new OcrReader()
    const pages = await reader.readPages('fairfax_va')

    expect(pages).toHaveLength(1)
    expect(pages[0].text).toBe('')
  })

  it('throws on invalid ocr_source URI format', async () => {
    mockGetFiles.mockResolvedValue([[]])

    const reader = new OcrReader()
    await expect(reader.readPages('fairfax_va', 'not-a-gs-uri')).rejects.toThrow(
      /invalid ocr_source URI/,
    )
  })

  it('appends trailing slash to ocr_source prefix if missing', async () => {
    const file = makeGcsFile('zoning/fairfax_va/ocr/output-1-to-20.json', {
      responses: [makeOcrResponse(1, 'text')],
    })
    mockGetFiles.mockResolvedValue([[file]])

    const reader = new OcrReader()
    await reader.readPages('fairfax_va', 'gs://test-bucket/zoning/fairfax_va/ocr')

    expect(mockGetFiles).toHaveBeenCalledWith({ prefix: 'zoning/fairfax_va/ocr/' })
  })
})
