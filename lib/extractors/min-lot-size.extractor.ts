/**
 * E2-1 / E2-155: Minimum lot size extractor
 *
 * Extracts min_lot_size_sqft from a zoning text chunk.
 * Returns raw_value in the unit as written; normalization (E0-7) converts to sqft.
 * Extends MultiZoneGeminiExtractor to support per-zone extraction (E2-155).
 */

import { MultiZoneGeminiExtractor } from './multi-zone-gemini.extractor'
import { DiscoveredZone } from './zone-discovery.extractor'

export class MinLotSizeExtractor extends MultiZoneGeminiExtractor {
  readonly fieldName = 'min_lot_size_sqft'

  protected buildPrompt(chunk: string): string {
    return `Extract the minimum lot size requirement for residential multifamily development from the following zoning ordinance text.

The minimum lot size is the smallest area of land required for a residential lot or development parcel. Return the value exactly as written — do not convert units. The pipeline will normalize to square feet.

Return a JSON object with this exact structure:
{
  "field_name": "min_lot_size_sqft",
  "raw_value": <number exactly as in the text, or null>,
  "raw_unit": "<unit as written, e.g. 'sq ft', 'acres', 'square feet'>",
  "field_value": null,
  "field_value_text": "<verbatim quote from the ordinance>",
  "unit": "sqft",
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
      'The minimum lot size is the smallest land area required per lot or parcel. It may be in sq ft or acres.',
      'sq ft',
      'sqft',
    )
  }
}
