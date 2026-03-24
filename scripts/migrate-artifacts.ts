/**
 * Phase 7: Legacy artifact migration script
 *
 * Converts existing data/extractions/*.json (legacy ExtractionArtifact format)
 * to new zone-structured artifacts under data/artifacts/.
 *
 * Migration rules:
 *   - Synthetic jurisdictions (no zoneFields): create a single __jurisdiction__ zone
 *     with all legacy fields copied over.
 *   - Real jurisdictions (have zoneFields): create ZonesArtifact from unique zones,
 *     one ZoneFieldsArtifact per zone, plus a __jurisdiction__ zone from legacy fields.
 *
 * Idempotent: skips any jurisdiction where data/artifacts/{slug}/{slug}_zones.json
 * already exists.
 *
 * Usage:
 *   npm run artifacts:migrate
 */

import fs from 'fs/promises'
import path from 'path'
import {
  ExtractionArtifact,
  FieldArtifact,
  ZoneEntry,
  ZoneFieldsArtifact,
  ZonesArtifact,
  ZoneFieldArtifact,
  slugifyZoneCode,
} from '../lib/pipeline/artifact'

const EXTRACTIONS_DIR = 'data/extractions'
const ARTIFACTS_DIR = 'data/artifacts'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

async function zonesFileExists(slug: string): Promise<boolean> {
  const zonesPath = path.join(ARTIFACTS_DIR, slug, `${slug}_zones.json`)
  try {
    await fs.access(zonesPath)
    return true
  } catch {
    return false
  }
}

/**
 * Convert legacy fields Record into a Record<string, FieldArtifact> with
 * source_page set to null (not available in legacy artifacts).
 */
function normalizeFields(fields: Record<string, FieldArtifact>): Record<string, FieldArtifact> {
  const result: Record<string, FieldArtifact> = {}
  for (const [fieldName, field] of Object.entries(fields)) {
    result[fieldName] = {
      ...field,
      source_page: null,
    }
  }
  return result
}

/**
 * Build a ZoneFieldsArtifact for the synthetic __jurisdiction__ zone
 * using the top-level legacy `fields`.
 */
function buildJurisdictionZoneFields(artifact: ExtractionArtifact): ZoneFieldsArtifact {
  return {
    jurisdictionId: artifact.jurisdictionId,
    slug: artifact.slug,
    zoneCode: '__jurisdiction__',
    zoneName: 'Jurisdiction-level (synthetic)',
    multifamilyClassification: 'primary',
    extractedAt: artifact.extractedAt,
    approved: true,
    fields: normalizeFields(artifact.fields),
  }
}

// ─── synthetic jurisdiction migration ─────────────────────────────────────────

async function migrateSynthetic(artifact: ExtractionArtifact): Promise<{ filesCreated: number }> {
  const { slug } = artifact
  let filesCreated = 0

  // ZonesArtifact with a single synthetic zone
  const zonesArtifact: ZonesArtifact = {
    jurisdictionId: artifact.jurisdictionId,
    slug,
    sourceDocument: artifact.sourceDocument,
    extractedAt: artifact.extractedAt,
    approved: true,
    include_in_extraction: true,
    include_in_load: true,
    zones: [
      {
        zone_code: '__jurisdiction__',
        zone_name: 'Jurisdiction-level (synthetic)',
        multifamily_classification: 'primary',
        source_pages: [],
        include_in_extraction: true,
        include_in_load: true,
      },
    ],
  }

  const zonesPath = path.join(ARTIFACTS_DIR, slug, `${slug}_zones.json`)
  await writeJson(zonesPath, zonesArtifact)
  filesCreated++

  // ZoneFieldsArtifact for __jurisdiction__
  const fieldsArtifact = buildJurisdictionZoneFields(artifact)
  const zoneSlug = slugifyZoneCode('__jurisdiction__')
  const fieldsPath = path.join(ARTIFACTS_DIR, slug, `${slug}_${zoneSlug}_fields.json`)
  await writeJson(fieldsPath, fieldsArtifact)
  filesCreated++

  return { filesCreated }
}

// ─── real jurisdiction migration ───────────────────────────────────────────────

