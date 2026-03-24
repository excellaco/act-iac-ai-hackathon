/**
 * OCR reader — reads Google Cloud Vision OCR output for a jurisdiction.
 *
 * Two modes depending on environment:
 *   GCS  (RAW_DATA_BUCKET set) — downloads raw Vision API JSON files from
 *        gs://{bucket}/zoning/{slug}/ocr/ and assembles pages inline.
 *        This is what the pipeline:parse stage uses in CI/production.
 *
 *   Local (no RAW_DATA_BUCKET)  — reads the pre-assembled
 *        data/ocr/{slug}_ocr.json file written by `npm run ocr:pdf`.
 *        Used for local development.
 */

import fs from 'fs/promises'
import path from 'path'
import { Storage } from '@google-cloud/storage'
import type { ParsedPage } from './artifact'

export class OcrReader {
  async readPages(slug: string, ocrSource?: string): Promise<ParsedPage[]> {
    return process.env.RAW_DATA_BUCKET
      ? this.readFromGcs(slug, ocrSource)
      : this.readFromLocal(slug)
  }

  private async readFromLocal(slug: string): Promise<ParsedPage[]> {
    const filePath = path.join('data', 'ocr', `${slug}_ocr.json`)
    let contents: string
    try {
      contents = await fs.readFile(filePath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `OCR file not found at ${filePath}. ` +
          `Run \`npm run ocr:pdf ${slug}\` first to generate it.`,
        )
      }
      throw err
    }
    const data = JSON.parse(contents) as { jurisdiction: string; pages: ParsedPage[] }
    return data.pages
  }

  private async readFromGcs(slug: string, ocrSource?: string): Promise<ParsedPage[]> {
    const storage = new Storage()

    // Resolve bucket + prefix: explicit ocr_source takes priority over convention
    let bucket: string
    let prefix: string
    if (ocrSource) {
      const match = ocrSource.match(/^gs:\/\/([^/]+)\/(.+)$/)
      if (!match) {
        throw new Error(`OcrReader: invalid ocr_source URI: ${ocrSource}`)
      }
      bucket = match[1]
      prefix = match[2].endsWith('/') ? match[2] : `${match[2]}/`
    } else {
      bucket = process.env.RAW_DATA_BUCKET!
      prefix = `zoning/${slug}/ocr/`
    }

    const [allFiles] = await storage.bucket(bucket).getFiles({ prefix })
    const jsonFiles = allFiles
      .filter((f) => f.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (jsonFiles.length === 0) {
      const source = ocrSource ?? `gs://${bucket}/${prefix}`
      throw new Error(
        `No OCR output found at ${source}. ` +
        `Run \`npm run ocr:pdf ${slug}\` first to generate it, ` +
        `or use pdf_extraction: "text" in data/config/${slug}.json.`,
      )
    }

    const pages: ParsedPage[] = []
    for (const file of jsonFiles) {
      const [contents] = await file.download()
      const data = JSON.parse(contents.toString()) as {
        responses?: Array<{
          context?: { pageNumber?: number }
          fullTextAnnotation?: { text?: string }
        }>
      }
      for (const response of data.responses ?? []) {
        const pageNum = response.context?.pageNumber ?? 0
        const text = response.fullTextAnnotation?.text ?? ''
        pages.push({ page: pageNum, text })
      }
    }

    pages.sort((a, b) => a.page - b.page)
    return pages
  }
}
