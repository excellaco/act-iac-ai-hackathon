import { parseNumeric, scoreResponseToJurisdictionData } from '../lib/mockData'

describe('parseNumeric', () => {
  it('parses a valid numeric string', () => {
    expect(parseNumeric('42', 0)).toBe(42)
    expect(parseNumeric('3.14', 0)).toBe(3.14)
    expect(parseNumeric('-10', 0)).toBe(-10)
  })

  it('correctly parses "0" as zero, not fallback', () => {
    expect(parseNumeric('0', 999)).toBe(0)
    expect(parseNumeric('0.0', 999)).toBe(0)
  })

  it('returns fallback for null', () => {
    expect(parseNumeric(null, 42)).toBe(42)
  })

  it('returns fallback for undefined', () => {
    expect(parseNumeric(undefined, 42)).toBe(42)
  })

  it('returns fallback for non-numeric strings', () => {
    expect(parseNumeric('N/A', 0)).toBe(0)
    expect(parseNumeric('', 0)).toBe(0)
    expect(parseNumeric('abc', 10)).toBe(10)
  })

  it('returns fallback for NaN-producing strings', () => {
    expect(parseNumeric('not-a-number', 5)).toBe(5)
  })

  it('handles strings with leading/trailing whitespace', () => {
    expect(parseNumeric(' 42 ', 0)).toBe(42)
  })

  it('rejects strings with numeric prefix followed by non-numeric chars', () => {
    // Number('12abc') returns NaN — stricter than parseFloat which returns 12
    expect(parseNumeric('12abc', 0)).toBe(0)
  })
})

// ── scoreResponseToJurisdictionData integration tests ─────────────────────

