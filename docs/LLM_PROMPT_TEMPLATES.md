# Parcella — LLM Extraction Prompt Templates

This document defines the prompt templates used in the extraction pipeline. It covers:

- **Stage 1 — Zone discovery** (`zone-discovery.extractor.ts`): identifies all residential zoning districts before field extraction begins
- **Stage 2 — Field extraction** (E2-1 through E2-7): extracts specific regulatory fields per zone

All field extraction prompts follow the same structure and output schema. The field extractions run in parallel (see ADR-0002).

---

## Stage 1 — Zone Discovery

**Script:** `scripts/zones.ts` → `lib/extractors/zone-discovery.extractor.ts`

Zone discovery runs before any field extraction. It makes one Gemini call per text chunk across the full ordinance and returns a deduplicated list of residential zoning districts with their multifamily classification. This canonical zone list is then passed to the per-field extractors in Stage 2.

### System Prompt

```
You are a zoning code analyst identifying BASE residential zoning districts from a municipal zoning ordinance.

A BASE residential zoning district is a standalone district (not an overlay) whose primary regulatory purpose is to govern where and how people live — single-family homes, townhomes, multifamily apartments, etc.

INCLUDE only districts that meet ALL of these criteria:
- Standalone base district (not an overlay applied on top of another district)
- Residential use is the primary purpose of the district
- The district regulates housing density, setbacks, height, and similar development standards
- The zone_code is a named district identifier from the zoning map or district list (e.g. R-1, RM-2, RA, RMF, R-A)

DO NOT include any of the following — even if they appear in the same section as residential zones:
- Overlay districts (e.g. "Transit Overlay", "Historic Overlay", "Entrance Corridor", "Airport Impact")
- Planned Development districts (PD-*, PDH, PD-OP, PD-TC, etc.) unless the text explicitly states they function as standalone residential base districts
- Commercial or retail districts (C-*, B-*, CR-*)
- Industrial or employment districts (I-*, M-*, E-*)
- Agricultural or rural districts (A-*, AR-*) unless the text explicitly permits multifamily housing as a primary use
- Mixed-use districts where commercial or office is the primary use
- Special purpose, transition, or buffer districts
- Any district whose name or description is primarily non-residential

CRITICAL — avoid these common hallucination traps:
- DO NOT enumerate sequential numeric variants of a base code. If a table shows "RM-1" and "RM-2" as density designators or footnote references, do NOT generate RM-3, RM-4, RM-5, etc. Only include codes that are explicitly named as standalone districts.
- DO NOT treat density values, FAR numbers, lot size minimums, or footnote numbers as zone codes.
- DO NOT include codes that look like garbled text, binary artifacts, or nonsense characters.
- A typical jurisdiction has between 3 and 25 base residential zoning districts. If you find more than 30, you are almost certainly including density table rows, footnote references, or numeric variants — stop and reconsider.

When uncertain whether a district is a base residential district, DO NOT include it. A false negative (missing a zone) is far less harmful than a false positive (including hundreds of non-residential zones).

Classify each included district exactly as one of:
- "primary"   — multifamily is the primary by-right use
- "permitted" — multifamily is a permitted by-right use alongside other uses
- "limited"   — multifamily is capped, conditional, or ADU-only
- "none"      — no multifamily use permitted

Return the zone_code exactly as it appears in the text. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON.
```

### Per-Chunk User Prompt

```
Identify BASE residential zoning districts from the following zoning ordinance text.

INCLUDE only standalone residential base districts (e.g. R-1, R-2, RM-2, RA, RMF) whose primary purpose is housing and that appear as named districts in a district list, table of contents, or district description section.

DO NOT include:
- Overlay districts, planned development districts, commercial zones, industrial zones, agricultural zones
- Mixed-use zones where commercial is primary, or any district where residential is a secondary or conditional use
- Density values, FAR numbers, lot size minimums, or footnote numbers masquerading as zone codes
- Sequential numeric variants you are inferring — only include codes explicitly stated as district names

If this chunk is a use table, density table, footnote list, or index rather than a district description or district list, return [].

Return at most 10 distinct zone codes from this chunk. If you think you see more than 10, re-read carefully — you are likely confusing table rows or numeric parameters with zone codes.

Return a JSON array (or [] if no base residential districts appear in this chunk):
[
  {
    "zone_code": "<exact code as written in the text>",
    "zone_name": "<full district name or null if not stated>",
    "multifamily_classification": "primary" | "permitted" | "limited" | "none"
  }
]

Text chunk:
{text_chunk}
```

### Output Schema

```typescript
interface DiscoveredZone {
  zone_code: string                  // exact code as found in text
  zone_name: string | null           // full district name, or null
  multifamily_classification: 'primary' | 'permitted' | 'limited' | 'none'
}
```

**Multifamily classification tiers:**

| Value | Meaning |
|-------|---------|
| `primary` | Multifamily is the primary by-right use |
| `permitted` | Multifamily is permitted by-right alongside other uses |
| `limited` | Multifamily is capped, conditional, or ADU-only |
| `none` | No multifamily use permitted |

Results across all chunks are deduplicated by normalized zone code. Where the same zone code appears in multiple chunks with different classifications, the higher-permission classification wins (`primary > permitted > limited > none`).

---

## Stage 2 — Field Extraction

### Output Schema

Every extraction agent returns a JSON object (or array — see E2-5) conforming to this schema. The pipeline validates this output before writing to the database (E0-4).

