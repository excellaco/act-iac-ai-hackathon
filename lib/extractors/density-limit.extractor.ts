/**
 * E2-3 / E2-155: Density limit extractor
 *
 * Extracts density_limit_units_per_acre from a zoning text chunk.
 * Returns raw_value in the unit as written (units/acre, FAR, etc.);
 * normalization (E0-7) converts to units per acre.
 * Extends MultiZoneGeminiExtractor to support per-zone extraction (E2-155).
 */

import { MultiZoneGeminiExtractor } from './multi-zone-gemini.extractor'
import { DiscoveredZone } from './zone-discovery.extractor'

export class DensityLimitExtractor extends MultiZoneGeminiExtractor {
  readonly fieldName = 'density_limit_units_per_acre'

  protected buildPrompt(chunk: string): string {
    return `Extract the maximum residential density limit from the following zoning ordinance text.

The density limit is the maximum number of dwelling units permitted per acre of land. It may be expressed in several ways:
- Units per acre (e.g. "26 units per acre", "14 du/acre")
- Floor area ratio / FAR (e.g. "FAR of 2.5")
- Units per square foot
- Minimum lot area per dwelling unit in square feet (e.g. "Lot area per dwelling unit: 1,680 sq. ft." or "minimum lot area per dwelling unit 1,677 sq. ft.") — this is the INVERSE: divide 43,560 by this number to get units/acre. Return the sq ft value as raw_value and use "sq ft per dwelling unit" as raw_unit.

Focus on multifamily residential districts (RA, MF, R-M, RM, or similar). If the text shows a range (e.g. district named RA14-26), use the higher (more permissive) number. Return the value exactly as written — do not convert units. The pipeline will normalize to units per acre.

Return a JSON object with this exact structure:
{
  "field_name": "density_limit_units_per_acre",
  "raw_value": <number exactly as in the text, or null>,
  "raw_unit": "<unit as written, e.g. 'units/acre', 'du/acre', 'FAR', 'sq ft per dwelling unit'>",
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

  protected buildMultiZonePrompt(chunk: string, zones: DiscoveredZone[]): string {
    return this.buildMultiZonePromptDefault(
      chunk,
      zones,
      'The density limit is the maximum dwelling units per acre. It may be expressed as units/acre, FAR, or sq ft per dwelling unit.',
      'units/acre',
      'units_per_acre',
    )
  }
}
