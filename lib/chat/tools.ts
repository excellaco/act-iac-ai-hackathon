/**
 * ADK tool definitions for the zoning policy chat agent.
 *
 * Each tool wraps existing data-access patterns so the LlmAgent can
 * retrieve jurisdiction data, read source PDFs, and run feasibility
 * calculations on behalf of the user.
 */

import { FunctionTool } from '@google/adk'
import { z } from 'zod'
import { db } from '@/db/client'
import {
  jurisdictions,
  extractedFields,
  risScores,
  feasibilityOutputs,
  marketData,
  zoneExtractedFields,
  zoneRisScores,
} from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { computeFeasibility } from '@/lib/feasibility'
import { GcsFetcher } from '@/lib/pipeline/gcs-fetcher'
import { PdfParserImpl } from '@/lib/pipeline/pdf-parser'
import { Storage } from '@google-cloud/storage'

// ── get_jurisdiction_data ────────────────────────────────────────────────────

export async function getJurisdictionData({
  jurisdictionId,
  zoneCode,
}: {
  jurisdictionId: string
  zoneCode?: string
}) {
  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(jurisdictions.id, jurisdictionId),
  })
  if (!jurisdiction) return { error: 'Jurisdiction not found' }

  // Zone-specific data path (E2-155)
  if (zoneCode) {
    const zFields = await db
      .select()
      .from(zoneExtractedFields)
      .where(and(eq(zoneExtractedFields.jurisdictionId, jurisdictionId), eq(zoneExtractedFields.zoneCode, zoneCode)))

    const zScore = await db.query.zoneRisScores.findFirst({
      where: and(eq(zoneRisScores.jurisdictionId, jurisdictionId), eq(zoneRisScores.zoneCode, zoneCode)),
    })

    const zFeasibility = await db.query.feasibilityOutputs.findFirst({
      where: and(eq(feasibilityOutputs.jurisdictionId, jurisdictionId), eq(feasibilityOutputs.zoneCode, zoneCode)),
    })

    if (zFields.length === 0 && !zScore) {
      // List available zones
      const allZones = await db.select().from(zoneRisScores).where(eq(zoneRisScores.jurisdictionId, jurisdictionId))
      return {
        error: `Zone "${zoneCode}" not found for ${jurisdiction.displayName}.`,
        availableZones: allZones.map((z) => ({ zoneCode: z.zoneCode, zoneName: z.zoneName, multifamilyClassification: z.multifamilyClassification })),
      }
    }

    return {
      jurisdiction: {
        name: jurisdiction.name,
        state: jurisdiction.state,
        displayName: jurisdiction.displayName,
        dataType: jurisdiction.dataType,
      },
      zone: {
        zoneCode,
        zoneName: zScore?.zoneName ?? null,
        multifamilyClassification: zScore?.multifamilyClassification ?? null,
      },
      extractedFields: zFields.map((f) => ({
        fieldName: f.fieldName,
        fieldValue: f.fieldValue,
        unit: f.unit,
        confidence: f.confidence,
        sourceSection: f.sourceSection,
        fieldValueText: f.fieldValueText,
      })),
      risScore: zScore
        ? { risComposite: zScore.risComposite, dci: zScore.dci, dcoi: zScore.dcoi, pci: zScore.pci, crp: zScore.crp }
        : null,
      feasibility: zFeasibility
        ? { maxUnitsPerAcre: zFeasibility.maxUnitsPerAcre, parkingFootprintPct: zFeasibility.parkingFootprintPct, estimatedCostPerUnit: zFeasibility.estimatedCostPerUnit, fmr2br: zFeasibility.fmr2br }
        : null,
    }
  }

  // Jurisdiction-level (default) data path
  const score = await db.query.risScores.findFirst({
    where: eq(risScores.jurisdictionId, jurisdictionId),
  })

  const fields = await db
    .select()
    .from(extractedFields)
    .where(eq(extractedFields.jurisdictionId, jurisdictionId))

  const feasibility = await db.query.feasibilityOutputs.findFirst({
    where: and(eq(feasibilityOutputs.jurisdictionId, jurisdictionId), eq(feasibilityOutputs.zoneCode, '__avg__')),
  })

  const market = await db.query.marketData.findFirst({
    where: eq(marketData.jurisdictionId, jurisdictionId),
  })

  // List available zones for context
  const availableZones = await db
    .select()
    .from(zoneRisScores)
    .where(eq(zoneRisScores.jurisdictionId, jurisdictionId))

  return {
    jurisdiction: {
      name: jurisdiction.name,
      state: jurisdiction.state,
      displayName: jurisdiction.displayName,
      dataType: jurisdiction.dataType,
    },
    extractedFields: fields.map((f) => ({
      fieldName: f.fieldName,
      fieldValue: f.fieldValue,
      unit: f.unit,
      confidence: f.confidence,
      sourceSection: f.sourceSection,
      fieldValueText: f.fieldValueText,
    })),
    risScore: score
      ? {
          risComposite: score.risComposite,
          dci: score.dci,
          dcoi: score.dcoi,
          pci: score.pci,
          crp: score.crp,
          note: availableZones.length > 0 ? 'This is the unweighted average across all scored zones.' : undefined,
        }
      : null,
    feasibility: feasibility
      ? {
          maxUnitsPerAcre: feasibility.maxUnitsPerAcre,
          parkingFootprintPct: feasibility.parkingFootprintPct,
          estimatedCostPerUnit: feasibility.estimatedCostPerUnit,
          fmr2br: feasibility.fmr2br,
        }
      : null,
    marketData: market
      ? {
          fmr2br: market.fmr2br,
          permits5plus: market.permits5plus,
          totalPermits: market.totalPermits,
        }
      : null,
    availableZones: availableZones.length > 0
      ? availableZones.map((z) => ({ zoneCode: z.zoneCode, zoneName: z.zoneName, multifamilyClassification: z.multifamilyClassification, risComposite: z.risComposite }))
      : undefined,
  }
}

