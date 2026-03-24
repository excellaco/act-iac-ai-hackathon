/**
 * E2-155: Zone discovery pre-pass
 *
 * Runs a single Gemini call across all text chunks to enumerate every
 * residential zoning district in the ordinance and classify each zone by its
 * multifamily permission level. The resulting canonical zone list is passed to
 * per-field multi-zone extractors so zone codes are consistent across all fields.
 *
 * This is a one-time call per jurisdiction run, not a FieldExtractor.
 */

import { VertexAI } from '@google-cloud/vertexai'
import { GeminiLimiter, withRetry } from '../pipeline/gemini-concurrency'
import { PipelineLogger, consoleLogger } from '../pipeline/logger'

export type MultifamilyClassification = 'primary' | 'permitted' | 'limited' | 'none'

export interface DiscoveredZone {
  zone_code: string
  zone_name: string | null
  multifamily_classification: MultifamilyClassification
}

const SYSTEM_PROMPT = `You are a zoning code analyst identifying BASE residential zoning districts from a municipal zoning ordinance.

A BASE residential zoning district is a standalone district (not an overlay) whose primary regulatory purpose is to govern where and how people live — single-family homes, townhomes, multifamily apartments, etc.

INCLUDE only districts that meet ALL of these criteria:
- Standalone base district (not an overlay applied on top of another district)
- Residential use is the primary purpose of the district
- The district regulates housing density, setbacks, height, and similar development standards
- The zone_code is a named district identifier from the zoning map or district list (e.g. R-1, RM-2, RA, RMF, R-A)

DO NOT include any of the following — even if they appear in the same section as residential zones:
- Overlay districts (e.g. "Transit Overlay", "Historic Overlay", "Entrance Corridor", "Airport Impact")
- Planned Development districts (PD-*, PDH, PD-OP, PD-TC, etc.) unless the text explicitly states they function as standalone residential base districts
- Commercial or retail districts (C-*, B-*, CR-*)
- Industrial or employment districts (I-*, M-*, E-*)
- Agricultural or rural districts (A-*, AR-*) unless the text explicitly permits multifamily housing as a primary use
- Mixed-use districts where commercial or office is the primary use
- Special purpose, transition, or buffer districts
- Any district whose name or description is primarily non-residential

CRITICAL — avoid these common hallucination traps:
- DO NOT enumerate sequential numeric variants of a base code. If a table shows "RM-1" and "RM-2" as density designators or footnote references, do NOT generate RM-3, RM-4, RM-5, etc. Only include codes that are explicitly named as standalone districts.
- DO NOT treat density values, FAR numbers, lot size minimums, or footnote numbers as zone codes.
- DO NOT include codes that look like garbled text, binary artifacts, or nonsense characters.
- A typical jurisdiction has between 3 and 25 base residential zoning districts. If you find more than 30, you are almost certainly including density table rows, footnote references, or numeric variants — stop and reconsider.

When uncertain whether a district is a base residential district, DO NOT include it. A false negative (missing a zone) is far less harmful than a false positive (including hundreds of non-residential zones).

Classify each included district exactly as one of:
- "primary"   — multifamily is the primary by-right use
- "permitted" — multifamily is a permitted by-right use alongside other uses
- "limited"   — multifamily is capped, conditional, or ADU-only
- "none"      — no multifamily use permitted

Return the zone_code exactly as it appears in the text. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON.`

function buildDiscoveryPrompt(chunk: string): string {
  return `Identify BASE residential zoning districts from the following zoning ordinance text.

INCLUDE only standalone residential base districts (e.g. R-1, R-2, RM-2, RA, RMF) whose primary purpose is housing and that appear as named districts in a district list, table of contents, or district description section.

DO NOT include:
- Overlay districts, planned development districts, commercial zones, industrial zones, agricultural zones
- Mixed-use zones where commercial is primary, or any district where residential is a secondary or conditional use
- Density values, FAR numbers, lot size minimums, or footnote numbers masquerading as zone codes
- Sequential numeric variants you are inferring — only include codes explicitly stated as district names

If this chunk is a use table, density table, footnote list, or index rather than a district description or district list, return [].

Return at most 10 distinct zone codes from this chunk. If you think you see more than 10, re-read carefully — you are likely confusing table rows or numeric parameters with zone codes.

Return a JSON array (or [] if no base residential districts appear in this chunk):
[
  {
    "zone_code": "<exact code as written in the text>",
    "zone_name": "<full district name or null if not stated>",
    "multifamily_classification": "primary" | "permitted" | "limited" | "none"
  }
]

Text chunk:
${chunk}`
}

