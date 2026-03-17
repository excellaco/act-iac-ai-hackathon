import { ZoningFixture } from './types'

/**
 * E2-4: parking_min_spaces_per_unit gold fixtures
 *
 * LLM output: raw_value + raw_unit (spaces/unit, spaces/bedroom).
 * Post-extraction normalization: spaces/bedroom × 2 → spaces/unit (assumes 2BR avg).
 * field_value is always null from the LLM.
 */
export const parkingMinFixtures: ZoningFixture[] = [
  {
    id: 'explicit-spaces-per-unit',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'easy',
    zoningText: `
Section 11-103: Off-Street Parking Requirements
Single-family detached dwellings: 2 spaces per dwelling unit, both spaces
shall be enclosed or within a garage. Tandem parking is permitted.
    `.trim(),
    expected: {
      field_name: 'parking_min_spaces_per_unit',
      raw_value: 2,
      raw_unit: 'spaces/unit',
      field_value: null,
      field_value_text: '2 spaces per dwelling unit',
      unit: 'spaces/unit',
      confidence: 'high',
      source_section: 'Section 11-103 Off-Street Parking Requirements',
      district_context: 'Single-family detached dwellings',
      reasoning: 'Minimum parking is explicitly stated as 2 spaces per dwelling unit.',
    },
  },
  {
    id: 'per-bedroom',
    jurisdiction: 'Arlington County, VA',
    scenario: 'ambiguous',
    zoningText: `
Article 14: Parking and Loading
14.3.2 Multi-Family Residential
  Studio and 1-bedroom units: 1 space per unit
  2-bedroom units: 1.5 spaces per unit
  3 or more bedrooms: 2 spaces per unit
    `.trim(),
    expected: {
      field_name: 'parking_min_spaces_per_unit',
      raw_value: 1.5,
      raw_unit: 'spaces/unit',
      field_value: null,
      field_value_text: '2-bedroom units: 1.5 spaces per unit',
      unit: 'spaces/unit',
      confidence: 'medium',
      source_section: 'Article 14, Section 14.3.2 Multi-Family Residential',
      district_context: 'Multi-Family Residential',
      reasoning: 'Parking varies by unit size. Using 2-bedroom (1.5 spaces) as the most representative unit type. Confidence is medium because the requirement depends on bedroom count.',
    },
  },
  {
    id: 'transit-overlay-reduced',
    jurisdiction: 'Arlington County, VA',
    scenario: 'edge',
    zoningText: `
Metro Station Area Overlay District
Notwithstanding any other parking minimum requirements, residential uses
within one-quarter mile of a Metrorail station entrance shall provide
no minimum off-street parking. Parking may be provided at the applicant's
discretion.
    `.trim(),
    expected: {
      field_name: 'parking_min_spaces_per_unit',
      raw_value: 0,
      raw_unit: 'spaces/unit',
      field_value: null,
      field_value_text: 'residential uses within one-quarter mile of a Metrorail station entrance shall provide no minimum off-street parking',
      unit: 'spaces/unit',
      confidence: 'high',
      source_section: 'Metro Station Area Overlay District',
      district_context: 'Metro Station Area Overlay District',
      reasoning: 'Parking minimum is explicitly waived (0 required) for transit-adjacent residential uses.',
    },
  },
  {
    id: 'spaces-per-bedroom-stated',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
Section 5.07.05 Parking Schedule
Townhouse and attached dwelling: 1 space per bedroom, minimum 2 spaces per unit.
Garages count toward required spaces.
    `.trim(),
    expected: {
      field_name: 'parking_min_spaces_per_unit',
      raw_value: 1,
      raw_unit: 'spaces/bedroom',
      field_value: null,
      field_value_text: '1 space per bedroom, minimum 2 spaces per unit',
      unit: 'spaces/unit',
      confidence: 'medium',
      source_section: 'Section 5.07.05 Parking Schedule',
      district_context: 'Townhouse and attached dwelling',
      reasoning: 'Requirement is 1 space/bedroom with a floor of 2 spaces/unit. Raw value is per-bedroom; normalization will convert using average bedroom assumption.',
    },
  },
  {
    id: 'fractional-requirement',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'easy',
    zoningText: `
Table 4-1200: Minimum Parking Requirements
Multifamily dwelling (general): 1.25 spaces per unit
Multifamily dwelling (senior/age-restricted): 0.75 spaces per unit
    `.trim(),
    expected: {
      field_name: 'parking_min_spaces_per_unit',
      raw_value: 1.25,
      raw_unit: 'spaces/unit',
      field_value: null,
      field_value_text: 'Multifamily dwelling (general): 1.25 spaces per unit',
      unit: 'spaces/unit',
      confidence: 'high',
      source_section: 'Table 4-1200 Minimum Parking Requirements',
      district_context: 'Multifamily dwelling (general)',
      reasoning: 'General multifamily minimum is 1.25 spaces per unit, explicitly stated. Senior housing has a separate lower rate; using general rate.',
    },
  },
]
