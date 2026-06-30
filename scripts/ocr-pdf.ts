/**
 * OCR a zoning ordinance PDF using Google Cloud Vision API.
 *
 * Reads a PDF from GCS, runs async OCR, and writes a JSON file with
 * the text content of each page to data/ocr/<jurisdiction>_ocr.json.
 *
 * Usage:
 *   npm run ocr:pdf <jurisdiction_slug>
 *
 * Example:
 *   npm run ocr:pdf fairfax_va
 */

import * as fs from 'fs'
import * as path from 'path'
import { ImageAnnotatorClient } from '@google-cloud/vision'
import { Storage } from '@google-cloud/storage'

const jurisdictionSlug = process.argv[2]
if (!jurisdictionSlug) {
  console.error('Usage: npm run ocr:pdf <jurisdiction_slug>')
  process.exit(1)
}

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
const RAW_DATA_BUCKET = process.env.RAW_DATA_BUCKET ?? 'parcella-501012-raw-data'

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT environment variable is required')
  process.exit(1)
}

async function findSourcePdf(slug: string): Promise<string> {
  const storage = new Storage()
  const prefix = `zoning/${slug}/`
  const [files] = await storage.bucket(RAW_DATA_BUCKET).getFiles({ prefix })
  const pdf = files.find((f) => f.name.endsWith('.pdf'))
  if (!pdf) throw new Error(`No PDF found in gs://${RAW_DATA_BUCKET}/${prefix}`)
  return `gs://${RAW_DATA_BUCKET}/${pdf.name}`
}

async function main() {
  const client = new ImageAnnotatorClient()
  const storage = new Storage()

  console.log(`\nParcela — ocr:pdf`)
  console.log(`Jurisdiction: ${jurisdictionSlug}`)

  const inputUri = await findSourcePdf(jurisdictionSlug)
  console.log(`Source PDF:   ${inputUri}`)

  const outputPrefix = `zoning/${jurisdictionSlug}/ocr/`
  const outputUri = `gs://${RAW_DATA_BUCKET}/${outputPrefix}`
  console.log(`OCR output:   ${outputUri}`)
  console.log(`\nStarting OCR (this may take several minutes)...`)

  const [operation] = await client.asyncBatchAnnotateFiles({
    requests: [
      {
        inputConfig: {
          gcsSource: { uri: inputUri },
          mimeType: 'application/pdf',
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        outputConfig: {
          gcsDestination: { uri: outputUri },
          batchSize: 20,
        },
      },
    ],
  })

  console.log(`Operation started: ${operation.name}`)
  console.log(`Waiting for completion...`)

  const [result] = await operation.promise()
  console.log(`OCR complete.`)

  // Download output JSON files from GCS and assemble pages
  const [files] = await storage.bucket(RAW_DATA_BUCKET).getFiles({ prefix: outputPrefix })
  const jsonFiles = files.filter((f) => f.name.endsWith('.json')).sort((a, b) => a.name.localeCompare(b.name))

  console.log(`Downloading ${jsonFiles.length} output file(s)...`)

  const pages: { page: number; text: string }[] = []

  for (const file of jsonFiles) {
    const [contents] = await file.download()
    const data = JSON.parse(contents.toString())
    for (const response of data.responses ?? []) {
      const pageNum = response.context?.pageNumber ?? 0
      const text = response.fullTextAnnotation?.text ?? ''
      pages.push({ page: pageNum, text })
    }
  }

  pages.sort((a, b) => a.page - b.page)

  // Write output
  const outDir = path.join('data', 'ocr')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, `${jurisdictionSlug}_ocr.json`)
  fs.writeFileSync(outFile, JSON.stringify({ jurisdiction: jurisdictionSlug, pages }, null, 2))

  console.log(`\nWrote ${pages.length} pages to ${outFile}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
