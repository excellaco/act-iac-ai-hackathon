import { ZoningFixture } from './types'

/**
 * E2-7: discretionary_review_required gold fixtures
 *
 * LLM output: field_value_text describing the review type.
 * Expected values: 'by-right' | 'conditional_use_permit' | 'special_use_permit'
 * raw_value is null for this field (categorical, not numeric).
 */
export const discretionaryReviewFixtures: ZoningFixture[] = [
  {
    id: 'by-right',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'easy',
    zoningText: `
R-2 Single-Family Residential District — Permitted Uses
The following uses are permitted by-right in the R-2 district:
  (A) Single-family detached dwellings
  (B) Accessory structures incidental to a permitted use
  (C) Family day care homes (up to 6 children)
No special use permit or conditional use approval is required for the above uses.
    `.trim(),
    expected: {
      field_name: 'discretionary_review_required',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'by-right',
      unit: '',
      confidence: 'high',
      source_section: 'R-2 Single-Family Residential District — Permitted Uses',
      district_context: 'R-2 Single-Family Residential District',
      reasoning: 'Text explicitly states uses are "permitted by-right" and that no special use permit or conditional use approval is required.',
    },
  },
  {
    id: 'conditional-use-permit',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'easy',
    zoningText: `
Section 9-201: PDH Planned Development Housing District
Permitted Uses — Special Permit Required:
  (1) Multifamily residential dwellings — requires a Special Exception
      approved by the Board of Zoning Appeals pursuant to Section 9-204.
  (2) Mixed-income developments — requires Board of Supervisors approval.
    `.trim(),
    expected: {
      field_name: 'discretionary_review_required',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'conditional_use_permit',
      unit: '',
      confidence: 'high',
      source_section: 'Section 9-201 PDH Planned Development Housing District',
      district_context: 'PDH Planned Development Housing District',
      reasoning: 'Multifamily residential requires a Special Exception (equivalent to a conditional use permit) from the BZA. Discretionary approval is mandatory.',
    },
  },
  {
    id: 'special-use-permit',
    jurisdiction: 'Arlington County, VA',
    scenario: 'easy',
    zoningText: `
C-1 Local Commercial Districts
Residential uses above the ground floor are allowed only by Special Use Permit
(SUP) approved by the County Board following a public hearing in accordance
with Section 36 of the Zoning Ordinance.
    `.trim(),
    expected: {
      field_name: 'discretionary_review_required',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'special_use_permit',
      unit: '',
      confidence: 'high',
      source_section: 'C-1 Local Commercial Districts',
      district_context: 'C-1 Local Commercial Districts',
      reasoning: 'Text explicitly requires a Special Use Permit (SUP) approved by the County Board. This is discretionary legislative approval.',
    },
  },
  {
    id: 'ambiguous-language',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
PD-IP Planned Development Industrial Park
Residential uses are not listed as permitted by-right but may be
considered as part of an overall planned development concept plan
subject to Zoning Administrator approval. An applicant may apply
for a concept plan amendment to include limited residential uses.
    `.trim(),
    expected: {
      field_name: 'discretionary_review_required',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'conditional_use_permit',
      unit: '',
      confidence: 'medium',
      source_section: 'PD-IP Planned Development Industrial Park',
      district_context: 'PD-IP Planned Development Industrial Park',
      reasoning: 'Residential is not by-right; concept plan amendment requires Zoning Administrator approval. This constitutes discretionary review. Classified as conditional_use_permit; confidence medium because process details are unclear.',
    },
  },
  {
    id: 'tiered-review',
    jurisdiction: 'Arlington County, VA',
    scenario: 'ambiguous',
    zoningText: `
RA4.8 Multiple-Family Dwelling Districts
  Permitted as of right: Dwellings containing up to 4 units
  Permitted by Special Use Permit: Dwellings containing 5 or more units,
    requiring County Board approval after Planning Commission recommendation.
    `.trim(),
    expected: {
      field_name: 'discretionary_review_required',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'special_use_permit',
      unit: '',
      confidence: 'medium',
      source_section: 'RA4.8 Multiple-Family Dwelling Districts',
      district_context: 'RA4.8 Multiple-Family Dwelling Districts',
      reasoning: 'Small multifamily (≤4 units) is by-right; larger projects (5+ units) require an SUP. Classifying as special_use_permit because most multifamily development falls in the SUP tier. Confidence medium due to threshold dependency.',
    },
  },
]
