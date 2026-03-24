/**
 * Pipeline Stage 3 — Load Zone Fields to Database
 *
 * Reads approved zone fields artifacts from the local repo and upserts each
 * zone's fields to zone_extracted_fields.  Also records a pipeline run.
 *
 * Usage:
 *   npm run pipeline:load <jurisdiction_slug>
 *   npm run pipeline:load fairfax_va
 *
 * Gates:
 *   - Requires zones artifact (to validate zone membership).
 *   - Skips zone field files where approved: false (logs which were skipped).
 *   - Skips zones where include_in_load: false in the zones artifact.
 *   - Warns about field files that don't correspond to a known zone.
 *
 * source_page comes from the field artifact — page-resolver is NOT called.
 *
 * Always reads from the local repo (buildLoadArtifactStore) — never from GCS.
 */

import path from 'path'
import fs from 'fs/promises'
import { db } from '../db/client'
import { jurisdictions, zoneExtractedFields, pipelineRuns } from '../db/schema'
import { buildLoadArtifactStore } from '../lib/pipeline/artifact-store'
import { normalizeExtractionResult } from '../lib/pipeline/normalize'
import { validateExtractionResult } from '../lib/pipeline/validate'
import { startRun, completeRun, failRun } from '../lib/pipeline/run-record'
import { toNumericString } from '../lib/pipeline/numeric'
import { slugifyZoneCode, ZoneFieldsArtifact, ZonesArtifact } from '../lib/pipeline/artifact'
import { eq, sql } from 'drizzle-orm'

// ─── helpers ──────────────────────────────────────────────────────────────────

function resolveJurisdiction(
  slug: string,
  allJurisdictions: { id: string; slug: string; name: string; displayName: string }[],
) {
  const exact = allJurisdictions.find((j) => j.slug === slug)
  if (exact) return exact
  const prefix = slug.split(/[_-]/)[0]
  return allJurisdictions.find((j) => j.name.toLowerCase().startsWith(prefix.toLowerCase())) ?? null
}

/** Strip null bytes and non-printable control chars — PostgreSQL rejects 0x00 in UTF-8 */
function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const r = s.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ').trim()
  return r || null
}

// ─── find all zone field files for a slug ────────────────────────────────────

/**
 * Returns all {slug}_{zoneSlug}_fields.json filenames (basename only)
 * found in data/artifacts/{slug}/.
 */
