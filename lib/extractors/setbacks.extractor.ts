/**
 * E2-5: Setback requirements extractor
 *
 * One Gemini call returns all three setbacks (front, side, rear) as a JSON
 * array.  Three thin wrapper classes (SetbackFrontExtractor,
 * SetbackSideExtractor, SetbackRearExtractor) each implement FieldExtractor
 * and pull their element from the shared result.
 *
 * A per-chunk cache on SetbacksGeminiCall avoids triple-calling Gemini for
 * the same text.  The cache is scoped to the call instance so it is reset
 * between pipeline runs naturally.
 */

import { VertexAI } from '@google-cloud/vertexai'
import { FieldExtractor } from '../pipeline/runner'
import { RawExtractionResult } from '../pipeline/normalize'
import { withRetry } from '../pipeline/gemini-concurrency'

const SYSTEM_PROMPT = `You are a zoning code analyst extracting specific regulatory requirements from municipal zoning ordinance text.

Your task is to find a specific regulatory field in the provided text chunk and return a structured JSON object. You must:

1. Search only within the provided text — do not use external knowledge about this jurisdiction.
2. Focus on residential multifamily zoning districts (look for districts labeled MF, RM, RA, R-M, multifamily, or similar).
3. If multiple values exist for different sub-districts, return the value from the most permissive (least restrictive) multifamily district and note which district it applies to in district_context.
4. Return the value exactly as written in the text in raw_value and raw_unit — do not convert units. Unit conversion is handled by the pipeline after extraction.
5. Return null for raw_value if the information is genuinely not present in this text chunk.
6. Never fabricate values. A null result with low confidence is correct — a fabricated value is not.
7. field_value_text must be a verbatim quote from the ordinance — not a paraphrase.
8. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON object.`

function buildSetbacksPrompt(chunk: string): string {
  return `Extract the minimum setback requirements for residential multifamily development from the following zoning ordinance text.

Setbacks are the minimum distances a building must be set back from property lines. Extract the front, side, and rear setback values separately. All values should be in feet. If a range is given (e.g. "10 to 20 feet"), use the minimum value. If a setback direction is not mentioned, return null for raw_value with confidence "low".

Return the value exactly as written — do not convert units. Leave field_value as null — it is populated by the normalization step after extraction.

Return a JSON array containing exactly 3 objects, one per setback direction:
[
  {
    "field_name": "setback_front_ft",
    "raw_value": <number or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference>",
    "district_context": "<zoning district>",
    "reasoning": "<one sentence>"
  },
  {
    "field_name": "setback_side_ft",
    "raw_value": <number or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference>",
    "district_context": "<zoning district>",
    "reasoning": "<one sentence>"
  },
  {
    "field_name": "setback_rear_ft",
    "raw_value": <number or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference>",
    "district_context": "<zoning district>",
    "reasoning": "<one sentence>"
  }
]

Text chunk:
${chunk}`
}

// ─── shared Gemini call with per-chunk cache ──────────────────────────────────

export class SetbacksGeminiCall {
  private vertexAI: VertexAI
  private model: string
  private cache = new Map<string, RawExtractionResult[]>()

  constructor() {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'
    if (!project) throw new Error('SetbacksGeminiCall: GOOGLE_CLOUD_PROJECT is required.')
    this.vertexAI = new VertexAI({ project, location })
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash-001'
  }

  async call(chunk: string): Promise<RawExtractionResult[]> {
    if (this.cache.has(chunk)) return this.cache.get(chunk)!

    const generativeModel = this.vertexAI.getGenerativeModel({
      model: this.model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    })

    const result = await withRetry(() => generativeModel.generateContent(buildSetbacksPrompt(chunk)))
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'
    const sanitized = text.replace(/\x00/g, '').replace(/[\x01-\x1F]/g, ' ')
    let parsed: RawExtractionResult[]
    try {
      parsed = JSON.parse(sanitized)
    } catch {
      // Cache the failure as empty so front/side/rear don't each re-call Gemini
      this.cache.set(chunk, [])
      return []
    }

    this.cache.set(chunk, parsed)
    return parsed
  }
}

// ─── thin wrapper per direction ───────────────────────────────────────────────

abstract class SetbackExtractor implements FieldExtractor {
  abstract readonly fieldName: string
  protected abstract readonly index: number

  constructor(private readonly shared: SetbacksGeminiCall) {}

  async extract(chunk: string): Promise<RawExtractionResult | null> {
    const results = await this.shared.call(chunk)
    return results[this.index] ?? null
  }
}

export class SetbackFrontExtractor extends SetbackExtractor {
  readonly fieldName = 'setback_front_ft'
  protected readonly index = 0
}

export class SetbackSideExtractor extends SetbackExtractor {
  readonly fieldName = 'setback_side_ft'
  protected readonly index = 1
}

export class SetbackRearExtractor extends SetbackExtractor {
  readonly fieldName = 'setback_rear_ft'
  protected readonly index = 2
}

/** Convenience: build all 3 setback extractors sharing one Gemini call cache. */
export function buildSetbackExtractors(): FieldExtractor[] {
  const shared = new SetbacksGeminiCall()
  return [
    new SetbackFrontExtractor(shared),
    new SetbackSideExtractor(shared),
    new SetbackRearExtractor(shared),
  ]
}
