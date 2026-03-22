/**
 * E1-1a: GCS PDF fetcher
 *
 * Implements PdfFetcher using Google Cloud Storage.  The bucket name is read
 * from the RAW_DATA_BUCKET environment variable.  Zoning PDFs are stored at:
 *
 *   gs://{RAW_DATA_BUCKET}/zoning/{jurisdictionId}/
 *
 * The fetcher lists objects at that prefix and downloads the first file it
 * finds.  If multiple files exist, the lexicographically last one is used
 * (so rename-dated files like `arlington_aczo_2026_downloaded_20260316.pdf`
 * sort correctly).
 *
 * Throws if the bucket is not set, the prefix has no files, or the download
 * fails.  The pipeline runner (E0-1) catches and logs these errors.
 */

import { Storage } from '@google-cloud/storage'
import { PdfFetcher } from './runner'

export class GcsFetcher implements PdfFetcher {
  private storage: Storage
  private bucket: string

  constructor(bucket?: string) {
    const b = bucket ?? process.env.RAW_DATA_BUCKET
    if (!b) {
      throw new Error(
        'GcsFetcher: RAW_DATA_BUCKET environment variable is not set. ' +
        'Set it to the GCS bucket name (e.g. parcela-490518-raw-data) or ' +
        'use LocalFetcher for local development.',
      )
    }
    this.bucket = b
    this.storage = new Storage()
  }

  async fetch(_jurisdictionId: string, slug: string): Promise<{ bytes: Buffer; sourceDocument: string }> {
    const prefix = `zoning/${slug}/`
    const [allFiles] = await this.storage.bucket(this.bucket).getFiles({ prefix })

    // Filter to PDF files only — the prefix may match non-PDF objects like
    // extraction artifacts stored under zoning/{slug}/extractions/
    const files = allFiles.filter((f) => f.name.toLowerCase().endsWith('.pdf'))

    if (files.length === 0) {
      throw new Error(
        `GcsFetcher: no PDF files found at gs://${this.bucket}/${prefix}. ` +
        'Upload the zoning ordinance PDF per infra/README.md.',
      )
    }

    // Use lexicographically last file so date-suffixed names sort correctly
    const file = files.sort((a, b) => a.name.localeCompare(b.name)).at(-1)!
    const sourceDocument = `gs://${this.bucket}/${file.name}`

    const [contents] = await file.download()
    const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents)

    return { bytes, sourceDocument }
  }
}