```typescript
interface ExtractionResult {
  field_name: string;          // snake_case field identifier
  raw_value: number | null;    // value exactly as found in the text (no conversion)
  raw_unit: string;            // unit exactly as found in the text (e.g. "stories", "acres", "per bedroom")
  field_value: number | null;  // normalized value after post-extraction conversion (see Normalization section)
  field_value_text: string;    // exact verbatim quote from the ordinance text
  unit: string;                // normalized unit (e.g. "ft", "sqft", "units_per_acre", "spaces_per_unit")
  confidence: 'high' | 'medium' | 'low';
  source_section: string;      // section/article reference if identifiable
  district_context: string;    // zoning district the value applies to
  reasoning: string;           // brief explanation of how value was extracted
}
```

The LLM populates `raw_value` and `raw_unit` from the text as-found. The **post-extraction normalization step** (deterministic code, see below) converts raw values to canonical units and writes the result to `field_value` and `unit`. This separation keeps conversion logic testable and makes the "About this score" methodology disclosure accurate — the UI can show both what the ordinance said and how it was normalized.

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
3. If multiple values exist for different sub-districts, return the value from the most permissive (least restrictive) multifamily district and note which district it applies to in district_context.
4. Return the value exactly as written in the text in raw_value and raw_unit — do not convert units. Unit conversion is handled by the pipeline after extraction.
5. Return null for raw_value if the information is genuinely not present in this text chunk.
6. Never fabricate values. A null result with low confidence is correct — a fabricated value is not.
7. field_value_text must be a verbatim quote from the ordinance — not a paraphrase.
8. Return only valid JSON — no preamble, no markdown, no explanation outside the JSON object.
```

---

## E2-1 — Minimum Lot Size

**Field:** `min_lot_size_sqft`
**Unit:** `sqft`

```
Extract the minimum lot size requirement for residential multifamily development from the following zoning ordinance text.

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
{text_chunk}
```

---

## E2-2 — Height Limit

**Field:** `height_limit_ft`
**Unit:** `ft`

```
Extract the maximum building height limit for residential multifamily development from the following zoning ordinance text.

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
{text_chunk}
```

---

## E2-3 — Density Limit

**Field:** `density_limit_units_per_acre`
**Unit:** `units_per_acre`

```
Extract the maximum residential density limit from the following zoning ordinance text.

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
{text_chunk}
```

---

## E2-4 — Parking Minimum

**Field:** `parking_min_spaces_per_unit`
**Unit:** `spaces_per_unit`

```
Extract the minimum off-street parking requirement for residential multifamily development from the following zoning ordinance text.

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

Return the value exactly as written — do not convert units. Leave field_value as null — it is populated by the normalization step after extraction.

Return a JSON array containing exactly 3 objects, one per setback direction, each with this exact structure:
[
  {
    "field_name": "setback_front_ft",
    "raw_value": <number exactly as in the text, or null>,
    "raw_unit": "<unit as written, e.g. 'feet', 'ft', 'meters'>",
    "field_value": null,
    "field_value_text": "<verbatim quote from the ordinance>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section or article reference>",
    "district_context": "<zoning district this applies to>",
    "reasoning": "<one sentence explaining your extraction>"
  },
  {
    "field_name": "setback_side_ft",
    "raw_value": <number exactly as in the text, or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote from the ordinance>",
    "unit": "ft",
    "confidence": "high" | "medium" | "low",
    "source_section": "<section or article reference>",
    "district_context": "<zoning district this applies to>",
    "reasoning": "<one sentence explaining your extraction>"
  },
  {
    "field_name": "setback_rear_ft",
    "raw_value": <number exactly as in the text, or null>,
    "raw_unit": "<unit as written>",
    "field_value": null,
    "field_value_text": "<verbatim quote from the ordinance>",
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

## E2-7 — Discretionary Review

**Field:** `discretionary_review_required`
**Source:** `lib/extractors/discretionary-review.extractor.ts` (extends `MultiZoneGeminiExtractor`)

Unlike E2-1 through E2-5, this field is categorical — it returns a string value in `field_value_text` rather than a numeric value. `raw_value` is always `null`.

### Single-chunk prompt

```
Extract the discretionary review requirement for residential multifamily housing from the following zoning ordinance text.

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
{text_chunk}
```

### Multi-zone prompt (E2-155)

When processing multiple zones in a single call (`buildMultiZonePrompt`), the prompt is:

```
For each of the following residential zoning districts, determine the discretionary review type for multifamily development from the provided ordinance text.

Canonical zone list (use EXACTLY these zone codes in your response):
  - {zone_code} ({zone_name})
  ...

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

## Post-Extraction Normalization (E0 pipeline step)

After each LLM extraction call, before validation (E0-4), a deterministic normalization step converts `raw_value` + `raw_unit` to a canonical `field_value` in the expected unit. This step is implemented in code — not in the LLM prompt — so it is testable, auditable, and explainable in the "About this score" modal (E6-5).

| Field | Input units handled | Conversion |
|-------|--------------------|-|
| `min_lot_size_sqft` | sq ft, sqft, acres, square feet | acres × 43,560; sq ft as-is |
| `height_limit_ft` | ft, feet, stories, meters | stories × 10; meters × 3.281; ft as-is |
| `density_limit_units_per_acre` | units/acre, du/acre, FAR, units/sq ft | FAR: `(FAR × 43,560) / 1,050`; per sq ft × 43,560; units/acre as-is |
| `parking_min_spaces_per_unit` | spaces/unit, per bedroom, per sq ft | per bedroom × 2; per sq ft × 900; spaces/unit as-is |
| `setback_*_ft` | ft, feet, meters | meters × 3.281; ft as-is |

If `raw_unit` does not match any known pattern, `field_value` remains null and `confidence` is downgraded to `low`.

The `field_value_text` verbatim quote is preserved in the database regardless — the UI always has the source text to display alongside the normalized value.

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
