/**
 * @jest-environment node
 */
jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(),
  },
}))

import { GET } from '../../app/api/jurisdictions/route'
import { db } from '@/db/client'

const mockRows = [
  { id: 'uuid-1', name: 'Arlington County', state: 'VA', displayName: 'Arlington County, VA', dataType: 'real',      risComposite: '43' },
  { id: 'uuid-2', name: 'Fairfax County',   state: 'VA', displayName: 'Fairfax County, VA',   dataType: 'real',      risComposite: '73' },
  { id: 'uuid-3', name: 'Howard County',    state: 'MD', displayName: 'Howard County, MD',    dataType: 'synthetic', risComposite: '63' },
]

describe('GET /api/jurisdictions', () => {
  beforeEach(() => {
    (db.select as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue(mockRows),
        }),
      }),
    })
  })

  it('returns a list of jurisdictions with RIS scores', async () => {
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toHaveLength(3)
    expect(body[0]).toMatchObject({ name: 'Arlington County', risComposite: '43' })
  })

  it('includes synthetic jurisdictions flagged with dataType synthetic', async () => {
    const res = await GET()
    const body = await res.json()
    const synthetic = body.filter((j: { dataType: string }) => j.dataType === 'synthetic')
    expect(synthetic).toHaveLength(1)
    expect(synthetic[0].name).toBe('Howard County')
  })
})
