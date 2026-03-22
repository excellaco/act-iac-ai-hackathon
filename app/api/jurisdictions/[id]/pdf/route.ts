/**
 * E0-130: PDF proxy endpoint
 *
 * Streams the source PDF for a jurisdiction from GCS (production) or local disk
 * (development) so the browser can display it in an iframe without exposing
 * GCS credentials or requiring signed URLs.
 *
 * The source document path is looked up from extracted_fields.source_document
 * (first non-null value for the jurisdiction — all fields share the same PDF).
 *
 * GET /api/jurisdictions/[id]/pdf
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { extractedFields } from '@/db/schema'
import { and, eq, isNotNull } from 'drizzle-orm'
import { Storage } from '@google-cloud/storage'
import fs from 'fs'
import path from 'path'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Look up source_document from any extracted field for this jurisdiction
  const [row] = await db
    .select({ sourceDocument: extractedFields.sourceDocument })
    .from(extractedFields)
    .where(and(eq(extractedFields.jurisdictionId, id), isNotNull(extractedFields.sourceDocument)))
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
      const [pdfBytes] = await storage.bucket(bucket).file(gcsPath).download()

      return new NextResponse(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    } else {
      // Development: read from local filesystem
      const localPath = path.resolve(sourceDocument)
      const pdfBytes = fs.readFileSync(localPath)

      return new NextResponse(pdfBytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, max-age=3600',
        },
      })
    }
  } catch {
    return NextResponse.json({ error: 'Failed to retrieve source PDF' }, { status: 500 })
  }
}
