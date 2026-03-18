/**
 * E1-1a: Local PDF fetcher (dev fallback)
 *
 * Implements PdfFetcher by reading from the local filesystem.  Used when
 * RAW_DATA_BUCKET is not set (local development without GCS access).
 *
 * Looks for PDF files under:
 *   {baseDir}/zoning/{jurisdictionId}/
 *
 * The default baseDir is `data/raw` relative to the project root.  The
 * fetcher picks the lexicographically last PDF it finds in that folder,
 * matching the same selection behaviour as GcsFetcher so results are
 * consistent between environments.
 *
 * Throws if the directory does not exist or contains no PDF files.
 */

import * as fs from 'fs'
import * as path from 'path'
import { PdfFetcher } from './runner'

export class LocalFetcher implements PdfFetcher {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? path.resolve(process.cwd(), 'data/raw')
  }

  async fetch(jurisdictionId: string): Promise<{ bytes: Buffer; sourceDocument: string }> {
    const dir = path.join(this.baseDir, 'zoning', jurisdictionId)

    if (!fs.existsSync(dir)) {
      throw new Error(
        `LocalFetcher: directory not found: ${dir}. ` +
        'Download the zoning PDF and place it in data/raw/zoning/{jurisdictionId}/ ' +
        'or set RAW_DATA_BUCKET to use GCS.',
      )
    }

    const pdfs = fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith('.pdf'))
      .sort()

    if (pdfs.length === 0) {
      throw new Error(
        `LocalFetcher: no PDF files found in ${dir}. ` +
        'Download the zoning PDF per data/raw/README.md.',
      )
    }

    // Lexicographically last, matching GcsFetcher selection behaviour
    const filename = pdfs.at(-1)!
    const filepath = path.join(dir, filename)
    const sourceDocument = `local://${filepath}`

    const bytes = fs.readFileSync(filepath)
    return { bytes, sourceDocument }
  }
}
