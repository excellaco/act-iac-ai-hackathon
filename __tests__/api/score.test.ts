/**
 * @jest-environment node
 */
jest.mock('@/db/client', () => ({
  db: {
    query: {
      jurisdictions:      { findFirst: jest.fn() },
      risScores:          { findFirst: jest.fn() },
      feasibilityOutputs: { findFirst: jest.fn() },
      marketData:         { findFirst: jest.fn() },
      zoneRisScores:      { findFirst: jest.fn() },
    },
    select: jest.fn(),
  },
}))

import { NextRequest } from 'next/server'
import { GET } from '../../app/api/jurisdictions/[id]/score/route'
import { db } from '@/db/client'

const mockJurisdiction = {
  id: 'uuid-1',
  name: 'Fairfax County',
  state: 'VA',
  displayName: 'Fairfax County, VA',
  dataType: 'real',
}

const mockScore = {
  id: 'score-uuid-1',
  jurisdictionId: 'uuid-1',
  risComposite: '73',
  dci: '75',
  dcoi: '70',
  pci: '65',
  crp: '80',
}

function makeRequest(id: string) {
  return {
    req: new NextRequest(`http://localhost/api/jurisdictions/${id}/score`),
    params: Promise.resolve({ id }),
  }
}

function makeSelectMock(rows: unknown[] = []) {
  return {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(rows),
    }),
  }
}

describe('GET /api/jurisdictions/[id]/score', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: all select() calls return empty arrays
    (db.select as jest.Mock).mockReturnValue(makeSelectMock());
    (db.query.feasibilityOutputs.findFirst as jest.Mock).mockResolvedValue(null);
    (db.query.marketData.findFirst as jest.Mock).mockResolvedValue(null);
  })

  it('returns jurisdiction and score for a valid id', async () => {
    (db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction);
    (db.query.risScores.findFirst as jest.Mock).mockResolvedValue(mockScore)

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.jurisdiction.name).toBe('Fairfax County')
    expect(body.score.risComposite).toBe('73')
    expect(body.extractedFields).toEqual([])
  })

  it('returns 404 for an unknown id', async () => {
    (db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(null)

    const { req, params } = makeRequest('unknown-id')
    const res = await GET(req, { params })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Jurisdiction not found')
  })

  it('returns empty zoneScores array when no zones exist', async () => {
    (db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction);
    (db.query.risScores.findFirst as jest.Mock).mockResolvedValue(mockScore)

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })
    const body = await res.json()

    expect(body.zoneScores).toEqual([])
  })

  it('returns zoneScores with fields and feasibility when zones exist', async () => {
    (db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction);
    (db.query.risScores.findFirst as jest.Mock).mockResolvedValue(mockScore)

    const mockZoneRow = {
      zoneCode: 'RA6-15',
      zoneName: 'Residential Apartment',
      multifamilyClassification: 'primary',
      dci: '40', dcoi: '50', pci: '35', crp: '45', risComposite: '43',
    }

    // Sequence of db.select calls in the route:
    //   1st: extractedFields (jurisdiction-level) → []
    //   2nd: zoneRisScores → [mockZoneRow]
    //   3rd (batch): zoneExtractedFields → [{fieldName: 'density_limit_units_per_acre', fieldValue: '72'}]
    //   4th (batch): feasibilityOutputs → [zone feasibility row]
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(makeSelectMock([]))
      .mockReturnValueOnce(makeSelectMock([mockZoneRow]))
      .mockReturnValueOnce(makeSelectMock([{
        fieldName: 'density_limit_units_per_acre',
        fieldValue: '72',
        zoneCode: 'RA6-15',
        fieldValueText: 'Maximum density: 72 units per acre',
        sourceSection: '§14.2',
        sourcePage: 87,
      }]))
      .mockReturnValueOnce(makeSelectMock([{
        zoneCode: 'RA6-15',
        maxUnitsPerAcre: 72,
        parkingFootprintPct: 27.3,
        estimatedCostPerUnit: 219_500,
        fmr2br: 2280,
      }]))

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.zoneScores).toHaveLength(1)
    const zone = body.zoneScores[0]
    expect(zone.zoneCode).toBe('RA6-15')
    expect(zone.multifamilyClassification).toBe('primary')
    expect(zone.fields).toEqual({ density_limit_units_per_acre: '72' })
    expect(zone.citations).toEqual({
      density_limit_units_per_acre: {
        fieldValueText: 'Maximum density: 72 units per acre',
        sourceSection: '§14.2',
        sourcePage: 87,
        confidence: null,
        reasoning: null,
      },
    })
    expect(zone.feasibility).toEqual(expect.objectContaining({ maxUnitsPerAcre: 72 }))
  })
})
