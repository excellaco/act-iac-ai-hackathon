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

export type MultifamilyClassification = 'primary' | 'permitted' | 'limited' | 'none'

export interface DiscoveredZone {
  zone_code: string
  zone_name: string | null
  multifamily_classification: MultifamilyClassification
}

const SYSTEM_PROMPT = `You are a zoning code analyst identifying zoning districts from a municipal zoning ordinance.

Your task is to enumerate every residential zoning district that appears in the provided text and classify each by its multifamily permission level. You must:

1. Search only within the provided text — do not use external knowledge.
2. Identify all distinct residential zoning districts by their official code (e.g. "R-30", "RA6-15", "SCN-24").
3. Classify each zone exactly as one of:
   - "primary"   — multifamily is the primary by-right use
   - "permitted" — multifamily is a permitted by-right use alongside other types
   - "limited"   — multifamily is capped, conditional, or ADU-only
   - "none"      — no multifamily use permitted
4. Return the zone_code exactly as it appears in the text (do not normalize or abbreviate).
5. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON.`

function buildDiscoveryPrompt(chunk: string): string {
  return `Enumerate all residential zoning districts that appear in the following zoning ordinance text. For each district, return its code, full name (if available), and multifamily classification.

Return a JSON array:
[
  {
    "zone_code": "<exact code as written, e.g. 'R-30' or 'RA6-15'>",
    "zone_name": "<full district name or null if not stated>",
    "multifamily_classification": "primary" | "permitted" | "limited" | "none"
  }
]

If no residential districts appear in this chunk, return an empty array [].

Text chunk:
${chunk}`
}

/** Normalize zone codes to a consistent key for deduplication. */
function normalizeCode(code: string): string {
  return code.toLowerCase().replace(/[\s\-_]+/g, '-').trim()
}

/**
 * Run zone discovery across all text chunks and return a deduplicated list
 * of canonical residential zones with their multifamily classification.
 *
 * Each chunk is queried independently; results are merged by normalized zone
 * code, with higher-permission classifications winning on conflict (primary >
 * permitted > limited > none) since a later chunk may provide more context.
 */
const EARLY_EXIT_THRESHOLD = 10

export async function discoverZones(chunks: string[], limiter?: GeminiLimiter): Promise<DiscoveredZone[]> {
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

  // canonical key → best result seen so far
  const byCode = new Map<string, DiscoveredZone>()

  let consecutiveEmpty = 0

  for (const chunk of chunks) {
    let results: DiscoveredZone[]
    try {
      const callGemini = async () => {
        const resp = await generativeModel.generateContent(buildDiscoveryPrompt(chunk))
        return resp.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
      }
      const text = await (limiter ? limiter(() => withRetry(callGemini)) : withRetry(callGemini))
      // Strip null bytes
      const sanitized = text.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
      results = JSON.parse(sanitized)
      if (!Array.isArray(results)) {
        consecutiveEmpty++
        if (consecutiveEmpty >= EARLY_EXIT_THRESHOLD) break
        continue
      }
    } catch {
      consecutiveEmpty++
      if (consecutiveEmpty >= EARLY_EXIT_THRESHOLD) break
      continue
    }

    const sizeBeforeChunk = byCode.size

    for (const r of results) {
      if (!r.zone_code || !r.multifamily_classification) continue
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

    if (byCode.size === sizeBeforeChunk) {
      consecutiveEmpty++
      if (consecutiveEmpty >= EARLY_EXIT_THRESHOLD) break
    } else {
      consecutiveEmpty = 0
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