describe('scoreResponseToJurisdictionData', () => {
  const validResponse = {
    jurisdiction: { id: 'uuid-1', name: 'Test County', state: 'VA', slug: 'fairfax', dataType: 'real' },
    score: { risComposite: '73', dci: '75', dcoi: '70', pci: '65', crp: '80' },
    extractedFields: [] as Array<{ fieldName: string; fieldValue: string | null; unit: string | null; confidence: string; sourceDocument: string | null }>,
  }

  it('returns null when score is missing', () => {
    expect(scoreResponseToJurisdictionData({ ...validResponse, score: null })).toBeNull()
  })

  it('parses valid score strings into numbers', () => {
    const result = scoreResponseToJurisdictionData(validResponse)
    expect(result).not.toBeNull()
    expect(result!.ris).toBe(73)
    expect(result!.subScores.dci.score).toBe(75)
  })

  it('produces 0 for invalid score strings instead of NaN', () => {
    const badScores = { ...validResponse, score: { risComposite: 'bad', dci: 'N/A', dcoi: '', pci: 'null', crp: '80' } }
    const result = scoreResponseToJurisdictionData(badScores)
    expect(result).not.toBeNull()
    expect(Number.isNaN(result!.ris)).toBe(false)
    expect(Number.isNaN(result!.subScores.dci.score)).toBe(false)
    expect(result!.subScores.crp.score).toBe(80)
  })

  it('skips extracted fields with non-numeric values', () => {
    const withBadField = {
      ...validResponse,
      extractedFields: [
        { fieldName: 'height_limit_ft', fieldValue: 'N/A', unit: 'ft', confidence: 'low', sourceDocument: null },
        { fieldName: 'min_lot_size_sqft', fieldValue: '5000', unit: 'sqft', confidence: 'high', sourceDocument: null },
      ],
    }
    const result = scoreResponseToJurisdictionData(withBadField)
    expect(result).not.toBeNull()
    // The valid field should be used; the invalid one should fall back to default
    expect(result!.fields.minLotSizeSqft).toBe(5000)
    // height_limit_ft should fall back to the Fairfax default (45), not be NaN
    expect(Number.isNaN(result!.fields.heightLimitFt)).toBe(false)
  })

  it('falls through to computeFeasibility when stored feasibility has invalid cost', () => {
    const withBadFeasibility = {
      ...validResponse,
      feasibility: {
        maxUnitsPerAcre: '12',
        parkingFootprintPct: '18.2',
        estimatedCostPerUnit: 'N/A',
        fmr2br: '2280',
      },
    }
    const result = scoreResponseToJurisdictionData(withBadFeasibility)
    expect(result).not.toBeNull()
    // Should recompute from fields, not produce requiredRent=0
    expect(result!.feasibility.estimatedCostPerUnit).toBeGreaterThan(0)
    expect(result!.feasibility.requiredRent).toBeGreaterThan(0)
  })

  it('uses stored feasibility when values are valid', () => {
    const withGoodFeasibility = {
      ...validResponse,
      feasibility: {
        maxUnitsPerAcre: '12',
        parkingFootprintPct: '18.2',
        estimatedCostPerUnit: '251600',
        fmr2br: '2280',
      },
    }
    const result = scoreResponseToJurisdictionData(withGoodFeasibility)
    expect(result).not.toBeNull()
    expect(result!.feasibility.estimatedCostPerUnit).toBe(251600)
    expect(result!.feasibility.maxUnitsPerAcre).toBe(12)
  })

  it('parses zoneScores and maps fields to RegulationFields', () => {
    const withZones = {
      ...validResponse,
      zoneScores: [
        {
          zoneCode: 'RA6-15',
          zoneName: 'Residential Apartment',
          multifamilyClassification: 'primary' as const,
          dci: '40', dcoi: '50', pci: '35', crp: '45', risComposite: '43',
          fields: {
            min_lot_size_sqft: '3630',
            height_limit_ft: '125',
            density_limit_units_per_acre: '72',
            parking_min_spaces_per_unit: '0.5',
          },
          feasibility: {
            maxUnitsPerAcre: '72',
            parkingFootprintPct: '27.3',
            estimatedCostPerUnit: '219500',
            fmr2br: '2280',
          },
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withZones)
    expect(result).not.toBeNull()
    expect(result!.zoneScores).toHaveLength(1)
    const zone = result!.zoneScores[0]
    expect(zone.zoneCode).toBe('RA6-15')
    expect(zone.dci).toBe(40)
    expect(zone.fields.minLotSizeSqft).toBe(3630)
    expect(zone.fields.heightLimitFt).toBe(125)
    expect(zone.fields.densityLimitUpa).toBe(72)
    expect(zone.feasibility?.estimatedCostPerUnit).toBe(219500)
  })

  it('populates zone citations when present', () => {
    const withZoneCitations = {
      ...validResponse,
      zoneScores: [
        {
          zoneCode: 'RA6-15',
          zoneName: 'Residential Apartment',
          multifamilyClassification: 'primary' as const,
          dci: '40', dcoi: '50', pci: '35', crp: '45', risComposite: '43',
          fields: { min_lot_size_sqft: '3630' },
          citations: {
            min_lot_size_sqft: {
              fieldValueText: 'Minimum lot area: 3,630 sq ft',
              sourceSection: '§12.3.1',
              sourcePage: 42,
              fieldValue: '3630',
            },
          },
          feasibility: null,
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withZoneCitations)
    expect(result).not.toBeNull()
    const zone = result!.zoneScores[0]
    expect(zone.citations['min_lot_size_sqft']).toEqual({
      fieldValueText: 'Minimum lot area: 3,630 sq ft',
      sourceSection: '§12.3.1',
      sourcePage: 42,
      sourceDocument: null,
      confidence: null,
      reasoning: null,
      usingDefault: false,
    })
  })

  it('returns empty citations when zone has no citations', () => {
    const withZoneNoCitations = {
      ...validResponse,
      zoneScores: [
        {
          zoneCode: 'R-6',
          zoneName: 'Single Family',
          multifamilyClassification: 'limited' as const,
          dci: '80', dcoi: '60', pci: '70', crp: '65', risComposite: '72',
          fields: {},
          feasibility: null,
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withZoneNoCitations)
    expect(result).not.toBeNull()
    expect(result!.zoneScores[0].citations).toEqual({})
  })

  it('sets usingDefault=false for categorical fields that have fieldValueText but no numeric fieldValue', () => {
    const withCategorical = {
      ...validResponse,
      extractedFields: [
        {
          fieldName: 'discretionary_review_required',
          fieldValue: null,
          fieldValueText: 'special use permit',
          unit: null,
          confidence: 'high',
          sourceDocument: null,
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withCategorical)
    expect(result).not.toBeNull()
    expect(result!.citations['discretionary_review_required'].usingDefault).toBe(false)
  })

  it('sets usingDefault=true only when both fieldValue and fieldValueText are absent', () => {
    const withNoValue = {
      ...validResponse,
      extractedFields: [
        {
          fieldName: 'height_limit_ft',
          fieldValue: null,
          fieldValueText: null,
          unit: null,
          confidence: 'low',
          sourceDocument: null,
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withNoValue)
    expect(result).not.toBeNull()
    expect(result!.citations['height_limit_ft'].usingDefault).toBe(true)
  })

  it('reads zoningExtractedAt from the top-level response field, not marketData', () => {
    const ts = '2025-03-15T00:00:00.000Z'
    const withVintage = {
      ...validResponse,
      zoningExtractedAt: ts,
      marketData: {
        fmr2br: '2280',
        permits5plus: 1000,
        totalPermits: 2000,
      },
    }
    const result = scoreResponseToJurisdictionData(withVintage)
    expect(result).not.toBeNull()
    expect(result!.dataVintage?.zoningExtractedAt).toBe(ts)
  })

  it('falls back to null feasibility when zone cost is unparsable', () => {
    const withBadZoneFeasibility = {
      ...validResponse,
      zoneScores: [
        {
          zoneCode: 'R-6',
          zoneName: 'Single Family',
          multifamilyClassification: 'limited' as const,
          dci: '80', dcoi: '60', pci: '70', crp: '65', risComposite: '72',
          fields: {},
          feasibility: { maxUnitsPerAcre: '4', parkingFootprintPct: '10', estimatedCostPerUnit: 'N/A', fmr2br: '2280' },
        },
      ],
    }
    const result = scoreResponseToJurisdictionData(withBadZoneFeasibility)
    expect(result).not.toBeNull()
    expect(result!.zoneScores[0].feasibility).toBeNull()
  })
})
