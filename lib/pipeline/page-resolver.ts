/**
 * E0-130: Page-resolve pipeline stage
 *
 * After extract+load, this stage reads the parsed-pages artifact (written during
 * extraction) and searches each page's text for the verbatim field_value_text
 * quote extracted by Gemini.  The first page containing the quote is stored as
 * source_page on the extracted_fields row.
 *
 * This runs as a third sequential stage after extract→load, so page numbers are
 * populated without slowing down the initial extraction or requiring re-extraction.
 *
 * Page search is case-insensitive substring match.  Quotes that are not found
 * (e.g. "Not found in document") leave source_page as NULL.
 */

import { eq, and, isNotNull } from 'drizzle-orm'
import { Database } from '../../db/client'
import { extractedFields, zoneExtractedFields } from '../../db/schema'
import { ArtifactStore } from './artifact-store'
import { PipelineLogger, consoleLogger } from './errors'

/**
 * Search the parsed pages for the first page containing the given text.
 * Returns the 1-indexed page number, or null if not found.
 */
function findPage(pages: Array<{ page: number; text: string }>, searchText: string): number | null {
  if (!searchText || searchText === 'Not found in document') return null
  const needle = searchText.toLowerCase().trim()
  for (const { page, text } of pages) {
    if (text.toLowerCase().includes(needle)) return page
  }
  return null
}

/**
 * Page-resolve stage: update source_page for all extracted fields of a jurisdiction.
 *
 * Reads parsed-pages artifact from store, then for each field row in the DB
 * with a non-null field_value_text, finds the page number and writes it back.
 */
export async function runPageResolveStage(
  db: Database,
  jurisdictionId: string,
  slug: string,
  store: ArtifactStore,
  logger: PipelineLogger = consoleLogger,
): Promise<{ resolved: number; unresolved: number }> {
  logger.info('page-resolve stage started', { jurisdictionId, slug })

  // Load the parsed pages artifact
  const { pages } = await store.readPages(slug)
  logger.info('parsed pages loaded', { slug, pageCount: pages.length })

  // Load all extracted fields for this jurisdiction that have field_value_text
  const fields = await db
    .select({
      id: extractedFields.id,
      fieldName: extractedFields.fieldName,
      fieldValueText: extractedFields.fieldValueText,
    })
    .from(extractedFields)
    .where(and(eq(extractedFields.jurisdictionId, jurisdictionId), isNotNull(extractedFields.fieldValueText)))

  let resolved = 0
  let unresolved = 0

  for (const field of fields) {
    const page = findPage(pages, field.fieldValueText ?? '')
    if (page !== null) {
      await db
        .update(extractedFields)
        .set({ sourcePage: page })
        .where(eq(extractedFields.id, field.id))
      resolved++
    } else {
      unresolved++
    }
  }

  logger.info('page-resolve stage complete', { jurisdictionId, resolved, unresolved })
  return { resolved, unresolved }
}

/**
 * Zone page-resolve stage: update source_page for all zone_extracted_fields of a jurisdiction.
 *
 * Uses the same parsed-pages artifact as the jurisdiction-level stage — the PDF
 * is shared across all zones within a jurisdiction.
 */
export async function runZonePageResolveStage(
  db: Database,
  jurisdictionId: string,
  slug: string,
  store: ArtifactStore,
  logger: PipelineLogger = consoleLogger,
): Promise<{ resolved: number; unresolved: number }> {
  logger.info('zone page-resolve stage started', { jurisdictionId, slug })

  const { pages } = await store.readPages(slug)
  logger.info('parsed pages loaded', { slug, pageCount: pages.length })

  const fields = await db
    .select({
      id: zoneExtractedFields.id,
      fieldName: zoneExtractedFields.fieldName,
      zoneCode: zoneExtractedFields.zoneCode,
      fieldValueText: zoneExtractedFields.fieldValueText,
    })
    .from(zoneExtractedFields)
    .where(and(eq(zoneExtractedFields.jurisdictionId, jurisdictionId), isNotNull(zoneExtractedFields.fieldValueText)))

  let resolved = 0
  let unresolved = 0

  for (const field of fields) {
    const page = findPage(pages, field.fieldValueText ?? '')
    if (page !== null) {
      await db
        .update(zoneExtractedFields)
        .set({ sourcePage: page })
        .where(eq(zoneExtractedFields.id, field.id))
      resolved++
    } else {
      unresolved++
    }
  }

  logger.info('zone page-resolve stage complete', { jurisdictionId, resolved, unresolved })
  return { resolved, unresolved }
}
