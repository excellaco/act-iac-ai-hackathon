/**
 * Per-jurisdiction pipeline configuration.
 *
 * Optional config file at data/config/<slug>.json controls how the parse stage
 * fetches and processes the source document for a jurisdiction.
 *
 * All fields are optional. When absent the pipeline applies defaults:
 *   pdf_source      — discovered by convention (last PDF in zoning/<slug>/ prefix)
 *   pdf_extraction  — "text" (pdf-parse text layer extraction)
 */

import fs from 'fs'
import path from 'path'

export interface JurisdictionConfig {
  /**
   * Explicit GCS URI for the source PDF (e.g. "gs://bucket/zoning/slug/file.pdf").
   * When set, the parse stage downloads this object directly instead of using
   * convention-based discovery.
   */
  pdf_source?: string

  /**
   * Extraction method to use during the parse stage.
   *   "text" — pdf-parse text layer extraction (default, works for searchable PDFs)
   *   "ocr"  — Google Cloud Vision OCR output (required for scanned PDFs)
   */
  pdf_extraction?: 'text' | 'ocr'

  /**
   * Explicit GCS prefix for the Google Cloud Vision API OCR output
   * (e.g. "gs://bucket/zoning/slug/ocr/").
   * When set, the parse stage reads OCR JSON files from this prefix instead of the
   * convention-based path "zoning/<slug>/ocr/".
   *
   * Recommended for OCR jurisdictions: pins the parse stage to a specific OCR run
   * so that a future re-run of ocr:pdf does not silently produce duplicate or mixed pages.
   */
  ocr_source?: string
}

/**
 * Load the jurisdiction config for a given slug.
 * Returns an empty object if no config file exists.
 */
export function loadJurisdictionConfig(slug: string): JurisdictionConfig {
  const filePath = path.join('data', 'config', `${slug}.json`)
  try {
    const contents = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(contents) as JurisdictionConfig
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
}
