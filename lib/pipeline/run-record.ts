/**
 * E0-5: Pipeline run record storage
 *
 * Manages the lifecycle of a `pipeline_runs` row for a single jurisdiction
 * processing run.  The schema already defines this table (db/schema.ts):
 *
 *   pipelineRuns { id, jurisdictionId, status, fieldsExtracted, fieldsFailed,
 *                  sourceDocument, startedAt, completedAt, errorMessage }
 *
 * Usage pattern (E0-1 pipeline runner):
 *   const run = await startRun(db, jurisdictionId, sourceDoc)
 *   ... extract fields ...
 *   await completeRun(db, run.id, { fieldsExtracted, fieldsFailed })
 *   // or on fatal error:
 *   await failRun(db, run.id, errorMessage)
 */

import { desc, eq } from 'drizzle-orm'
import { Database } from '../../db/client'
import { pipelineRuns } from '../../db/schema'

export type PipelineStatus = 'running' | 'completed' | 'failed' | 'partial'

export interface PipelineRun {
  id: string
  jurisdictionId: string
  status: PipelineStatus
  fieldsExtracted: number
  fieldsFailed: number
  sourceDocument: string | null
  startedAt: Date
  completedAt: Date | null
  errorMessage: string | null
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Insert a new run record with status 'running'.
 * Call this before any extraction work begins.
 */
export async function startRun(
  db: Database,
  jurisdictionId: string,
  sourceDocument?: string,
): Promise<PipelineRun> {
  const rows = await db
    .insert(pipelineRuns)
    .values({
      jurisdictionId,
      status: 'running',
      fieldsExtracted: 0,
      fieldsFailed: 0,
      sourceDocument: sourceDocument ?? null,
    })
    .returning()

  return rows[0] as PipelineRun
}

/**
 * Mark a run as completed (or partial if some fields failed).
 * Status is 'completed' when fieldsFailed === 0, otherwise 'partial'.
 */
export async function completeRun(
  db: Database,
  runId: string,
  counts: { fieldsExtracted: number; fieldsFailed: number },
): Promise<PipelineRun> {
  const status: PipelineStatus =
    counts.fieldsFailed === 0 ? 'completed' : 'partial'

  const rows = await db
    .update(pipelineRuns)
    .set({
      status,
      fieldsExtracted: counts.fieldsExtracted,
      fieldsFailed: counts.fieldsFailed,
      completedAt: new Date(),
    })
    .where(eq(pipelineRuns.id, runId))
    .returning()

  return rows[0] as PipelineRun
}

/**
 * Mark a run as failed with an error message.
 * Use for fatal errors that prevent the run from producing any results.
 */
export async function failRun(
  db: Database,
  runId: string,
  errorMessage: string,
): Promise<PipelineRun> {
  const rows = await db
    .update(pipelineRuns)
    .set({
      status: 'failed',
      completedAt: new Date(),
      errorMessage,
    })
    .where(eq(pipelineRuns.id, runId))
    .returning()

  return rows[0] as PipelineRun
}

/**
 * Fetch the most recent pipeline run for a jurisdiction.
 * Returns null if no run exists yet.
 */
export async function getLatestRun(
  db: Database,
  jurisdictionId: string,
): Promise<PipelineRun | null> {
  const rows = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.jurisdictionId, jurisdictionId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1)

  return (rows[0] as PipelineRun) ?? null
}
