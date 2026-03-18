/**
 * E2-2: Height limit extractor
 *
 * Extracts height_limit_ft from a zoning text chunk.
 * Returns raw_value in the unit as written (ft, stories, meters);
 * normalization (E0-7) converts to feet.
 */

import { GeminiExtractor } from './gemini-extractor'

export class HeightLimitExtractor extends GeminiExtractor {
  readonly fieldName = 'height_limit_ft'

  protected buildPrompt(chunk: string): string {
    return `Extract the maximum building height limit for residential multifamily development from the following zoning ordinance text.

The height limit may be expressed in feet, stories, or meters. Return the value exactly as written — do not convert units. The pipeline will normalize to feet.

Return a JSON object with this exact structure:
{
  "field_name": "height_limit_ft",
  "raw_value": <number exactly as in the text, or null>,
  "raw_unit": "<unit as written, e.g. 'feet', 'stories', 'ft', 'meters'>",
  "field_value": null,
  "field_value_text": "<verbatim quote from the ordinance>",
  "unit": "ft",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your extraction>"
}

Leave field_value as null — it is populated by the normalization step after extraction.

Text chunk:
${chunk}`
  }
}