async function findZoneFieldFiles(slug: string): Promise<string[]> {
  const dir = path.join('data', 'artifacts', slug)
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }
  // Match {slug}_{anything}_fields.json, excluding {slug}_zones.json and {slug}_scores.json
  const pattern = new RegExp(`^${slug}_(.+)_fields\\.json$`)
  return entries.filter((f) => pattern.test(f))
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slugArg = process.argv[2]

  if (!slugArg) {
    console.error('Usage: npm run pipeline:load <jurisdiction_slug>')
    console.error('Example: npm run pipeline:load fairfax_va')
    process.exit(1)
  }

  const logger = {
    info:  (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
    warn:  (msg: string, ctx?: object) => console.warn(`   WARN ${msg}`, ctx ?? ''),
    error: (msg: string, ctx?: object) => console.error(`   ERROR ${msg}`, ctx ?? ''),
  }

  console.log(`\nParcela — pipeline:load`)
  console.log(`Slug:     ${slugArg}\n`)

  // 1. Resolve jurisdiction from DB
  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = resolveJurisdiction(slugArg, allJurisdictions)

  if (!jur) {
    console.error(`ERROR: Jurisdiction not found in DB for slug: ${slugArg}`)
    console.error(`  Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    console.error(`  Run npm run db:seed first.`)
    process.exit(1)
  }

  logger.info(`Jurisdiction: ${jur.displayName} (${jur.id})`)

  const store = buildLoadArtifactStore()

  // 2. Read zones artifact
  let zonesArtifact: ZonesArtifact
  try {
    zonesArtifact = await store.readZones(jur.slug)
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    console.error(`  Run npm run pipeline:zones ${slugArg} first.`)
    process.exit(1)
  }

  // Check jurisdiction-level master switch
  if (!zonesArtifact.include_in_load) {
    logger.info(`Jurisdiction-level include_in_load is false — nothing to load.`)
    process.exit(0)
  }

  // Build a lookup: zoneSlug → ZoneEntry
  const zoneBySlug = new Map(
    zonesArtifact.zones.map((z) => [slugifyZoneCode(z.zone_code), z]),
  )
  const zoneByCode = new Map(zonesArtifact.zones.map((z) => [z.zone_code, z]))

  // 3. Find all field files on disk
  const fieldFiles = await findZoneFieldFiles(jur.slug)
  logger.info(`Found ${fieldFiles.length} zone field file(s)`)

  if (fieldFiles.length === 0) {
    logger.warn('No zone field files found. Run npm run pipeline:extract first.')
    process.exit(0)
  }

  // 4. Warn about orphaned field files (not in zones artifact)
  for (const filename of fieldFiles) {
    // Extract zone slug from filename: {slug}_{zoneSlug}_fields.json
    const match = filename.match(new RegExp(`^${jur.slug}_(.+)_fields\\.json$`))
    if (match) {
      const zoneSlug = match[1]
      if (!zoneBySlug.has(zoneSlug)) {
        logger.warn(`Field file ${filename} does not correspond to any zone in the zones artifact — skipping.`)
      }
    }
  }

  // 5. Start pipeline run record
  const run = await startRun(db, jur.id, zonesArtifact.sourceDocument)
  logger.info(`Pipeline run started`, { runId: run.id })

  let totalFieldsLoaded = 0
  let zonesLoaded = 0
  let zonesSkipped = 0
  const skippedZones: string[] = []

  try {
    // 6. Process each field file
    for (const filename of fieldFiles) {
      const match = filename.match(new RegExp(`^${jur.slug}_(.+)_fields\\.json$`))
      if (!match) continue
      const zoneSlug = match[1]

      // Skip if not in zones artifact
      if (!zoneBySlug.has(zoneSlug)) continue

      const zoneEntry = zoneBySlug.get(zoneSlug)!

      // Skip if zone has include_in_load: false
      if (!zoneEntry.include_in_load) {
        logger.info(`Zone ${zoneEntry.zone_code}: include_in_load is false — skipping.`)
        skippedZones.push(zoneEntry.zone_code)
        zonesSkipped++
        continue
      }

      // Read the field artifact
      let fieldsArtifact: ZoneFieldsArtifact
      try {
        fieldsArtifact = await store.readZoneFields(jur.slug, zoneEntry.zone_code)
      } catch (err) {
        logger.warn(`Zone ${zoneEntry.zone_code}: could not read fields artifact — skipping.`, {
          error: err instanceof Error ? err.message : String(err),
        })
        skippedZones.push(zoneEntry.zone_code)
        zonesSkipped++
        continue
      }

      // Skip unapproved artifacts
      if (!fieldsArtifact.approved) {
        logger.info(`Zone ${zoneEntry.zone_code}: approved: false — skipping.`)
        skippedZones.push(zoneEntry.zone_code)
        zonesSkipped++
        continue
      }

      // 7. Build upsert rows
      const fieldEntries = Object.entries(fieldsArtifact.fields)
      const zoneRows = fieldEntries.map(([fieldName, fa]) => {
        // Re-normalize and re-validate (idempotent)
        const asRaw = {
          field_name:       fieldName,
          raw_value:        fa.raw_value,
          raw_unit:         fa.raw_unit ?? '',
          field_value:      fa.field_value,
          field_value_text: fa.field_value_text,
          unit:             fa.unit ?? '',
          confidence:       fa.confidence,
          source_section:   fa.source_section ?? '',
          district_context: fa.district_context ?? '',
          reasoning:        fa.reasoning ?? '',
        }
        const normalized = normalizeExtractionResult(asRaw)
        const { result: validated } = validateExtractionResult(normalized)

        return {
          jurisdictionId:            jur.id,
          zoneCode:                  fieldsArtifact.zoneCode,
          zoneName:                  fieldsArtifact.zoneName,
          multifamilyClassification: fieldsArtifact.multifamilyClassification,
          fieldName,
          rawValue:                  toNumericString(validated.raw_value),
          rawUnit:                   clean(validated.raw_unit),
          fieldValue:                toNumericString(validated.field_value),
          fieldValueText:            clean(validated.field_value_text) ?? 'Not found in document',
          unit:                      clean(validated.unit),
          confidence:                validated.confidence,
          sourceSection:             clean(validated.source_section),
          // source_page comes from the artifact — no page-resolver
          sourcePage:                fa.source_page ?? null,
          pipelineRunId:             run.id,
        }
      })

      const validRows = zoneRows.filter((r) => r.zoneCode && r.fieldName)

      if (validRows.length > 0) {
        await db
          .insert(zoneExtractedFields)
          .values(validRows)
          .onConflictDoUpdate({
            target: [
              zoneExtractedFields.jurisdictionId,
              zoneExtractedFields.zoneCode,
              zoneExtractedFields.fieldName,
            ],
            set: {
              zoneName:                  sql`excluded.zone_name`,
              multifamilyClassification: sql`excluded.multifamily_classification`,
              rawValue:                  sql`excluded.raw_value`,
              rawUnit:                   sql`excluded.raw_unit`,
              fieldValue:                sql`excluded.field_value`,
              fieldValueText:            sql`excluded.field_value_text`,
              unit:                      sql`excluded.unit`,
              confidence:                sql`excluded.confidence`,
              sourceSection:             sql`excluded.source_section`,
              sourcePage:                sql`excluded.source_page`,
              pipelineRunId:             sql`excluded.pipeline_run_id`,
              extractedAt:               sql`now()`,
            },
          })

        logger.info(`Zone ${fieldsArtifact.zoneCode}: loaded ${validRows.length} field(s)`)
        totalFieldsLoaded += validRows.length
        zonesLoaded++
      } else {
        logger.warn(`Zone ${fieldsArtifact.zoneCode}: no valid field rows to upsert.`)
        zonesSkipped++
      }
    }

    // 8. Complete pipeline run
    await completeRun(db, run.id, { fieldsExtracted: totalFieldsLoaded, fieldsFailed: 0 })

    console.log(`\nSummary:`)
    console.log(`  Zones loaded:    ${zonesLoaded}`)
    console.log(`  Zones skipped:   ${zonesSkipped}`)
    console.log(`  Fields upserted: ${totalFieldsLoaded}`)
    if (skippedZones.length > 0) {
      console.log(`  Skipped zones:   ${skippedZones.join(', ')}`)
    }
    console.log(`\nNext step: npm run pipeline:score ${slugArg}`)
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).replace(/\x00/g, '')
    logger.error('Load stage fatal error', { message })
    await failRun(db, run.id, message)
    process.exit(1)
  }

  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
