/**
 * E2-7 / E2-155: Discretionary review extractor
 *
 * Extracts discretionary_review_required from a zoning text chunk.
 * Returns one of: 'by_right', 'conditional_use_permit', 'special_use_permit'
 * in field_value_text (raw_value is null — this is a categorical field).
 * Extends MultiZoneGeminiExtractor to support per-zone extraction (E2-155).
 */

import { MultiZoneGeminiExtractor } from './multi-zone-gemini.extractor'
import { DiscoveredZone } from './zone-discovery.extractor'

export class DiscretionaryReviewExtractor extends MultiZoneGeminiExtractor {
  readonly fieldName = 'discretionary_review_required'

  protected buildPrompt(chunk: string): string {
    return `Extract the discretionary review requirement for residential multifamily housing from the following zoning ordinance text.

Determine whether multifamily residential development is:
- "by_right": permitted without discretionary approval (no hearing, no board vote required)
- "conditional_use_permit": requires administrative approval (e.g. conditional use permit, special exception, board of zoning appeals approval)
- "special_use_permit": requires quasi-judicial or legislative approval (e.g. special use permit, County Board approval, Planning Commission approval, public hearing required)

Focus on multifamily residential uses (apartments, condominiums, multi-unit dwellings). If the text does not address multifamily review requirements, return raw_value null with confidence "low".

Return a JSON object with this exact structure:
{
  "field_name": "discretionary_review_required",
  "raw_value": null,
  "raw_unit": "",
  "field_value": null,
  "field_value_text": "by_right" | "conditional_use_permit" | "special_use_permit",
  "unit": "",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your classification>"
}

field_value_text must be exactly one of: "by_right", "conditional_use_permit", "special_use_permit".
If the field is not found, set field_value_text to "" and confidence to "low".

Text chunk:
${chunk}`
  }

  protected buildMultiZonePrompt(chunk: string, zones: DiscoveredZone[]): string {
    const zoneList = zones
      .map((z) => `  - ${z.zone_code}${z.zone_name ? ` (${z.zone_name})` : ''}`)
      .join('\n')

    return `For each of the following residential zoning districts, determine the discretionary review type for multifamily development from the provided ordinance text.

Canonical zone list (use EXACTLY these zone codes in your response):
${zoneList}

Classify each zone as exactly one of:
- "by_right": permitted without discretionary approval
- "conditional_use_permit": requires administrative approval (board of zoning appeals, etc.)
- "special_use_permit": requires quasi-judicial or legislative approval (planning commission, public hearing, etc.)

Return a JSON array — one object per zone:
[
  {
    "zone_code": "<exact code from the list above>",
    "field_name": "discretionary_review_required",
    "raw_value": null,
    "raw_unit": "",
    "field_value": null,
    "field_value_text": "by_right" | "conditional_use_permit" | "special_use_permit",
    "unit": "",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section reference or empty>",
    "district_context": "<zone code>",
    "reasoning": "<one sentence>"
  }
]

Text chunk:
${chunk}`
  }
}
