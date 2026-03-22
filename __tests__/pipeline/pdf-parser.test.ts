import { PdfParserImpl } from '../../lib/pipeline/pdf-parser'

// Mock pdf-parse so tests don't need real PDF files
jest.mock('pdf-parse', () =>
  jest.fn().mockResolvedValue({ text: 'extracted text content from PDF' })
)

import pdfParse from 'pdf-parse'

describe('PdfParserImpl', () => {
  it('returns extracted text and pages from pdf-parse', async () => {
    const parser = new PdfParserImpl()
    const bytes = Buffer.from('%PDF-1.4 fake')
    const result = await parser.parse(bytes)
    expect(result.text).toBe('extracted text content from PDF')
    expect(Array.isArray(result.pages)).toBe(true)
  })

  it('propagates errors from pdf-parse', async () => {
    (pdfParse as jest.Mock).mockRejectedValueOnce(new Error('malformed PDF'))
    const parser = new PdfParserImpl()
    await expect(parser.parse(Buffer.from('not a pdf'))).rejects.toThrow('malformed PDF')
  })
})
