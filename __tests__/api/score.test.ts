/**
 * @jest-environment node
 */
jest.mock('@/db/client', () => ({
  db: {
    query: {
      jurisdictions: { findFirst: jest.fn() },
      risScores:      { findFirst: jest.fn() },
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

describe('GET /api/jurisdictions/[id]/score', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
    })
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
})
