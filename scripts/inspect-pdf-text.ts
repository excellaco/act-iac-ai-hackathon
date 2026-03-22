/**
 * Diagnostic script: parse a PDF from GCS and dump text around target keywords.
 * Usage: npx tsx scripts/inspect-pdf-text.ts <slug> [keyword]
 */

import { GcsFetcher } from '../lib/pipeline/gcs-fetcher'
import { PdfParserImpl, normalizePdfText } from '../lib/pipeline/pdf-parser'

const KEYWORDS: Record<string, string[]> = {
  density:  ['density', 'units per acre', 'du/acre', 'dwelling unit', 'FAR', 'floor area ratio'],
  height:   ['height', 'building height', 'stories', 'feet'],
  parking:  ['parking', 'spaces per unit', 'spaces per dwelling'],
  lot:      ['lot size', 'minimum lot', 'lot area', 'square feet', 'sq ft'],
  setback:  ['setback', 'yard', 'front yard', 'side yard', 'rear yard'],
}

async function main() {
  const slug = process.argv[2]
  const keywordGroup = process.argv[3] ?? 'density'

  if (!slug) {
    console.error('Usage: tsx scripts/inspect-pdf-text.ts <slug> [density|height|parking|lot|setback]')
    process.exit(1)
  }

  const fetcher = new GcsFetcher()
  const parser = new PdfParserImpl()

  console.log(`\nFetching ${slug}...`)
  const { bytes, sourceDocument } = await fetcher.fetch('', slug)
  console.log(`Source: ${sourceDocument}`)

  console.log('Parsing PDF (raw, before normalization)...')
  // Parse raw (bypass normalizePdfText to see what pdf-parse actually produces)
  const pdfParse = (await import('pdf-parse')).default
  const raw = await pdfParse(bytes)
  const rawText = raw.text

  console.log('Parsing PDF (after normalization)...')
  const normalizedText = normalizePdfText(rawText)

  const keywords = KEYWORDS[keywordGroup] ?? [keywordGroup]
  const WINDOW = 400 // chars around each match

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Keyword group: ${keywordGroup} — ${slug}`)
  console.log(`${'='.repeat(60)}`)

  for (const kw of keywords) {
    const re = new RegExp(kw, 'gi')
    let match: RegExpExecArray | null
    let count = 0

    console.log(`\n--- Keyword: "${kw}" ---`)

    // Show in raw text
    re.lastIndex = 0
    while ((match = re.exec(rawText)) !== null && count < 3) {
      const start = Math.max(0, match.index - WINDOW)
      const end = Math.min(rawText.length, match.index + kw.length + WINDOW)
      const snippet = rawText.slice(start, end).replace(/\n/g, '↵')
      console.log(`\n[RAW pos ${match.index}]`)
      console.log(snippet)
      count++
    }

    if (count === 0) console.log('  (not found in raw text)')

    // Show in normalized text if different
    count = 0
    re.lastIndex = 0
    while ((match = re.exec(normalizedText)) !== null && count < 2) {
      const start = Math.max(0, match.index - WINDOW)
      const end = Math.min(normalizedText.length, match.index + kw.length + WINDOW)
      const snippet = normalizedText.slice(start, end).replace(/\n/g, '↵')
      console.log(`\n[NORMALIZED pos ${match.index}]`)
      console.log(snippet)
      count++
    }
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
