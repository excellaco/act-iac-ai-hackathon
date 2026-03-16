# Parcela — LLM Extraction Prompt Templates

This document defines the prompt templates used by the ADK `LlmAgent` instances in the extraction pipeline (Epic E2). Each agent extracts one regulatory field from a zoning ordinance text chunk and returns a structured JSON response including a confidence tier.

All prompts follow the same structure and output schema. The five field extractions run in parallel via ADK `ParallelAgent` (see ADR-0002).

---

## Output Schema

Every extraction agent returns a JSON object (or array — see E2-5) conforming to this schema. The pipeline validates this output before writing to the database (E0-4).

```typescript
interface ExtractionResult {
  field_name: string;          // snake_case field identifier
  field_value: number | null;  // extracted numeric value; null if not found
  field_value_text: string;    // raw text excerpt supporting the extraction
  unit: string;                // unit of measurement
  confidence: 'high' | 'medium' | 'low';
  source_section: string;      // section/article reference if identifiable
  district_context: string;    // zoning district the value applies to
  reasoning: string;           // brief explanation of how value was extracted
}
```

**E2-1 through E2-4** return a single `ExtractionResult`.

**E2-5 (setbacks)** returns `ExtractionResult[]` — an array of exactly 3 objects, one per setback direction (`setback_front_ft`, `setback_side_ft`, `setback_rear_ft`). The LLM makes a single call since setbacks are co-located in the zoning text, but the output is structured identically to all other extractions so the pipeline can write all three rows through the same code path without special-casing. See the E0 flattening note below.

**Confidence tier assignment rules:**

| Tier | Criteria |
|------|----------|
| `high` | Value extracted verbatim from explicit regulatory text with a clear numeric figure and unit |
| `medium` | Value inferred from context, examples, or a range (e.g. "between 10 and 20 feet") — midpoint used |
| `low` | No relevant text found, or text is ambiguous and extraction is a best guess |

---

## System Prompt (shared across all extraction agents)

```
You are a zoning code analyst extracting specific regulatory requirements from municipal zoning ordinance text.

Your task is to find a specific regulatory field in the provided text chunk and return a structured JSON object. You must:

1. Search only within the provided text — do not use external knowledge about this jurisdiction.
2. Focus on residential multifamily zoning districts (look for districts labeled MF, RM, RA, R-M, multifamily, or similar).
3. If multiple values exist for different sub-districts, return the most permissive (least restrictive) value and note the district context.
4. Return null for field_value if the information is genuinely not present in this text chunk.
5. Never fabricate values. A null result with low confidence is correct — a fabricated value is not.
6. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON object.
```

---

## E2-1 — Minimum Lot Size

**Field:** `min_lot_size_sqft`
**Unit:** `sqft`

```
Extract the minimum lot size requirement for residential multifamily development from the following zoning ordinance text.

The minimum lot size is the smallest area of land required for a residential lot or development parcel. It may be expressed in square feet, acres, or square meters. Convert all values to square feet (1 acre = 43,560 sqft).

Return a JSON object with this exact structure:
{
  "field_name": "min_lot_size_sqft",
  "field_value": <number in sqft or null>,
  "field_value_text": "<exact quote from text>",
  "unit": "sqft",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your extraction>"
}

Text chunk:
{text_chunk}
```

---

## E2-2 — Height Limit

**Field:** `height_limit_ft`
**Unit:** `ft`

```
Extract the maximum building height limit for residential multifamily development from the following zoning ordinance text.

The height limit may be expressed in feet, stories, or meters. Convert stories to feet using 10ft per story. Convert meters to feet (1 meter = 3.281 ft). If both feet and stories are given, use the feet value.

Return a JSON object with this exact structure:
{
  "field_name": "height_limit_ft",
  "field_value": <number in feet or null>,
  "field_value_text": "<exact quote from text>",
  "unit": "ft",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your extraction>"
}

Text chunk:
{text_chunk}
```

---

## E2-3 — Density Limit

**Field:** `density_limit_units_per_acre`
**Unit:** `units_per_acre`

```
Extract the maximum residential density limit from the following zoning ordinance text.

The density limit is the maximum number of dwelling units permitted per acre of land. It may be expressed as units per acre, units per square foot, or as a floor area ratio (FAR). Convert FAR to units per acre using: units_per_acre = (FAR × 43560) / avg_unit_size, where avg_unit_size = 900 sqft. If expressed per square foot, multiply by 43,560 to get per acre.

Return a JSON object with this exact structure:
{
  "field_name": "density_limit_units_per_acre",
  "field_value": <number in units/acre or null>,
  "field_value_text": "<exact quote from text>",
  "unit": "units_per_acre",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your extraction>"
}

Text chunk:
{text_chunk}
```