/** Normalize zone codes to a consistent key for deduplication. */
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[\s\-_]+/g, '-').trim()
}

/**
 * Returns true if the zone code looks like a legitimate district identifier.
 * Rejects garbled PDF artifacts (non-ASCII, control characters, pure symbols)
 * and suspiciously large sequential numeric suffixes that indicate density
 * table rows rather than real zone codes (e.g. RM-250, RA-1000).
 */
function isPlausibleZoneCode(code: string): boolean {
  // Must contain at least one ASCII letter
  if (!/[A-Za-z]/.test(code)) return false
  // Must be printable ASCII only
  if (/[^\x20-\x7E]/.test(code)) return false
  // Must not be mostly symbols/punctuation (allow hyphens and dots as separators)
  const letters = (code.match(/[A-Za-z0-9]/g) ?? []).length
  if (letters < 2) return false
  // Reject codes where the numeric suffix is unrealistically large (> 30),
  // which indicates a density value rather than a district designator.
  // Real zone codes like R-1, RM-4, RA-20 are fine; RM-250 or RA-1000 are not.
  const numericSuffix = code.match(/(\d+)$/)
  if (numericSuffix && parseInt(numericSuffix[1], 10) > 30) return false
  return true
}

/**
 * Run zone discovery across all text chunks and return a deduplicated list
 * of canonical residential zones with their multifamily classification.
 *
 * Chunks are queried in parallel (bounded by the optional limiter) then merged
 * by normalized zone code, with higher-permission classifications winning on
 * conflict (primary > permitted > limited > none).
 */
export async function discoverZones(
  chunks: string[],
  limiter?: GeminiLimiter,
  logger: PipelineLogger = consoleLogger,
): Promise<DiscoveredZone[]> {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
  const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

  if (!project) {
    throw new Error('discoverZones: GOOGLE_CLOUD_PROJECT environment variable is required.')
  }

  const vertexAI = new VertexAI({ project, location })
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'

  const generativeModel = vertexAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { responseMimeType: 'application/json', temperature: 0 },
  })

  const classificationRank: Record<MultifamilyClassification, number> = {
    primary: 4, permitted: 3, limited: 2, none: 1,
  }

  const total = chunks.length

  // Run all chunk calls in parallel, bounded by the limiter
  const chunkResults = await Promise.all(
    chunks.map((chunk, i) => {
      const callGemini = async () => {
        const resp = await generativeModel.generateContent(buildDiscoveryPrompt(chunk))
        return resp.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
      }
      const task = () => withRetry(callGemini, undefined, logger)
      return (limiter ? limiter(task) : task())
        .then((text) => {
          const sanitized = text.replace(/\x00/g, '').replace(/[\x01-\x1F]/g, ' ')
          const parsed = JSON.parse(sanitized)
          const zones: DiscoveredZone[] = Array.isArray(parsed) ? parsed : []
          logger.debug?.(`zone discovery: chunk ${i + 1}/${total} (${zones.length} zones)`)
          return zones
        })
        .catch((err) => {
          logger.warn('zone discovery chunk failed', {
            chunkIndex: i + 1,
            chunkTotal: total,
            error: err instanceof Error ? err.message : String(err),
          })
          return [] as DiscoveredZone[]
        })
    }),
  )

  // Merge results — higher-permission classification wins on conflict
  const byCode = new Map<string, DiscoveredZone>()
  for (const results of chunkResults) {
    for (const r of results) {
      if (!r.zone_code || !r.multifamily_classification) continue
      if (!isPlausibleZoneCode(r.zone_code)) {
        logger.debug?.(`zone discovery: skipping implausible code "${r.zone_code}"`)
        continue
      }
      const key = normalizeCode(r.zone_code)
      const existing = byCode.get(key)
      if (
        !existing ||
        classificationRank[r.multifamily_classification as MultifamilyClassification] >
          classificationRank[existing.multifamily_classification]
      ) {
        byCode.set(key, {
          zone_code: r.zone_code,
          zone_name: r.zone_name ?? null,
          multifamily_classification: r.multifamily_classification,
        })
      }
    }
  }

  return Array.from(byCode.values())
}

/**
 * Normalize a zone code from an extractor response to match one of the canonical
 * zone codes returned by discoverZones. Falls back to the raw code if no match.
 */
export function matchZoneCode(rawCode: string, canonicalZones: DiscoveredZone[]): string {
  const normalized = normalizeCode(rawCode)
  const match = canonicalZones.find((z) => normalizeCode(z.zone_code) === normalized)
  return match ? match.zone_code : rawCode
}
