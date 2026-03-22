/**
 * E2-155: Multi-zone setbacks extractor
 *
 * Extends the existing SetbackExtractor approach to support per-zone extraction.
 * A single Gemini call per chunk returns front, side, and rear setbacks for ALL
 * canonical zones simultaneously. Thin wrapper classes pull their field index.
 *
 * The canonical zone list must be injected via setCanonicalZones() before
 * extractAllZones() is called (done by the pipeline runner).
 */

import { VertexAI } from '@google-cloud/vertexai'
import { FieldExtractor } from '../pipeline/runner'
import { ZoneRawResult } from '../pipeline/runner'
import { RawExtractionResult } from '../pipeline/normalize'
import { DiscoveredZone, matchZoneCode } from './zone-discovery.extractor'
import { SetbacksGeminiCall } from './setbacks.extractor'

function buildMultiZoneSetbacksPrompt(chunk: string, zones: DiscoveredZone[]): string {
  const zoneList = zones
    .map((z) => `  - ${z.zone_code}${z.zone_name ? ` (${z.zone_name})` : ''}`)
    .join('\n')

  return `Extract front, side, and rear setback requirements for each of the following residential zoning districts from the provided ordinance text.

Canonical zone list (use EXACTLY these zone codes in your response):
${zoneList}

For each zone, extract the three setback directions. All values in feet. If a value is not in this chunk, return null with confidence "low".

Return a JSON array — one object per (zone, setback_direction) combination (${zones.length * 3} total objects):
[
  {
    "zone_code": "<exact code from list>",
    "field_name": "setback_front_ft",
    "raw_value": <number or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference>",
    "district_context": "<zone code>",
    "reasoning": "<one sentence>"
  },
  {
    "zone_code": "<same zone code>",
    "field_name": "setback_side_ft",
    ...
  },
  {
    "zone_code": "<same zone code>",
    "field_name": "setback_rear_ft",
    ...
  }
]

Leave field_value as null — it is populated by the normalization step.

Text chunk:
${chunk}`
}

// ── Shared multi-zone setbacks Gemini call with per-chunk cache ───────────────

export class MultiZoneSetbacksCall {
  private vertexAI: VertexAI
  private model: string
  private cache = new Map<string, ZoneRawResult[]>()
  private _canonicalZones: DiscoveredZone[] = []

  constructor() {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'
    if (!project) throw new Error('MultiZoneSetbacksCall: GOOGLE_CLOUD_PROJECT is required.')
    this.vertexAI = new VertexAI({ project, location })
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  }

  setCanonicalZones(zones: DiscoveredZone[]): void {
    this._canonicalZones = zones
    this.cache.clear()
  }

  getCanonicalZones(): DiscoveredZone[] {
    return this._canonicalZones
  }

  async call(chunk: string): Promise<ZoneRawResult[]> {
    if (this.cache.has(chunk)) return this.cache.get(chunk)!
    if (this._canonicalZones.length === 0) return []

    const generativeModel = this.vertexAI.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    })

    const result = await generativeModel.generateContent(
      buildMultiZoneSetbacksPrompt(chunk, this._canonicalZones),
    )
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const sanitized = text.replace(/\x00/g, '').replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    let parsed: ZoneRawResult[] = []
    try { parsed = JSON.parse(sanitized) } catch { /* malformed — return empty */ }

    // Normalize zone codes
    parsed = parsed.map((r) => ({
      ...r,
      zone_code: matchZoneCode(r.zone_code, this._canonicalZones),
      zone_name: this._canonicalZones.find((z) => z.zone_code === matchZoneCode(r.zone_code, this._canonicalZones))?.zone_name ?? r.zone_name ?? null,
      multifamily_classification: this._canonicalZones.find((z) => z.zone_code === matchZoneCode(r.zone_code, this._canonicalZones))?.multifamily_classification ?? r.multifamily_classification ?? 'none',
    }))

    this.cache.set(chunk, parsed)
    return parsed
  }
}

// ── Thin wrapper per setback direction ────────────────────────────────────────

abstract class MultiZoneSetbackExtractor implements FieldExtractor {
  abstract readonly fieldName: string
  protected abstract readonly fieldNameFilter: string

  constructor(
    private readonly shared: MultiZoneSetbacksCall,
    private readonly singleZoneShared: SetbacksGeminiCall,
  ) {}

  // Single-zone extraction reuses the existing SetbacksGeminiCall
  async extract(chunk: string): Promise<RawExtractionResult | null> {
    const results = await this.singleZoneShared.call(chunk)
    const index = this.fieldName === 'setback_front_ft' ? 0
                : this.fieldName === 'setback_side_ft'  ? 1
                : 2
    return results[index] ?? null
  }

  async extractAllZones(chunks: string[]): Promise<ZoneRawResult[]> {
    const bestByZone = new Map<string, ZoneRawResult>()

    for (const chunk of chunks) {
      const results = await this.shared.call(chunk)
      for (const r of results) {
        if (r.field_name !== this.fieldNameFilter) continue
        const existing = bestByZone.get(r.zone_code)
        const hasValue = r.raw_value !== null
        const existingHasValue = existing && existing.raw_value !== null
        const rank = (c: 'high' | 'medium' | 'low') => c === 'high' ? 2 : c === 'medium' ? 1 : 0
        if (!existing || (!existingHasValue && hasValue) || (existingHasValue === hasValue && rank(r.confidence) > rank(existing.confidence))) {
          bestByZone.set(r.zone_code, r)
        }
      }
    }

    return Array.from(bestByZone.values())
  }
}

export class MultiZoneSetbackFrontExtractor extends MultiZoneSetbackExtractor {
  readonly fieldName = 'setback_front_ft'
  protected readonly fieldNameFilter = 'setback_front_ft'
}

export class MultiZoneSetbackSideExtractor extends MultiZoneSetbackExtractor {
  readonly fieldName = 'setback_side_ft'
  protected readonly fieldNameFilter = 'setback_side_ft'
}

export class MultiZoneSetbackRearExtractor extends MultiZoneSetbackExtractor {
  readonly fieldName = 'setback_rear_ft'
  protected readonly fieldNameFilter = 'setback_rear_ft'
}

/** Build all 3 multi-zone setback extractors sharing one multi-zone Gemini call cache. */
export function buildMultiZoneSetbackExtractors(): FieldExtractor[] {
  const multiZoneShared = new MultiZoneSetbacksCall()
  const singleZoneShared = new SetbacksGeminiCall()
  return [
    new MultiZoneSetbackFrontExtractor(multiZoneShared, singleZoneShared),
    new MultiZoneSetbackSideExtractor(multiZoneShared, singleZoneShared),
    new MultiZoneSetbackRearExtractor(multiZoneShared, singleZoneShared),
  ]
}
