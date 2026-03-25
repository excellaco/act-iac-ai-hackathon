/**
 * Full pipeline runner — chains all 4 stages for a single jurisdiction.
 *
 * Usage:
 *   npm run pipeline:run <jurisdiction_slug>
 *   npm run pipeline:run fairfax_va
 *
 * Stages:
 *   1. zones   — discover zones, write {slug}_zones.json
 *   2. extract — for each zone, extract fields, write {slug}_{zone}_fields.json
 *   3. load    — read approved artifacts, upsert to DB
 *   4. score   — compute RIS scores, write {slug}_scores.json
 *
 * Approval gates:
 *   - Halts between Stage 1 and Stage 2 if zones artifact is not approved.
 *   - Stage 3 silently skips unapproved zone field artifacts (by design).
 *
 * Environment variables (set in .env.local):
 *   DATABASE_URL         — PostgreSQL connection string (required for load/score)
 *   GOOGLE_CLOUD_PROJECT — GCP project ID (required for Gemini calls)
 *   RAW_DATA_BUCKET      — GCS bucket; omit to use local data/raw/ fallback
 */

import { db } from '../db/client'
import { jurisdictions } from '../db/schema'
import { buildExtractArtifactStore, buildLoadArtifactStore } from '../lib/pipeline/artifact-store'
import { GcsFetcher } from '../lib/pipeline/gcs-fetcher'
import { LocalFetcher } from '../lib/pipeline/local-fetcher'
import { PdfParserImpl } from '../lib/pipeline/pdf-parser'
import { buildZoneAwareExtractors } from '../lib/extractors/index'
import { discoverZones } from '../lib/extractors/zone-discovery.extractor'
import { createGeminiLimiter } from '../lib/pipeline/gemini-concurrency'
import { chunkText, TextChunk } from '../lib/pipeline/chunk'
import { normalizeExtractionResult } from '../lib/pipeline/normalize'
import { validateExtractionResult } from '../lib/pipeline/validate'
import { startRun, completeRun, failRun } from '../lib/pipeline/run-record'
import { toNumericString } from '../lib/pipeline/numeric'
import { computeZoneRIS, averageZoneRIS, REGIONAL_MULTIPLIERS, DEFAULT_REGIONAL_MULTIPLIER } from '../lib/scoringEngine'
import { computeFeasibility } from '../lib/feasibility'
import { computeRIS } from '../lib/scoring'
import {
  ZonesArtifact, ZoneEntry, ZoneFieldsArtifact, FieldArtifact, ScoresArtifact, ZoneScoreEntry,
  ParsedPage, slugifyZoneCode,
} from '../lib/pipeline/artifact'
import { FieldExtractor } from '../lib/pipeline/runner'
import {
  extractedFields, marketData, zoneExtractedFields, zoneRisScores, risScores, feasibilityOutputs,
} from '../db/schema'
import { eq, sql } from 'drizzle-orm'
import type { ReviewType } from '../lib/scoringEngine'

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

function findSourcePages(pages: ParsedPage[], zoneCode: string): number[] {
  const needle = zoneCode.toLowerCase()
  return pages.filter((p) => p.text.toLowerCase().includes(needle)).map((p) => p.page)
}

function findSourcePage(pages: ParsedPage[], searchText: string): number | null {
  if (!searchText || searchText === 'Not found in document') return null
  const needle = searchText.toLowerCase().trim()
  for (const { page, text } of pages) {
    if (text.toLowerCase().includes(needle)) return page
  }
  return null
}

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

function isHighConfidenceWithValue(result: { confidence: string; raw_value: number | null; field_value_text: string }): boolean {
  return result.confidence === 'high' && (result.raw_value !== null || (result.field_value_text ?? '').trim().length > 0)
}

function clean(s: string | null | undefined): string | null {
  if (s == null) return null
  const r = s.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ').trim()
  return r || null
}

function parseNum(v: string | null | undefined, fallback: number): number {
  if (v == null) return fallback
  const n = Number(v)
  return Number.isNaN(n) ? fallback : n
}

function asReviewType(v: string | null | undefined): ReviewType {
  if (v === 'by_right' || v === 'by-right') return 'by-right'
  if (v === 'conditional_use_permit' || v === 'conditional-use-permit') return 'conditional-use-permit'
  if (v === 'special_use_permit' || v === 'special-use-permit') return 'special-use-permit'
  return 'conditional-use-permit'
}

// ─── two-pass field extraction ────────────────────────────────────────────────