async function migrateReal(artifact: ExtractionArtifact): Promise<{ filesCreated: number }> {
  const { slug, zoneFields } = artifact
  let filesCreated = 0

  // Group zoneFields entries by zone_code
  const byZoneCode = new Map<string, ZoneFieldArtifact[]>()
  for (const entry of zoneFields!) {
    const existing = byZoneCode.get(entry.zone_code) ?? []
    existing.push(entry)
    byZoneCode.set(entry.zone_code, existing)
  }

  // Build the list of unique zones for ZonesArtifact
  // Use first occurrence of zone_code to get zone_name and multifamily_classification
  const firstByZone = new Map<string, ZoneFieldArtifact>()
  for (const entry of zoneFields!) {
    if (!firstByZone.has(entry.zone_code)) {
      firstByZone.set(entry.zone_code, entry)
    }
  }

  const zoneEntries: ZoneEntry[] = []

  // Add the __jurisdiction__ synthetic zone first (from legacy top-level fields)
  zoneEntries.push({
    zone_code: '__jurisdiction__',
    zone_name: 'Jurisdiction-level (synthetic)',
    multifamily_classification: 'primary',
    source_pages: [],
    include_in_extraction: true,
    include_in_load: true,
  })

  // Add each unique zone from zoneFields
  for (const [zoneCode, first] of firstByZone.entries()) {
    zoneEntries.push({
      zone_code: zoneCode,
      zone_name: first.zone_name ?? null,
      multifamily_classification: first.multifamily_classification,
      source_pages: [],
      include_in_extraction: true,
      include_in_load: true,
    })
  }

  const zonesArtifact: ZonesArtifact = {
    jurisdictionId: artifact.jurisdictionId,
    slug,
    sourceDocument: artifact.sourceDocument,
    extractedAt: artifact.extractedAt,
    approved: true,
    include_in_extraction: true,
    include_in_load: true,
    zones: zoneEntries,
  }

  const zonesPath = path.join(ARTIFACTS_DIR, slug, `${slug}_zones.json`)
  await writeJson(zonesPath, zonesArtifact)
  filesCreated++

  // Write ZoneFieldsArtifact for __jurisdiction__ (from top-level legacy fields)
  const jurisdictionFields = buildJurisdictionZoneFields(artifact)
  const jurisdictionZoneSlug = slugifyZoneCode('__jurisdiction__')
  const jurisdictionFieldsPath = path.join(
    ARTIFACTS_DIR,
    slug,
    `${slug}_${jurisdictionZoneSlug}_fields.json`,
  )
  await writeJson(jurisdictionFieldsPath, jurisdictionFields)
  filesCreated++

  // Write one ZoneFieldsArtifact per unique zone
  for (const [zoneCode, entries] of byZoneCode.entries()) {
    // Take the first entry to get zone metadata
    const first = entries[0]

    // Build fields Record from the list of ZoneFieldArtifact entries for this zone
    const fields: Record<string, FieldArtifact> = {}
    for (const entry of entries) {
      fields[entry.field_name] = {
        raw_value: entry.raw_value,
        raw_unit: entry.raw_unit,
        field_value: entry.field_value,
        field_value_text: entry.field_value_text,
        unit: entry.unit,
        confidence: entry.confidence,
        source_section: entry.source_section,
        district_context: entry.district_context,
        reasoning: entry.reasoning,
        source_page: null,
      }
    }

    const zoneFieldsArtifact: ZoneFieldsArtifact = {
      jurisdictionId: artifact.jurisdictionId,
      slug,
      zoneCode,
      zoneName: first.zone_name ?? null,
      multifamilyClassification: first.multifamily_classification,
      extractedAt: artifact.extractedAt,
      approved: true,
      fields,
    }

    const zoneSlug = slugifyZoneCode(zoneCode)
    const fieldsPath = path.join(ARTIFACTS_DIR, slug, `${slug}_${zoneSlug}_fields.json`)
    await writeJson(fieldsPath, zoneFieldsArtifact)
    filesCreated++
  }

  return { filesCreated }
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Find all legacy extraction files
  const entries = await fs.readdir(EXTRACTIONS_DIR)
  const jsonFiles = entries.filter((f) => f.endsWith('.json'))

  if (jsonFiles.length === 0) {
    console.log(`No files found in ${EXTRACTIONS_DIR}`)
    return
  }

  let totalCreated = 0
  let totalSkipped = 0
  const skippedSlugs: string[] = []
  const migratedSlugs: string[] = []

  for (const filename of jsonFiles.sort()) {
    const filePath = path.join(EXTRACTIONS_DIR, filename)
    const raw = await fs.readFile(filePath, 'utf-8')
    const artifact = JSON.parse(raw) as ExtractionArtifact
    const { slug } = artifact

    // Idempotency check: skip if zones artifact already exists
    if (await zonesFileExists(slug)) {
      console.log(`SKIP  ${slug}  — ${ARTIFACTS_DIR}/${slug}/${slug}_zones.json already exists`)
      totalSkipped++
      skippedSlugs.push(slug)
      continue
    }

    const isSynthetic = !artifact.zoneFields || artifact.zoneFields.length === 0

    if (isSynthetic) {
      console.log(`Migrating ${slug}  (synthetic — no zoneFields)`)
      const { filesCreated } = await migrateSynthetic(artifact)
      console.log(`  created ${filesCreated} file(s)`)
      totalCreated += filesCreated
    } else {
      const zoneCount = new Set(artifact.zoneFields!.map((z) => z.zone_code)).size
      console.log(`Migrating ${slug}  (real — ${zoneCount} zones)`)
      const { filesCreated } = await migrateReal(artifact)
      console.log(`  created ${filesCreated} file(s)`)
      totalCreated += filesCreated
    }

    migratedSlugs.push(slug)
  }

  console.log('')
  console.log('Migration complete:')
  console.log(`  migrated: ${migratedSlugs.length}  (${migratedSlugs.join(', ')})`)
  if (skippedSlugs.length > 0) {
    console.log(`  skipped:  ${skippedSlugs.length}  (${skippedSlugs.join(', ')})`)
  }
  console.log(`  files created: ${totalCreated}`)
  console.log('')
  console.log(
    'Reminder: once migration is verified, data/extractions/ can be deleted manually.',
  )
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
