import { ZoningFixture } from './types'

/**
 * E2-3: density_limit_units_per_acre gold fixtures
 *
 * LLM output: raw_value + raw_unit (units/acre, units/sqft, units/hectare).
 * Post-extraction normalization: units/sqft × 43,560 → units/acre.
 * field_value is always null from the LLM.
 */
export const densityLimitFixtures: ZoningFixture[] = [
  {
    id: 'explicit-units-per-acre',
    jurisdiction: 'Arlington County, VA',
    scenario: 'easy',
    zoningText: `
RA6-15 Apartment Dwelling District
Density: The maximum density shall not exceed 15 dwelling units per acre of
net site area. For the purposes of this section, net site area excludes
existing public rights-of-way.
    `.trim(),
    expected: {
      field_name: 'density_limit_units_per_acre',
      raw_value: 15,
      raw_unit: 'units/acre',
      field_value: null,
      field_value_text: 'The maximum density shall not exceed 15 dwelling units per acre of net site area.',
      unit: 'units/acre',
      confidence: 'high',
      source_section: 'RA6-15 Apartment Dwelling District',
      district_context: 'RA6-15 Apartment Dwelling District',
      reasoning: 'Maximum density is explicitly stated as 15 dwelling units per acre. The net site area definition is noted.',
    },
  },
  {
    id: 'derived-from-lot-size',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
R-4 Single-Family Residential
Minimum Lot Area per Dwelling Unit: 10,000 square feet
Each lot shall contain no more than one principal dwelling unit.
    `.trim(),
    expected: {
      field_name: 'density_limit_units_per_acre',
      raw_value: 10000,
      raw_unit: 'sqft/unit',
      field_value: null,
      field_value_text: 'Minimum Lot Area per Dwelling Unit: 10,000 square feet',
      unit: 'units/acre',
      confidence: 'medium',
      source_section: 'R-4 Single-Family Residential',
      district_context: 'R-4 Single-Family Residential',
      reasoning: 'No explicit units-per-acre limit is stated. Density is implied by minimum lot area of 10,000 sqft/unit. Confidence is medium because the density limit is derived rather than stated directly.',
    },
  },
  {
    id: 'no-density-limit',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'edge',
    zoningText: `
I-4 Transitional Industrial District
Residential uses are not permitted in the I-4 district.
    `.trim(),
    expected: {
      field_name: 'density_limit_units_per_acre',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'Residential uses are not permitted in the I-4 district.',
      unit: 'units/acre',
      confidence: 'low',
      source_section: 'I-4 Transitional Industrial District',
      district_context: 'I-4 Transitional Industrial District',
      reasoning: 'Residential uses are prohibited; no density limit is applicable or stated.',
    },
  },
  {
    id: 'range-by-unit-type',
    jurisdiction: 'Arlington County, VA',
    scenario: 'ambiguous',
    zoningText: `
RA-H Hotel and Residential District
Residential density shall not exceed:
  (a) Single-family: 6 units per acre
  (b) Multi-family: 48 units per acre
  (c) Senior housing: 60 units per acre
    `.trim(),
    expected: {
      field_name: 'density_limit_units_per_acre',
      raw_value: 48,
      raw_unit: 'units/acre',
      field_value: null,
      field_value_text: 'Multi-family: 48 units per acre',
      unit: 'units/acre',
      confidence: 'medium',
      source_section: 'RA-H Hotel and Residential District',
      district_context: 'RA-H Hotel and Residential District',
      reasoning: 'Multiple density limits apply depending on unit type. Using multi-family (48 units/acre) as the most representative general residential density. Confidence is medium because the applicable limit depends on use.',
    },
  },
  {
    id: 'tiered-by-bonus',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
JLMA-3 Joint Land Management Area
Base density: 3 dwelling units per acre.
Affordable housing bonus: Projects providing 15% affordable units may
increase density to 4.5 dwelling units per acre.
    `.trim(),
    expected: {
      field_name: 'density_limit_units_per_acre',
      raw_value: 3,
      raw_unit: 'units/acre',
      field_value: null,
      field_value_text: 'Base density: 3 dwelling units per acre.',
      unit: 'units/acre',
      confidence: 'medium',
      source_section: 'JLMA-3 Joint Land Management Area',
      district_context: 'JLMA-3 Joint Land Management Area',
      reasoning: 'Base density is 3 units/acre; a bonus of 4.5 units/acre is available with affordable housing. Using the base (3) as the standard limit. Confidence is medium because the achievable maximum differs.',
    },
  },
]
