/**
 * E2-155: Multi-zone Gemini extractor base class
 *
 * Extends GeminiExtractor with extractAllZones() — a method that takes the
 * canonical zone list from the zone-discovery pre-pass and extracts a field
 * value for EACH zone across all text chunks.
 *
 * Subclasses override buildMultiZonePrompt() to produce the zone-aware
 * extraction prompt for their specific field. The base class handles:
 *   - LLM call + JSON parsing
 *   - Zone code matching against canonical list
 *   - Deduplication (highest-confidence result per zone wins)
 */

import { VertexAI } from '@google-cloud/vertexai'
import { GeminiExtractor } from './gemini-extractor'
import { ZoneRawResult } from '../pipeline/runner'
import { DiscoveredZone, matchZoneCode } from './zone-discovery.extractor'
import { RawExtractionResult } from '../pipeline/normalize'
import { GeminiLimiter, withRetry } from '../pipeline/gemini-concurrency'

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0
}

export abstract class MultiZoneGeminiExtractor extends GeminiExtractor {
  /**
   * Build the prompt that asks the LLM to extract this field for all zones
   * in the provided canonical zone list.
   */
  protected abstract buildMultiZonePrompt(chunk: string, zones: DiscoveredZone[]): string

  async extractAllZones(chunks: string[]): Promise<ZoneRawResult[]> {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

    if (!project) {
      throw new Error('MultiZoneGeminiExtractor: GOOGLE_CLOUD_PROJECT is required.')
    }

    // Retrieve canonical zones injected before the pipeline run
    const canonicalZones = this.getCanonicalZones()
    if (canonicalZones.length === 0) return []

    const vertexAI = new VertexAI({ project, location })
    const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
    const generativeModel = vertexAI.getGenerativeModel({
      model,
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    })

    // Best result per zone code (highest confidence with actual value wins)
    const byZone = new Map<string, ZoneRawResult>()

    for (const chunk of chunks) {
      let results: ZoneRawResult[]
      try {
        const callGemini = async () => {
          const resp = await generativeModel.generateContent(
            this.buildMultiZonePrompt(chunk, canonicalZones),
          )
          return resp.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
        }
        const text = await (this._limiter
          ? this._limiter(() => withRetry(callGemini))
          : withRetry(callGemini))
        const sanitized = text.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
        results = JSON.parse(sanitized)
        if (!Array.isArray(results)) continue
      } catch {
        continue
      }

      for (const r of results) {
        if (!r.zone_code) continue

        // Normalize zone code against canonical list
        const canonicalCode = matchZoneCode(r.zone_code, canonicalZones)
        const zone = canonicalZones.find((z) => z.zone_code === canonicalCode)

        const result: ZoneRawResult = {
          ...r,
          field_name: this.fieldName,
          zone_code: canonicalCode,
          zone_name: zone?.zone_name ?? r.zone_name ?? null,
          multifamily_classification: zone?.multifamily_classification ?? r.multifamily_classification ?? 'none',
        }

        const existing = byZone.get(canonicalCode)
        const resultHasValue = result.raw_value !== null || result.field_value_text?.trim()
        const existingHasValue = existing && (existing.raw_value !== null || existing.field_value_text?.trim())

        if (
          !existing ||
          (!existingHasValue && resultHasValue) ||
          (existingHasValue === resultHasValue &&
            confidenceRank(result.confidence) > confidenceRank(existing.confidence))
        ) {
          byZone.set(canonicalCode, result)
        }
      }
    }

    return Array.from(byZone.values())
  }

  // ── Canonical zone injection ──────────────────────────────────────────────

  private _canonicalZones: DiscoveredZone[] = []

  /** Called by the pipeline runner before extractAllZones() to inject the zone list. */
  setCanonicalZones(zones: DiscoveredZone[]): void {
    this._canonicalZones = zones
  }

  getCanonicalZones(): DiscoveredZone[] {
    return this._canonicalZones
  }

  // ── Concurrency limiter injection ─────────────────────────────────────────

  private _limiter?: GeminiLimiter

  /** Called by the pipeline runner before extractAllZones() to inject the shared limiter. */
  setLimiter(limiter: GeminiLimiter): void {
    this._limiter = limiter
  }

  // ── Default multi-zone prompt for simple single-value fields ──────────────

  /**
   * Default implementation: produces a zone-list-aware prompt for any single-value
   * numeric field. Subclasses that extract differently (e.g. setbacks returning 3
   * values) must override this method.
   */
  protected buildMultiZonePromptDefault(
    chunk: string,
    zones: DiscoveredZone[],
    fieldDescription: string,
    rawUnit: string,
    unit: string,
  ): string {
    const zoneList = zones
      .map((z) => `  - ${z.zone_code}${z.zone_name ? ` (${z.zone_name})` : ''}`)
      .join('\n')

    return `Extract "${this.fieldName}" for each of the following residential zoning districts from the provided ordinance text. ${fieldDescription}

Canonical zone list (use EXACTLY these zone codes in your response):
${zoneList}

For each zone, return the value as it appears in the text. If a zone is not mentioned in this chunk, return null for raw_value with confidence "low".

Return a JSON array — one object per zone in the list above:
[
  {
    "zone_code": "<exact code from the list above>",
    "field_name": "${this.fieldName}",
    "raw_value": <number or null>,
    "raw_unit": "${rawUnit}",
    "field_value": null,
    "field_value_text": "<verbatim quote or empty string>",
    "unit": "${unit}",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference or empty string>",
    "district_context": "<zone code>",
    "reasoning": "<one sentence>"
  }
]

Leave field_value as null — it is populated by the normalization step.

Text chunk:
${chunk}`
  }
}

/**
 * Helper to check whether an extractor supports multi-zone extraction
 * and has been initialized with a canonical zone list.
 */
export function isMultiZoneExtractor(e: unknown): e is MultiZoneGeminiExtractor {
  return e instanceof MultiZoneGeminiExtractor
}

/**
 * Inject the canonical zone list into all extractors that support multi-zone extraction.
 */
export function injectCanonicalZones(
  extractors: { extractAllZones?: unknown }[],
  zones: DiscoveredZone[],
): void {
  for (const extractor of extractors) {
    if (isMultiZoneExtractor(extractor)) {
      extractor.setCanonicalZones(zones)
    }
  }
}

/**
 * Inject the shared concurrency limiter into all multi-zone extractors.
 */
export function injectLimiter(
  extractors: { extractAllZones?: unknown }[],
  limiter: GeminiLimiter,
): void {
  for (const extractor of extractors) {
    if (isMultiZoneExtractor(extractor)) {
      extractor.setLimiter(limiter)
    }
  }
}

/**
 * Merge ZoneRawResult arrays from multiple extractors.
 * Groups by zone_code — returns flat array of all (zone_code, field_name) pairs.
 */
export function mergeZoneResults(results: ZoneRawResult[][]): ZoneRawResult[] {
  return results.flat()
}

// ── Re-export for convenience ─────────────────────────────────────────────────
export type { RawExtractionResult }
