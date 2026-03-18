/**
 * E2-3: Density limit extractor
 *
 * Extracts density_limit_units_per_acre from a zoning text chunk.
 * Returns raw_value in the unit as written (units/acre, FAR, etc.);
 * normalization (E0-7) converts to units per acre.
 */

import { GeminiExtractor } from './gemini-extractor'

export class DensityLimitExtractor extends GeminiExtractor {
  readonly fieldName = 'density_limit_units_per_acre'

  protected buildPrompt(chunk: string): string {
    return `Extract the maximum residential density limit from the following zoning ordinance text.

The density limit is the maximum number of dwelling units permitted per acre of land. It may be expressed as units per acre, units per square foot, or as a floor area ratio (FAR). Return the value exactly as written — do not convert units. The pipeline will normalize to units per acre.

Return a JSON object with this exact structure:
{
  "field_name": "density_limit_units_per_acre",
  "raw_value": <number exactly as in the text, or null>,
  "raw_unit": "<unit as written, e.g. 'units/acre', 'du/acre', 'FAR', 'units per sq ft'>",
  "field_value": null,
  "field_value_text": "<verbatim quote from the ordinance>",
  "unit": "units_per_acre",
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
