import { ZoningFixture } from './types'

/**
 * E2-1: min_lot_size_sqft gold fixtures
 *
 * LLM output: raw_value + raw_unit (acres or sqft).
 * Post-extraction normalization: acres × 43,560 → field_value in sqft.
 * field_value is always null from the LLM.
 */
export const minLotSizeFixtures: ZoningFixture[] = [
  {
    id: 'explicit-sqft',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'easy',
    zoningText: `
Section 3-201: R-1 Single-Family Residential District
3-201.01 Dimensional Requirements
Minimum Lot Area: 8,000 square feet
Minimum Lot Width: 75 feet
Minimum Front Yard: 30 feet
    `.trim(),
    expected: {
      field_name: 'min_lot_size_sqft',
      raw_value: 8000,
      raw_unit: 'square feet',
      field_value: null,
      field_value_text: 'Minimum Lot Area: 8,000 square feet',
      unit: 'sqft',
      confidence: 'high',
      source_section: 'Section 3-201.01 Dimensional Requirements',
      district_context: 'R-1 Single-Family Residential District',
      reasoning: 'The minimum lot area is explicitly stated as 8,000 square feet in the R-1 district dimensional requirements table.',
    },
  },
  {
    id: 'explicit-acres',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'easy',
    zoningText: `
Article VI: TR-1 Transitional Residential District
6.2 Bulk Regulations
  Minimum Lot Size: 1 acre
  Maximum Lot Coverage: 25%
  Minimum Setbacks: Front 40 ft, Side 15 ft, Rear 30 ft
    `.trim(),
    expected: {
      field_name: 'min_lot_size_sqft',
      raw_value: 1,
      raw_unit: 'acres',
      field_value: null,
      field_value_text: 'Minimum Lot Size: 1 acre',
      unit: 'sqft',
      confidence: 'high',
      source_section: 'Article VI, Section 6.2 Bulk Regulations',
      district_context: 'TR-1 Transitional Residential District',
      reasoning: 'Minimum lot size is explicitly stated as 1 acre. Raw unit is acres; normalization will convert to 43,560 sqft.',
    },
  },
  {
    id: 'range-minimum',
    jurisdiction: 'Arlington County, VA',
    scenario: 'ambiguous',
    zoningText: `
Section 12.5: R-5 Residential District Standards
Lot area shall not be less than 5,000 square feet; however, lots within
a cluster development may be reduced to 3,500 square feet provided the
overall density does not exceed one unit per 5,000 square feet of net
site area.
    `.trim(),
    expected: {
      field_name: 'min_lot_size_sqft',
      raw_value: 5000,
      raw_unit: 'square feet',
      field_value: null,
      field_value_text: 'Lot area shall not be less than 5,000 square feet',
      unit: 'sqft',
      confidence: 'medium',
      source_section: 'Section 12.5 R-5 Residential District Standards',
      district_context: 'R-5 Residential District',
      reasoning: 'The standard minimum lot area is 5,000 sqft but can be reduced to 3,500 sqft in cluster developments. Using the standard (higher) minimum; confidence is medium due to the conditional exception.',
    },
  },
  {
    id: 'no-minimum-stated',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'edge',
    zoningText: `
Section 7-100: PRM Planned Residential Mixed-Use District
The PRM district is intended to accommodate high-density residential development
in proximity to transit corridors. Lot area and lot width requirements are
determined through the planned development approval process and are not
subject to minimum dimensional standards.
    `.trim(),
    expected: {
      field_name: 'min_lot_size_sqft',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'Lot area and lot width requirements are determined through the planned development approval process',
      unit: 'sqft',
      confidence: 'low',
      source_section: 'Section 7-100 PRM Planned Residential Mixed-Use District',
      district_context: 'PRM Planned Residential Mixed-Use District',
      reasoning: 'No numeric minimum lot size is specified. Requirements are set case-by-case through planned development approval.',
    },
  },
  {
    id: 'half-acre-fraction',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
VRSA Village Residential — Small Lot
Minimum Lot Area: one-half (1/2) acre
Minimum Lot Width at Building Line: 60 feet
    `.trim(),
    expected: {
      field_name: 'min_lot_size_sqft',
      raw_value: 0.5,
      raw_unit: 'acres',
      field_value: null,
      field_value_text: 'Minimum Lot Area: one-half (1/2) acre',
      unit: 'sqft',
      confidence: 'high',
      source_section: 'VRSA Village Residential — Small Lot',
      district_context: 'VRSA Village Residential — Small Lot',
      reasoning: 'Minimum lot area is stated as one-half acre, expressed in fractional form. Raw value is 0.5 acres.',
    },
  },
]
