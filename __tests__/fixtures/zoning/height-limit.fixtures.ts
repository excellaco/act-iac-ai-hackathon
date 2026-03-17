import { ZoningFixture } from './types'

/**
 * E2-2: height_limit_ft gold fixtures
 *
 * LLM output: raw_value + raw_unit (ft, stories, meters).
 * Post-extraction normalization: stories × 10 → ft; meters × 3.281 → ft.
 * field_value is always null from the LLM.
 */
export const heightLimitFixtures: ZoningFixture[] = [
  {
    id: 'explicit-feet',
    jurisdiction: 'Arlington County, VA',
    scenario: 'easy',
    zoningText: `
Section 32.A: R-6 One-Family Dwelling Districts
Height Regulations: No building shall exceed 35 feet in height above grade.
Accessory structures shall not exceed 15 feet in height.
    `.trim(),
    expected: {
      field_name: 'height_limit_ft',
      raw_value: 35,
      raw_unit: 'feet',
      field_value: null,
      field_value_text: 'No building shall exceed 35 feet in height above grade.',
      unit: 'ft',
      confidence: 'high',
      source_section: 'Section 32.A R-6 One-Family Dwelling Districts',
      district_context: 'R-6 One-Family Dwelling Districts',
      reasoning: 'Height limit for principal structures is explicitly stated as 35 feet. The 15-foot limit applies only to accessory structures.',
    },
  },
  {
    id: 'stories-no-feet',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'ambiguous',
    zoningText: `
PDH-3 Planned Development Housing — Medium Density
Building Height: Principal buildings shall not exceed 3 stories.
Parking structures may not exceed 2 stories above grade.
    `.trim(),
    expected: {
      field_name: 'height_limit_ft',
      raw_value: 3,
      raw_unit: 'stories',
      field_value: null,
      field_value_text: 'Principal buildings shall not exceed 3 stories.',
      unit: 'ft',
      confidence: 'medium',
      source_section: 'PDH-3 Planned Development Housing — Medium Density',
      district_context: 'PDH-3 Planned Development Housing — Medium Density',
      reasoning: 'Height is stated in stories (3) with no explicit foot equivalent. Confidence is medium because story-to-foot conversion is an approximation.',
    },
  },
  {
    id: 'feet-and-stories',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'easy',
    zoningText: `
R-8 Multiple-Family Residential District
4.3.2 Height: Structures shall not exceed 45 feet or 4 stories, whichever is less.
    `.trim(),
    expected: {
      field_name: 'height_limit_ft',
      raw_value: 45,
      raw_unit: 'feet',
      field_value: null,
      field_value_text: 'Structures shall not exceed 45 feet or 4 stories, whichever is less.',
      unit: 'ft',
      confidence: 'high',
      source_section: 'Section 4.3.2 Height',
      district_context: 'R-8 Multiple-Family Residential District',
      reasoning: 'Both feet and stories are given; using the explicit foot value (45) as the authoritative limit since whichever-is-less applies.',
    },
  },
  {
    id: 'no-height-limit',
    jurisdiction: 'Arlington County, VA',
    scenario: 'edge',
    zoningText: `
C-O-Rosslyn Commercial Office Building, Rosslyn Coordinated Redevelopment District
Height: There is no maximum height limit in the C-O-Rosslyn district.
Building height shall be determined through the site plan approval process
in accordance with the Rosslyn Sector Plan.
    `.trim(),
    expected: {
      field_name: 'height_limit_ft',
      raw_value: null,
      raw_unit: '',
      field_value: null,
      field_value_text: 'There is no maximum height limit in the C-O-Rosslyn district.',
      unit: 'ft',
      confidence: 'low',
      source_section: 'C-O-Rosslyn Commercial Office Building, Rosslyn Coordinated Redevelopment District',
      district_context: 'C-O-Rosslyn Commercial Office Building, Rosslyn Coordinated Redevelopment District',
      reasoning: 'The text explicitly states there is no maximum height limit. Height is determined through case-by-case site plan review.',
    },
  },
  {
    id: 'contextual-height',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'ambiguous',
    zoningText: `
RC Residential Conservation District
Maximum building height shall not exceed the height of adjacent principal
structures by more than 10 feet, and in no case shall exceed 35 feet.
    `.trim(),
    expected: {
      field_name: 'height_limit_ft',
      raw_value: 35,
      raw_unit: 'feet',
      field_value: null,
      field_value_text: 'in no case shall exceed 35 feet',
      unit: 'ft',
      confidence: 'medium',
      source_section: 'RC Residential Conservation District',
      district_context: 'RC Residential Conservation District',
      reasoning: 'An absolute ceiling of 35 feet is stated but the contextual rule (adjacent height + 10 ft) may result in a lower effective limit. Using 35 ft as the hard cap; confidence is medium due to the contextual dependency.',
    },
  },
]
