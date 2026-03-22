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

/**
 * Normalize text extracted from a PDF page to fix common quality issues:
 *
 * 1. OCR spaced-character artifacts — scanned PDFs often produce text where
 *    each character is separated by a space, e.g. "R E S I D E N T I A L" or
 *    "§ 5 . 1 . 2".  We collapse these back to normal words/tokens.
 *
 * 2. Garbage character runs — non-printable or high-codepoint sequences that
 *    survive pdf-parse (e.g. font encoding artifacts in Fairfax PDFs) are
 *    stripped so they don't appear as verbatim quotes in extraction output.
 */
export function normalizePdfText(text: string): string {
  // Collapse OCR spaced-character sequences: sequences of single characters
  // (letters, digits, punctuation) each separated by exactly one space, with
  // at least 4 such tokens in a row.  We join them without spaces.
  // Matches patterns like "R E S I D E N T I A L", "§ 5 . 1 . 2", "A R T I C L E"
  let normalized = text.replace(
    /(?<!\S)([\S] ){4,}[\S](?!\S)/g,
    (match) => match.replace(/ /g, ''),
  )

  // Strip runs of non-ASCII garbage characters (font encoding artifacts).
  // Keeps normal printable ASCII and common Unicode (accented chars, §, etc.)
  // Removes sequences of 3+ consecutive characters outside the printable range.
  normalized = normalized.replace(/[^\x20-\x7E\xA0-\u024F\u2000-\u206F]{3,}/g, ' ')

  // Collapse multiple spaces/blank lines left by the replacements above
  normalized = normalized.replace(/[ \t]{3,}/g, '  ')
  normalized = normalized.replace(/\n{4,}/g, '\n\n\n')

  return normalized
}

export class PdfParserImpl implements PdfParser {
  async parse(bytes: Buffer): Promise<{ text: string; pages: ParsedPage[] }> {
    const pageTexts: string[] = []

    const data = await pdfParse(bytes, {
      pagerender: (pageData: { getTextContent: () => Promise<{ items: Array<{ str: string; hasEOL: boolean }> }> }) =>
        pageData.getTextContent().then((content) => {
          const pageText = content.items
            .map((item) => item.str + (item.hasEOL ? '\n' : ''))
            .join('')
          const normalized = normalizePdfText(pageText)
          pageTexts.push(normalized)
          return normalized
        }),
    })

    const normalizedFullText = normalizePdfText(data.text)
    const pages: ParsedPage[] = pageTexts.map((text, i) => ({ page: i + 1, text }))

    return { text: normalizedFullText, pages }
  }
}
