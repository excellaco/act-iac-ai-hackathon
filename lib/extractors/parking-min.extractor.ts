/**
 * E2-4: Parking minimum extractor
 *
 * Extracts parking_min_spaces_per_unit from a zoning text chunk.
 * Returns raw_value in the unit as written (per unit, per bedroom, per sqft);
 * normalization (E0-7) converts to spaces per unit.
 */

import { GeminiExtractor } from './gemini-extractor'

export class ParkingMinExtractor extends GeminiExtractor {
  readonly fieldName = 'parking_min_spaces_per_unit'

  protected buildPrompt(chunk: string): string {
    return `Extract the minimum off-street parking requirement for residential multifamily development from the following zoning ordinance text.

The parking minimum is the number of parking spaces required per dwelling unit. It may be expressed per unit, per bedroom, or per square foot of floor area. Return the value exactly as written — do not convert units. The pipeline will normalize to spaces per unit.

Return a JSON object with this exact structure:
{
  "field_name": "parking_min_spaces_per_unit",
  "raw_value": <number exactly as in the text, or null>,
  "raw_unit": "<unit as written, e.g. 'spaces/unit', 'per bedroom', 'spaces per sq ft'>",
  "field_value": null,
  "field_value_text": "<verbatim quote from the ordinance>",
  "unit": "spaces_per_unit",
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
