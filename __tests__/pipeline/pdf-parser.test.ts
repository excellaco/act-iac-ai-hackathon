import { PdfParserImpl, normalizePdfText } from '../../lib/pipeline/pdf-parser'

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

describe('normalizePdfText', () => {
  it('collapses OCR spaced-character words', () => {
    expect(normalizePdfText('R E S I D E N T I A L')).toBe('RESIDENTIAL')
    expect(normalizePdfText('A R T I C L E')).toBe('ARTICLE')
  })

  it('collapses OCR spaced section references', () => {
    expect(normalizePdfText('§ 5 . 1 . 2')).toBe('§5.1.2')
  })

  it('does not collapse normal prose with spaces', () => {
    const text = 'Maximum height is 45 feet.'
    expect(normalizePdfText(text)).toBe(text)
  })

  it('does not collapse two-word phrases (requires 4+ tokens)', () => {
    const text = 'A B C'
    // Only 3 tokens — should not be collapsed
    expect(normalizePdfText(text)).toBe(text)
  })

  it('strips garbage character runs from PDF encoding artifacts', () => {
    const result = normalizePdfText('setback is \uF058\uF04B\uF028 feet')
    expect(result).not.toContain('\uF058')
    expect(result).toContain('setback is')
    expect(result).toContain('feet')
  })

  it('preserves normal Unicode like § and accented characters', () => {
    const text = '§ 5.1 Résidentiel districts'
    expect(normalizePdfText(text)).toContain('§')
    expect(normalizePdfText(text)).toContain('Résidentiel')
  })

  it('handles mixed OCR and normal text', () => {
    const text = 'Section R E S I D E N T I A L Districts: maximum density is 20 units per acre'
    const result = normalizePdfText(text)
    expect(result).toContain('RESIDENTIAL')
    expect(result).toContain('maximum density is 20 units per acre')
  })
})