async function extractFieldTwoPass(
  extractor: FieldExtractor,
  narrowChunks: string[],
  allChunks: string[],
  logger: { warn: (msg: string, ctx?: object) => void },
) {
  const scanChunks = async (chunks: string[]) => {
    let best: Awaited<ReturnType<FieldExtractor['extract']>> = null
    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await extractor.extract(chunks[i])
        if (!result) continue
        const resultHasValue = result.raw_value !== null || result.field_value_text?.trim()
        const bestHasValue = best && (best.raw_value !== null || best.field_value_text?.trim())
        if (!best || (!bestHasValue && resultHasValue) ||
            (bestHasValue === resultHasValue && confidenceRank(result.confidence) > confidenceRank(best.confidence))) {
          best = result
        }
        if (best && isHighConfidenceWithValue(best)) break
      } catch (err) {
        logger.warn('extractor error on chunk', {
          fieldName: extractor.fieldName,
          chunkIndex: i + 1,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return best
  }

  let result = narrowChunks.length > 0 ? await scanChunks(narrowChunks) : null
  if (!result || !isHighConfidenceWithValue(result)) {
    const fallback = await scanChunks(allChunks)
    if (!result || (!result.raw_value && !result.field_value_text?.trim() && fallback) ||
        (fallback && confidenceRank(fallback.confidence) > confidenceRank(result.confidence))) {
      result = fallback
    }
  }

  if (!result) {
    result = {
      field_name: extractor.fieldName,
      raw_value: null, raw_unit: '', field_value: null,
      field_value_text: 'Not found in document', unit: '',
      confidence: 'low', source_section: '', district_context: '',
      reasoning: 'Field not found in any text chunk',
    }
  }

  const normalized = normalizeExtractionResult(result)
  const { result: validated } = validateExtractionResult(normalized)
  return validated
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const slugArg = process.argv[2]

  if (!slugArg) {
    console.error('Usage: npm run pipeline:run <jurisdiction_slug>')
    console.error('Example: npm run pipeline:run fairfax_va')
    process.exit(1)
  }

  const logger = {
    info:  (msg: string, ctx?: object) => console.log(`   ${msg}`, ctx ?? ''),
    warn:  (msg: string, ctx?: object) => console.warn(`   WARN ${msg}`, ctx ?? ''),
    error: (msg: string, ctx?: object) => console.error(`   ERROR ${msg}`, ctx ?? ''),
    debug: (msg: string, ctx?: object) => {
      if (process.env.LOG_LEVEL === 'debug') console.log(`   [debug] ${msg}`, ctx ?? '')
    },
  }

  console.log(`\nParcela — full pipeline run`)
  console.log(`Slug:     ${slugArg}`)
  console.log(`Fetcher:  ${process.env.RAW_DATA_BUCKET ? `GCS (${process.env.RAW_DATA_BUCKET})` : 'local (data/raw/)'}`)
  console.log(`Model:    ${process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'}\n`)

  const allJurisdictions = await db.select().from(jurisdictions)
  const jur = resolveJurisdiction(slugArg, allJurisdictions)

  if (!jur) {
    console.error(`ERROR: Jurisdiction not found in DB for slug: ${slugArg}`)
    console.error(`  Known slugs: ${allJurisdictions.map((j) => j.slug).join(', ')}`)
    console.error(`  Run npm run db:seed first.`)
    process.exit(1)
  }

  logger.info(`Jurisdiction: ${jur.displayName} (${jur.id})`)

  const extractStore = buildExtractArtifactStore()
  const loadStore = buildLoadArtifactStore()

  // ── Stage 1: Zones ──────────────────────────────────────────────────────────

  console.log(`\n[Stage 1: zones]`)

  let zonesArtifact: ZonesArtifact | null = null

  try {
    zonesArtifact = await extractStore.readZones(jur.slug)
    if (zonesArtifact.approved) {
      logger.info(`Zones artifact already approved — skipping zone discovery.`)
    } else {
      console.error(`\nAPPROVAL GATE: Zones artifact exists but is not approved.`)
      console.error(`  File: data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
      console.error(`  Review the zones list and set "approved": true, then re-run pipeline:run.`)
      process.exit(1)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!msg.includes('No zones artifact')) {
      console.error(`ERROR reading zones artifact: ${msg}`)
      process.exit(1)
    }

    // No zones artifact — run discovery
    logger.info('No zones artifact found — running zone discovery...')

    const fetcher = process.env.RAW_DATA_BUCKET ? new GcsFetcher() : new LocalFetcher()
    const { bytes, sourceDocument } = await fetcher.fetch(jur.id, jur.slug)
    logger.info(`PDF fetched: ${sourceDocument}`)

    const parser = new PdfParserImpl()
    const { text, pages } = await parser.parse(bytes)
    logger.info(`PDF parsed: ${pages.length} pages`)

    await extractStore.writePages(jur.slug, {
      sourceDocument,
      parsedAt: new Date().toISOString(),
      extractionMethod: 'text',
      pages,
    })

    const chunks = chunkText(text)
    const limiter = createGeminiLimiter()
    const discoveredZones = await discoverZones(chunks.map((c) => c.text), limiter, logger)
    logger.info(`Zone discovery complete: ${discoveredZones.length} zones`)

    const zoneEntries: ZoneEntry[] = discoveredZones.map((dz) => ({
      zone_code: dz.zone_code,
      zone_name: dz.zone_name,
      multifamily_classification: dz.multifamily_classification,
      source_pages: findSourcePages(pages, dz.zone_code),
      include_in_extraction: true,
      include_in_load: true,
    }))

    zonesArtifact = {
      jurisdictionId: jur.id,
      slug: jur.slug,
      sourceDocument,
      extractedAt: new Date().toISOString(),
      approved: false,
      include_in_extraction: true,
      include_in_load: true,
      zones: zoneEntries,
    }

    await extractStore.writeZones(jur.slug, zonesArtifact)
    logger.info(`Zones artifact written (${zoneEntries.length} zones)`)

    console.error(`\nAPPROVAL GATE: Zones artifact written but requires approval before extraction.`)
    console.error(`  File: data/artifacts/${jur.slug}/${jur.slug}_zones.json`)
    console.error(`  Review the zones list, set "approved": true, then re-run:`)
    console.error(`    npm run pipeline:run ${slugArg}`)
    process.exit(1)
  }

  // ── Stage 2: Extract ────────────────────────────────────────────────────────

  console.log(`\n[Stage 2: extract]`)

  if (!zonesArtifact.include_in_extraction) {
    logger.info('include_in_extraction is false — skipping extraction.')
  } else {
    const targetZones = zonesArtifact.zones.filter((z) => z.include_in_extraction)
    logger.info(`Extracting ${targetZones.length} zone(s)...`)

    // Read pages artifact (written by the zones stage above)
    const pagesArtifact = await extractStore.readPages(jur.slug)
    const pages: ParsedPage[] = pagesArtifact.pages
    logger.info(`Pages artifact loaded (${pages.length} pages)`)
    const allChunks: TextChunk[] = chunkText(pages.map((p) => p.text).join('\n\n'))

    const extractors = buildZoneAwareExtractors()

    const extractResults = await Promise.all(
      targetZones.map(async (zone) => {
        try {
          // Check for existing artifact
          try {
            const existing = await extractStore.readZoneFields(jur.slug, zone.zone_code)
            if (existing.approved) {
              logger.info(`Zone ${zone.zone_code}: already approved — skipping.`)
              return { zone_code: zone.zone_code, skipped: true }
            } else {
              logger.warn(`Zone ${zone.zone_code}: unapproved artifact exists — skipping.`)
              return { zone_code: zone.zone_code, skipped: true }
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (!msg.includes('No fields artifact')) throw err
          }

          const narrowChunks = allChunks
            .filter((c) => c.text.toLowerCase().includes(zone.zone_code.toLowerCase()))
            .map((c) => c.text)
          const allChunkTexts = allChunks.map((c) => c.text)

          const fields: Record<string, FieldArtifact> = {}
          await Promise.all(
            extractors.map(async (extractor) => {
              try {
                const validated = await extractFieldTwoPass(extractor, narrowChunks, allChunkTexts, logger)
                fields[extractor.fieldName] = {
                  raw_value:        validated.raw_value,
                  raw_unit:         validated.raw_unit || null,
                  field_value:      validated.field_value,
                  field_value_text: validated.field_value_text,
                  unit:             validated.unit || null,
                  confidence:       validated.confidence,
                  source_section:   validated.source_section || null,
                  district_context: validated.district_context || null,
                  reasoning:        validated.reasoning || null,
                  source_page:      findSourcePage(pages, validated.field_value_text),
                }
              } catch (err) {
                logger.warn(`Zone ${zone.zone_code}: field ${extractor.fieldName} failed`, {
                  error: err instanceof Error ? err.message : String(err),
                })
                fields[extractor.fieldName] = {
                  raw_value: null, raw_unit: null, field_value: null,
                  field_value_text: 'Not found in document', unit: null,
                  confidence: 'low', source_section: null,
                  district_context: zone.zone_code, reasoning: 'Extraction failed',
                  source_page: null,
                }
              }
            }),
          )

          const artifact: ZoneFieldsArtifact = {
            jurisdictionId: jur.id,
            slug: jur.slug,
            zoneCode: zone.zone_code,
            zoneName: zone.zone_name,
            multifamilyClassification: zone.multifamily_classification,
            extractedAt: new Date().toISOString(),
            approved: false,
            fields,
          }

          await extractStore.writeZoneFields(jur.slug, zone.zone_code, artifact)
          logger.info(`Zone ${zone.zone_code}: extracted and written.`)
          return { zone_code: zone.zone_code, skipped: false }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          logger.error(`Zone ${zone.zone_code}: failed`, { error })
          return { zone_code: zone.zone_code, skipped: false, error }
        }
      }),
    )

    const written = extractResults.filter((r) => !r.skipped && !r.error).length
    const skipped = extractResults.filter((r) => r.skipped).length
    const failed  = extractResults.filter((r) => r.error).length
    logger.info(`Extraction complete: ${written} written, ${skipped} skipped, ${failed} failed`)
  }

  // ── Stage 3: Load ───────────────────────────────────────────────────────────

  console.log(`\n[Stage 3: load]`)

  if (!zonesArtifact.include_in_load) {
    logger.info('include_in_load is false — skipping load.')
  } else {
    const run = await startRun(db, jur.id, zonesArtifact.sourceDocument)
    let totalFieldsLoaded = 0

    try {
      for (const zone of zonesArtifact.zones) {
        if (!zone.include_in_load) {
          logger.info(`Zone ${zone.zone_code}: include_in_load false — skipping.`)
          continue
        }

        let fieldsArtifact: ZoneFieldsArtifact
        try {
          fieldsArtifact = await loadStore.readZoneFields(jur.slug, zone.zone_code)
        } catch {
          logger.info(`Zone ${zone.zone_code}: no fields artifact — skipping.`)
          continue
        }

        if (!fieldsArtifact.approved) {
          logger.info(`Zone ${zone.zone_code}: not approved — skipping.`)
          continue
        }

        const rows = Object.entries(fieldsArtifact.fields).map(([fieldName, fa]) => {
          const asRaw = {
            field_name: fieldName, raw_value: fa.raw_value,
            raw_unit: fa.raw_unit ?? '', field_value: fa.field_value,
            field_value_text: fa.field_value_text, unit: fa.unit ?? '',
            confidence: fa.confidence, source_section: fa.source_section ?? '',
            district_context: fa.district_context ?? '', reasoning: fa.reasoning ?? '',
          }
          const normalized = normalizeExtractionResult(asRaw)
          const { result: validated } = validateExtractionResult(normalized)
          return {
            jurisdictionId:            jur.id,
            zoneCode:                  fieldsArtifact.zoneCode,
            zoneName:                  fieldsArtifact.zoneName,
            multifamilyClassification: fieldsArtifact.multifamilyClassification,
            fieldName,
            rawValue:        toNumericString(validated.raw_value),
            rawUnit:         clean(validated.raw_unit),
            fieldValue:      toNumericString(validated.field_value),
            fieldValueText:  clean(validated.field_value_text) ?? 'Not found in document',
            unit:            clean(validated.unit),
            confidence:      validated.confidence,
            sourceSection:   clean(validated.source_section),
            sourcePage:      fa.source_page ?? null,
            pipelineRunId:   run.id,
          }
        }).filter((r) => r.zoneCode && r.fieldName)

        if (rows.length > 0) {
          await db
            .insert(zoneExtractedFields)
            .values(rows)
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
          totalFieldsLoaded += rows.length
          logger.info(`Zone ${zone.zone_code}: loaded ${rows.length} field(s)`)
        }
      }

      await completeRun(db, run.id, { fieldsExtracted: totalFieldsLoaded, fieldsFailed: 0 })
      logger.info(`Load complete: ${totalFieldsLoaded} fields upserted`)
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).replace(/\x00/g, '')
      logger.error('Load stage fatal error', { message })
      await failRun(db, run.id, message)
      process.exit(1)
    }
  }

  // ── Stage 4: Score ──────────────────────────────────────────────────────────

  console.log(`\n[Stage 4: score]`)

  const jFields = await db.select().from(extractedFields).where(eq(extractedFields.jurisdictionId, jur.id))
  const fieldMap: Record<string, number | string | null> = {}
  for (const f of jFields) {
    fieldMap[f.fieldName] = f.fieldValue != null ? parseNum(f.fieldValue, 0) : f.fieldValueText
  }

  const market = await db.query.marketData.findFirst({ where: eq(marketData.jurisdictionId, jur.id) })
  const fmr2br = parseNum(market?.fmr2br, 1800)
  const permits5plus = market?.permits5plus ?? 500
  const totalPermits = market?.totalPermits ?? 1000
  const regionalMultiplier = REGIONAL_MULTIPLIERS[jur.slug] ?? DEFAULT_REGIONAL_MULTIPLIER

  const fallbacks = {
    minLotSizeSqft:          parseNum(fieldMap['min_lot_size_sqft'] as string, 20_000),
    heightLimitFt:           parseNum(fieldMap['height_limit_ft'] as string, 50),
    densityLimitUpa:         parseNum(fieldMap['density_limit_units_per_acre'] as string, 20),
    parkingMinSpacesPerUnit: parseNum(fieldMap['parking_min_spaces_per_unit'] as string, 1.5),
    setbackFrontFt:          parseNum(fieldMap['setback_front_ft'] as string, 20),
    setbackSideFt:           parseNum(fieldMap['setback_side_ft'] as string, 10),
    setbackRearFt:           parseNum(fieldMap['setback_rear_ft'] as string, 20),
    discretionaryReviewType: asReviewType(fieldMap['discretionary_review_required'] as string),
    permits5plus, totalPermits, regionalMultiplier, fmr2br,
    slug: jur.slug,
  }

  const pciInputs = {
    permits5plus,
    totalPermits,
    discretionaryReviewType: fallbacks.discretionaryReviewType,
  }

  const zFields = await db.select().from(zoneExtractedFields).where(eq(zoneExtractedFields.jurisdictionId, jur.id))

  if (zFields.length === 0) {
    logger.warn('No zone fields in DB — skipping scoring.')
    process.exit(0)
  }

  const byZone = new Map<string, typeof zFields>()
  for (const f of zFields) {
    const arr = byZone.get(f.zoneCode) ?? []
    arr.push(f)
    byZone.set(f.zoneCode, arr)
  }

  const zoneResults = []
  for (const [zoneCode, fields] of byZone) {
    const zoneFm: Record<string, number> = {}
    for (const f of fields) {
      if (f.fieldValue != null) zoneFm[f.fieldName] = parseNum(f.fieldValue, 0)
    }
    const classification = fields[0].multifamilyClassification
    const zoneName = fields[0].zoneName ?? null
    if (classification !== 'primary' && classification !== 'permitted') {
      logger.info(`Zone ${zoneCode} (${classification}) — excluded from RIS`)
      continue
    }
    const zoneInputs = {
      minLotSizeSqft:          zoneFm['min_lot_size_sqft'],
      heightLimitFt:           zoneFm['height_limit_ft'],
      densityLimitUpa:         zoneFm['density_limit_units_per_acre'],
      parkingMinSpacesPerUnit: zoneFm['parking_min_spaces_per_unit'],
      setbackFrontFt:          zoneFm['setback_front_ft'],
      setbackSideFt:           zoneFm['setback_side_ft'],
      setbackRearFt:           zoneFm['setback_rear_ft'],
    }
    const result = computeZoneRIS(zoneInputs, fallbacks, pciInputs, zoneCode, zoneName, classification)
    zoneResults.push(result)
    logger.info(`Zone ${zoneCode} scored — DCI ${result.dci} / DCOI ${result.dcoi} / PCI ${result.pci}`)
  }

  if (zoneResults.length > 0) {
    const { zoneScores: filledZoneScores, averaged } = averageZoneRIS(zoneResults, jur.slug)

    for (const z of filledZoneScores) {
      const risComp = computeRIS(z)
      await db.insert(zoneRisScores).values({
        jurisdictionId: jur.id, zoneCode: z.zoneCode, zoneName: z.zoneName,
        multifamilyClassification: z.multifamilyClassification,
        risComposite: risComp.toString(), dci: z.dci.toString(),
        dcoi: z.dcoi.toString(), pci: z.pci.toString(), crp: z.crp.toString(),
      }).onConflictDoUpdate({
        target: [zoneRisScores.jurisdictionId, zoneRisScores.zoneCode],
        set: {
          zoneName: sql`excluded.zone_name`,
          multifamilyClassification: sql`excluded.multifamily_classification`,
          risComposite: sql`excluded.ris_composite`, dci: sql`excluded.dci`,
          dcoi: sql`excluded.dcoi`, pci: sql`excluded.pci`, crp: sql`excluded.crp`,
          scoredAt: sql`now()`,
        },
      })

      const zFr = byZone.get(z.zoneCode) ?? []
      const zoneFm2: Record<string, number> = {}
      for (const f of zFr) {
        if (f.fieldValue != null) zoneFm2[f.fieldName] = parseNum(f.fieldValue, 0)
      }
      const feas = computeFeasibility({
        densityLimitUpa: zoneFm2['density_limit_units_per_acre'] ?? fallbacks.densityLimitUpa,
        parkingMinSpacesPerUnit: zoneFm2['parking_min_spaces_per_unit'] ?? fallbacks.parkingMinSpacesPerUnit,
        heightLimitFt: zoneFm2['height_limit_ft'] ?? fallbacks.heightLimitFt,
        regionalMultiplier, fmr2br,
      })
      await db.insert(feasibilityOutputs).values({
        jurisdictionId: jur.id, zoneCode: z.zoneCode,
        maxUnitsPerAcre: feas.maxUnitsPerAcre.toString(),
        parkingFootprintPct: feas.parkingFootprintPct.toString(),
        estimatedCostPerUnit: feas.estimatedCostPerUnit.toString(),
        regionalCostMultiplier: regionalMultiplier.toString(),
        fmr2br: fmr2br.toString(),
        rentFeasibilityRatio: (feas.requiredRent / fmr2br).toFixed(3),
      }).onConflictDoUpdate({
        target: [feasibilityOutputs.jurisdictionId, feasibilityOutputs.zoneCode],
        set: {
          maxUnitsPerAcre: sql`excluded.max_units_per_acre`,
          parkingFootprintPct: sql`excluded.parking_footprint_pct`,
          estimatedCostPerUnit: sql`excluded.estimated_cost_per_unit`,
          regionalCostMultiplier: sql`excluded.regional_cost_multiplier`,
          fmr2br: sql`excluded.fmr_2br`,
          rentFeasibilityRatio: sql`excluded.rent_feasibility_ratio`,
          scoredAt: sql`now()`,
        },
      })
    }

    const risComposite = computeRIS(averaged)
    await db.insert(risScores).values({
      jurisdictionId: jur.id, risComposite: risComposite.toString(),
      dci: averaged.dci.toString(), dcoi: averaged.dcoi.toString(),
      pci: averaged.pci.toString(), crp: averaged.crp.toString(), peerSet: [],
    }).onConflictDoUpdate({
      target: risScores.jurisdictionId,
      set: {
        risComposite: sql`excluded.ris_composite`, dci: sql`excluded.dci`,
        dcoi: sql`excluded.dcoi`, pci: sql`excluded.pci`, crp: sql`excluded.crp`,
        scoredAt: sql`now()`,
      },
    })

    logger.info(`Jurisdiction avg — RIS ${risComposite}`)

    // Write ScoresArtifact
    const zoneScoreEntries: ZoneScoreEntry[] = filledZoneScores.map((z) => ({
      zone_code: z.zoneCode, zone_name: z.zoneName,
      multifamily_classification: z.multifamilyClassification,
      ris_composite: computeRIS(z), dci: z.dci, dcoi: z.dcoi, pci: z.pci, crp: z.crp,
    }))

    const scoresArtifact: ScoresArtifact = {
      jurisdictionId: jur.id, slug: jur.slug,
      scoredAt: new Date().toISOString(),
      jurisdiction: {
        ris_composite: risComposite, dci: averaged.dci, dcoi: averaged.dcoi,
        pci: averaged.pci, crp: averaged.crp,
      },
      zones: zoneScoreEntries,
    }

    await loadStore.writeScores(jur.slug, scoresArtifact)
    logger.info(`Scores artifact written: data/artifacts/${jur.slug}/${jur.slug}_scores.json`)
  }

  console.log(`\nPipeline complete for ${jur.displayName}.`)
  process.exit(0)
}

main().catch((err) => { console.error(err); process.exit(1) })
