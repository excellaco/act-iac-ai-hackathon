import { ZoningFixture } from './types'

/**
 * E2-5: setback_front_ft, setback_side_ft, setback_rear_ft gold fixtures
 *
 * The LLM returns an ARRAY of three ExtractionResult objects per snippet
 * (one per setback dimension). Each fixture therefore has an `expected`
 * array rather than a single result.
 */

export interface SetbackFixture {
  id: string
  jurisdiction: string
  scenario: 'easy' | 'ambiguous' | 'edge'
  zoningText: string
  /** Array of three results: [front, side, rear] */
  expected: [
    ZoningFixture['expected'],   // setback_front_ft
    ZoningFixture['expected'],   // setback_side_ft
    ZoningFixture['expected'],   // setback_rear_ft
  ]
}

import { ExtractionResult } from './types'

export const setbackFixtures: SetbackFixture[] = [
  {
    id: 'all-three-explicit',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'easy',
    zoningText: `
R-3 Single-Family Residential District — Yard Requirements
Front Yard: 30 feet minimum
Side Yard: 10 feet minimum (each side)
Rear Yard: 25 feet minimum
    `.trim(),
    expected: [
      {
        field_name: 'setback_front_ft',
        raw_value: 30,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Front Yard: 30 feet minimum',
        unit: 'ft',
        confidence: 'high',
        source_section: 'R-3 Single-Family Residential District — Yard Requirements',
        district_context: 'R-3 Single-Family Residential District',
        reasoning: 'Front yard setback is explicitly stated as 30 feet.',
      },
      {
        field_name: 'setback_side_ft',
        raw_value: 10,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Side Yard: 10 feet minimum (each side)',
        unit: 'ft',
        confidence: 'high',
        source_section: 'R-3 Single-Family Residential District — Yard Requirements',
        district_context: 'R-3 Single-Family Residential District',
        reasoning: 'Side yard setback is explicitly stated as 10 feet per side.',
      },
      {
        field_name: 'setback_rear_ft',
        raw_value: 25,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Rear Yard: 25 feet minimum',
        unit: 'ft',
        confidence: 'high',
        source_section: 'R-3 Single-Family Residential District — Yard Requirements',
        district_context: 'R-3 Single-Family Residential District',
        reasoning: 'Rear yard setback is explicitly stated as 25 feet.',
      },
    ],
  },
  {
    id: 'front-only-stated',
    jurisdiction: 'Arlington County, VA',
    scenario: 'ambiguous',
    zoningText: `
R-5 One-Family Dwelling Districts
Minimum front yard: 25 feet. Side and rear yard requirements shall
be established through the Board of Zoning Appeals variance process
on a case-by-case basis based on lot configuration.
    `.trim(),
    expected: [
      {
        field_name: 'setback_front_ft',
        raw_value: 25,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Minimum front yard: 25 feet.',
        unit: 'ft',
        confidence: 'high',
        source_section: 'R-5 One-Family Dwelling Districts',
        district_context: 'R-5 One-Family Dwelling Districts',
        reasoning: 'Front yard setback is explicitly stated as 25 feet.',
      },
      {
        field_name: 'setback_side_ft',
        raw_value: null,
        raw_unit: '',
        field_value: null,
        field_value_text: 'Side yard requirements shall be established through the Board of Zoning Appeals variance process',
        unit: 'ft',
        confidence: 'low',
        source_section: 'R-5 One-Family Dwelling Districts',
        district_context: 'R-5 One-Family Dwelling Districts',
        reasoning: 'No numeric side yard setback is specified; determined case-by-case by BZA.',
      },
      {
        field_name: 'setback_rear_ft',
        raw_value: null,
        raw_unit: '',
        field_value: null,
        field_value_text: 'rear yard requirements shall be established through the Board of Zoning Appeals variance process',
        unit: 'ft',
        confidence: 'low',
        source_section: 'R-5 One-Family Dwelling Districts',
        district_context: 'R-5 One-Family Dwelling Districts',
        reasoning: 'No numeric rear yard setback is specified; determined case-by-case by BZA.',
      },
    ],
  },
  {
    id: 'mixed-units-ft-and-pct',
    jurisdiction: 'Loudoun County, VA',
    scenario: 'ambiguous',
    zoningText: `
PDIP Planned Development Industrial Park
Front Setback: 50 feet from right-of-way line
Side Setback: 20% of lot width, not to exceed 30 feet
Rear Setback: 20 feet
    `.trim(),
    expected: [
      {
        field_name: 'setback_front_ft',
        raw_value: 50,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Front Setback: 50 feet from right-of-way line',
        unit: 'ft',
        confidence: 'high',
        source_section: 'PDIP Planned Development Industrial Park',
        district_context: 'PDIP Planned Development Industrial Park',
        reasoning: 'Front setback is explicitly stated as 50 feet from the ROW.',
      },
      {
        field_name: 'setback_side_ft',
        raw_value: 30,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Side Setback: 20% of lot width, not to exceed 30 feet',
        unit: 'ft',
        confidence: 'medium',
        source_section: 'PDIP Planned Development Industrial Park',
        district_context: 'PDIP Planned Development Industrial Park',
        reasoning: 'Side setback is percentage-based with a 30-foot cap. Using the stated maximum (30 ft) as the worst-case numeric value; confidence medium because actual value depends on lot width.',
      },
      {
        field_name: 'setback_rear_ft',
        raw_value: 20,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Rear Setback: 20 feet',
        unit: 'ft',
        confidence: 'high',
        source_section: 'PDIP Planned Development Industrial Park',
        district_context: 'PDIP Planned Development Industrial Park',
        reasoning: 'Rear setback is explicitly stated as 20 feet.',
      },
    ],
  },
  {
    id: 'zero-lot-line',
    jurisdiction: 'Fairfax County, VA',
    scenario: 'edge',
    zoningText: `
PRM-H High-Density Planned Residential Mixed-Use
Build-to Line: Buildings shall be constructed at the build-to line
coinciding with the front property line (0-foot front setback).
Side and rear setbacks: not applicable for attached townhouse or
mid-rise construction; determined by applicable fire code separation.
    `.trim(),
    expected: [
      {
        field_name: 'setback_front_ft',
        raw_value: 0,
        raw_unit: 'feet',
        field_value: null,
        field_value_text: 'Build-to Line coinciding with the front property line (0-foot front setback).',
        unit: 'ft',
        confidence: 'high',
        source_section: 'PRM-H High-Density Planned Residential Mixed-Use',
        district_context: 'PRM-H High-Density Planned Residential Mixed-Use',
        reasoning: 'Zero-lot-line build-to requirement explicitly states 0-foot front setback.',
      },
      {
        field_name: 'setback_side_ft',
        raw_value: null,
        raw_unit: '',
        field_value: null,
        field_value_text: 'Side setbacks: not applicable for attached townhouse or mid-rise construction',
        unit: 'ft',
        confidence: 'low',
        source_section: 'PRM-H High-Density Planned Residential Mixed-Use',
        district_context: 'PRM-H High-Density Planned Residential Mixed-Use',
        reasoning: 'Side setback is not applicable for this building type; determined by fire code rather than zoning.',
      },
      {
        field_name: 'setback_rear_ft',
        raw_value: null,
        raw_unit: '',
        field_value: null,
        field_value_text: 'rear setbacks: not applicable for attached townhouse or mid-rise construction',
        unit: 'ft',
        confidence: 'low',
        source_section: 'PRM-H High-Density Planned Residential Mixed-Use',
        district_context: 'PRM-H High-Density Planned Residential Mixed-Use',
        reasoning: 'Rear setback is not applicable for this building type; determined by fire code rather than zoning.',
      },
    ],
  },
]
