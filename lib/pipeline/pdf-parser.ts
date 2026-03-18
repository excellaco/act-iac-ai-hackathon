/**
 * E1-1: PDF parser
 *
 * Implements PdfParser using the `pdf-parse` library.  Converts raw PDF bytes
 * into plain text for the chunking stage (E0-2).
 *
 * pdf-parse extracts text layer content from each page in document order.
 * The output is a single string with newlines between pages.  No OCR is
 * performed — PDFs must have a text layer (all three demo zoning ordinances do).
 *
 * Throws on malformed PDFs.  The pipeline runner (E0-1) catches and logs.
 */

import pdfParse from 'pdf-parse'
import { PdfParser } from './runner'

export class PdfParserImpl implements PdfParser {
  async parse(bytes: Buffer): Promise<string> {
    const data = await pdfParse(bytes)
    return data.text
  }
}