---

## E2-4 — Parking Minimum

**Field:** `parking_min_spaces_per_unit`
**Unit:** `spaces_per_unit`

```
Extract the minimum off-street parking requirement for residential multifamily development from the following zoning ordinance text.

The parking minimum is the number of parking spaces required per dwelling unit. It may be expressed per unit, per bedroom, or per square foot of floor area. If expressed per bedroom, multiply by 2 (assuming avg 2 bedrooms/unit). If expressed per square foot, multiply by 900 (assuming avg unit size).

Return a JSON object with this exact structure:
{
  "field_name": "parking_min_spaces_per_unit",
  "field_value": <number in spaces/unit or null>,
  "field_value_text": "<exact quote from text>",
  "unit": "spaces_per_unit",
  "confidence": "high" | "medium" | "low",
  "source_section": "<section or article reference>",
  "district_context": "<zoning district this applies to>",
  "reasoning": "<one sentence explaining your extraction>"
}

Text chunk:
{text_chunk}
```

---

## E2-5 — Setback Requirements

**Fields:** `setback_front_ft`, `setback_side_ft`, `setback_rear_ft`
**Unit:** `ft`

Note: this agent returns an **array of 3 `ExtractionResult` objects** — one per setback direction — in a single LLM call. Setbacks are co-located in zoning text so one call is efficient, and the array format keeps the pipeline write path identical to all other extractors (iterate and insert, no special cases).

**E0 flattening note:** The pipeline runner (E0-1) must handle E2-5 returning `ExtractionResult[]`. For all other agents it expects a single `ExtractionResult`. The distinction is signaled by `field_name === "setbacks"` on the first element, or by the ADK agent configuration marking E2-5 as a multi-result extractor.

```
Extract the minimum setback requirements for residential multifamily development from the following zoning ordinance text.

Setbacks are the minimum distances a building must be set back from property lines. Extract the front, side, and rear setback values separately. All values should be in feet. If a range is given (e.g. "10 to 20 feet"), use the minimum value. If a setback direction is not mentioned, return null for field_value with confidence "low".

Return a JSON array containing exactly 3 objects, one per setback direction, each with this exact structure:
[
  {
    "field_name": "setback_front_ft",
    "field_value": <number in feet or null>,
    "field_value_text": "<exact quote from text>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section or article reference>",
    "district_context": "<zoning district this applies to>",
    "reasoning": "<one sentence explaining your extraction>"
  },
  {
    "field_name": "setback_side_ft",
    "field_value": <number in feet or null>,
    "field_value_text": "<exact quote from text>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section or article reference>",
    "district_context": "<zoning district this applies to>",
    "reasoning": "<one sentence explaining your extraction>"
  },
  {
    "field_name": "setback_rear_ft",
    "field_value": <number in feet or null>,
    "field_value_text": "<exact quote from text>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section or article reference>",
    "district_context": "<zoning district this applies to>",
    "reasoning": "<one sentence explaining your extraction>"
  }
]

Text chunk:
{text_chunk}
```

---

## Chunking Strategy

Each prompt receives a single text chunk as `{text_chunk}`. Chunks are produced by E0-2 and should:

- Be ≤ 4,000 tokens
- Overlap by ~200 tokens with adjacent chunks to avoid splitting mid-sentence
- Preserve section headers where possible so the model can identify `source_section`

If a field is not found in a given chunk, the agent returns `field_value: null` with `confidence: "low"`. The pipeline runner (E0-1) aggregates results across all chunks and selects the highest-confidence result per field.

---

## Validation Rules (E0-4)

Before writing to the database, the pipeline validates each extraction result against these plausibility ranges. Values outside the range are flagged and set to `confidence: "low"` regardless of the model's reported confidence.

| Field | Min | Max | Notes |
|-------|-----|-----|-------|
| `min_lot_size_sqft` | 500 | 200,000 | Typical range: 2,000–43,560 sqft |
| `height_limit_ft` | 15 | 300 | Typical multifamily: 35–150 ft |
| `density_limit_units_per_acre` | 1 | 500 | Typical multifamily: 10–100 |
| `parking_min_spaces_per_unit` | 0 | 5 | Typical: 1–2.5 |
| `setback_front_ft` | 0 | 100 | Typical: 10–30 ft |
| `setback_side_ft` | 0 | 60 | Typical: 5–20 ft |
| `setback_rear_ft` | 0 | 100 | Typical: 15–30 ft |
