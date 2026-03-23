/**
 * E0-130: PDF proxy endpoint
 *
 * Streams the source PDF for a jurisdiction from GCS (production) or local disk
 * (development) so the browser can display it in an iframe without exposing
 * GCS credentials or requiring signed URLs.
 *
 * The source document path is looked up from the most recent completed pipeline_runs
 * row that has a gs:// source_document. Using pipeline_runs avoids picking up stale
 * 'synthetic' placeholder values written to extracted_fields by earlier runs.
 *
 * GET /api/jurisdictions/[id]/pdf
 */

import { NextRequest, NextResponse } from 'next/server'

const PDF_HEADERS = {
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'inline',
  'Cache-Control': 'private, max-age=3600',
}
import { db } from '@/db/client'
import { pipelineRuns } from '@/db/schema'
import { and, desc, eq, isNotNull, like } from 'drizzle-orm'
import { Storage } from '@google-cloud/storage'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Look up source_document from the most recent completed pipeline run that has a GCS path.
  // Querying pipeline_runs avoids picking up stale 'synthetic' values from extracted_fields.
  const [row] = await db
    .select({ sourceDocument: pipelineRuns.sourceDocument })
    .from(pipelineRuns)
    .where(
      and(
        eq(pipelineRuns.jurisdictionId, id),
        eq(pipelineRuns.status, 'completed'),
        isNotNull(pipelineRuns.sourceDocument),
        like(pipelineRuns.sourceDocument, 'gs://%'),
      ),
    )
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1)

  if (!row?.sourceDocument) {
    return NextResponse.json({ error: 'No source document found for this jurisdiction' }, { status: 404 })
  }

  const sourceDocument = row.sourceDocument
  const bucket = process.env.RAW_DATA_BUCKET

  try {
    if (bucket && sourceDocument.startsWith('gs://')) {
      // Production: stream from GCS
      const gcsPath = sourceDocument.replace(`gs://${bucket}/`, '')
      const storage = new Storage()
      const [pdfBuffer] = await storage.bucket(bucket).file(gcsPath).download()

      return new Response(new Uint8Array(pdfBuffer), { headers: PDF_HEADERS })
    } else {
      // Development: read from local filesystem
      const localPath = path.resolve(sourceDocument)
      const pdfBytes = fs.readFileSync(localPath)

      return new Response(new Uint8Array(pdfBytes), { headers: PDF_HEADERS })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('pdf proxy error', { sourceDocument, bucket, message })
    return NextResponse.json({ error: 'Failed to retrieve source PDF', detail: message }, { status: 500 })
  }
}
