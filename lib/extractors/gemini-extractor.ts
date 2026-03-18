/**
 * E2: Base Gemini extractor
 *
 * Implements the FieldExtractor interface (E0-1) using Gemini via Vertex AI.
 * Subclasses provide the field-specific user prompt; this class handles the
 * API call, JSON parsing, and error recovery.
 *
 * The system prompt is shared across all extraction agents per
 * docs/LLM_PROMPT_TEMPLATES.md.
 */

import { VertexAI } from '@google-cloud/vertexai'
import { FieldExtractor } from '../pipeline/runner'
import { RawExtractionResult } from '../pipeline/normalize'

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

export abstract class GeminiExtractor implements FieldExtractor {
  abstract readonly fieldName: string
  protected abstract buildPrompt(chunk: string): string

  private vertexAI: VertexAI
  private model: string

  constructor() {
    const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT
    const location = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

    if (!project) {
      throw new Error(
        'GeminiExtractor: GOOGLE_CLOUD_PROJECT environment variable is required.',
      )
    }

    this.vertexAI = new VertexAI({ project, location })
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  }

  async extract(chunk: string): Promise<RawExtractionResult | null> {
    const generativeModel = this.vertexAI.getGenerativeModel({
      model: this.model,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    })

    const result = await generativeModel.generateContent(this.buildPrompt(chunk))
    const text = result.response.candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) return null

    return this.parseResponse(text)
  }

  protected parseResponse(text: string): RawExtractionResult | null {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed as RawExtractionResult
  }
}
