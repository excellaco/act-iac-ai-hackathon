/**
 * E1-1: PDF parser
 *
 * Implements PdfParser using the `pdf-parse` library.  Converts raw PDF bytes
 * into plain text for the chunking stage (E0-2) and a per-page index for the
 * page-resolve stage (E0-130).
 *
 * pdf-parse extracts text layer content from each page in document order.
 * The output includes both a concatenated string and an array of per-page text.
 * No OCR is performed — PDFs must have a text layer (all three demo zoning ordinances do).
 *
 * Throws on malformed PDFs.  The pipeline runner (E0-1) catches and logs.
 */

import pdfParse from 'pdf-parse'
import type { PdfParser } from './runner'
import type { ParsedPage } from './artifact'

export class PdfParserImpl implements PdfParser {
  async parse(bytes: Buffer): Promise<{ text: string; pages: ParsedPage[] }> {
    const pageTexts: string[] = []

    const data = await pdfParse(bytes, {
      pagerender: (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string; hasEOL: boolean }> }> }) =>
        pageData.getTextContent().then((content) => {
          const pageText = content.items
            .map((item) => item.str + (item.hasEOL ? '\n' : ''))
            .join('')
          pageTexts.push(pageText)
          return pageText
        }),
    })

    const pages: ParsedPage[] = pageTexts.map((text, i) => ({ page: i + 1, text }))

    return { text: data.text, pages }
  }
}