export const getJurisdictionDataTool = new FunctionTool({
  name: 'get_jurisdiction_data',
  description:
    'Returns extracted zoning fields, RIS scores, feasibility outputs, and market data for the jurisdiction. When zoneCode is provided, returns data for that specific zoning district (e.g. "R-30" or "RA6-15"). When absent, returns jurisdiction-level averaged values and lists available zones.',
  parameters: z.object({
    jurisdictionId: z.string().describe('The jurisdiction UUID'),
    zoneCode: z.string().optional().describe('Optional: specific zone code (e.g. "R-30", "RA6-15"). Omit for jurisdiction-level averaged data.'),
  }),
  execute: getJurisdictionData,
})

// ── get_pdf_text ─────────────────────────────────────────────────────────────

export async function getPdfText({ jurisdictionId }: { jurisdictionId: string }) {
  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(jurisdictions.id, jurisdictionId),
  })
  if (!jurisdiction) return { error: 'Jurisdiction not found' }

  if (jurisdiction.dataType === 'synthetic') {
    return {
      unavailable: true,
      reason:
        'This is a synthetic jurisdiction with illustrative data. No source zoning ordinance document is available.',
    }
  }

  const bucket = process.env.RAW_DATA_BUCKET
  if (!bucket) {
    return {
      unavailable: true,
      reason: 'PDF storage is not configured (RAW_DATA_BUCKET not set).',
    }
  }

  const storage = new Storage()
  const cachedPath = `zoning/${jurisdiction.slug}/parsed-text.txt`

  // Check for cached parsed text first
  try {
    const [exists] = await storage.bucket(bucket).file(cachedPath).exists()
    if (exists) {
      const [contents] = await storage.bucket(bucket).file(cachedPath).download()
      return {
        text: contents.toString('utf-8'),
        sourceDocument: `gs://${bucket}/${cachedPath}`,
        cached: true,
      }
    }
  } catch {
    // Cache miss or read error — fall through to parse
  }

  // Fetch and parse the PDF — errors degrade gracefully so the agent
  // can still answer from extracted fields even if the PDF is missing.
  let bytes: Buffer
  let sourceDocument: string
  try {
    const fetcher = new GcsFetcher(bucket)
    const result = await fetcher.fetch(jurisdictionId, jurisdiction.slug)
    bytes = result.bytes
    sourceDocument = result.sourceDocument
  } catch (err) {
    return {
      unavailable: true,
      reason: `Could not fetch the zoning ordinance PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
  }

  let text: string
  try {
    const parser = new PdfParserImpl()
    text = (await parser.parse(bytes)).text
  } catch (err) {
    return {
      unavailable: true,
      reason: `Could not parse the zoning ordinance PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
    }
  }

  // Cache the parsed text for subsequent requests
  try {
    await storage.bucket(bucket).file(cachedPath).save(text, {
      contentType: 'text/plain',
    })
  } catch {
    // Non-fatal: caching failed, but we still have the text
  }

  return { text, sourceDocument }
}

export const getPdfTextTool = new FunctionTool({
  name: 'get_pdf_text',
  description:
    'Fetches and returns the full parsed text of the zoning ordinance PDF for this jurisdiction. Use this when the user asks about specific ordinance language, provisions, or sections that go beyond the extracted numeric fields. Not available for synthetic jurisdictions.',
  parameters: z.object({
    jurisdictionId: z.string().describe('The jurisdiction UUID'),
  }),
  execute: getPdfText,
})

// ── compute_feasibility ──────────────────────────────────────────────────────

export function computeFeasibilityTool(inputs: {
  densityLimitUpa: number
  parkingMinSpacesPerUnit: number
  regionalMultiplier: number
  fmr2br: number
}) {
  return computeFeasibility(inputs)
}

export const computeFeasibilityToolDef = new FunctionTool({
  name: 'compute_feasibility',
  description:
    'Computes development feasibility metrics (max units/acre, parking footprint, estimated cost per unit, rent feasibility) from regulatory parameters. Use this for what-if questions about how changing zoning rules would affect development economics.',
  parameters: z.object({
    densityLimitUpa: z.number().describe('Maximum dwelling units per acre'),
    parkingMinSpacesPerUnit: z
      .number()
      .describe('Required parking spaces per unit'),
    regionalMultiplier: z
      .number()
      .describe('Regional construction cost multiplier (BEA RPP)'),
    fmr2br: z
      .number()
      .describe('HUD Fair Market Rent for 2-bedroom unit ($/month)'),
  }),
  execute: computeFeasibilityTool,
})
