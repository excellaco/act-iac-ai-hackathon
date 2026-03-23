/**
 * @jest-environment node
 */

jest.mock('@/db/client', () => ({
  db: {
    select: jest.fn(),
  },
}))

jest.mock('@google-cloud/storage', () => {
  const mockDownload = jest.fn()
  const mockFile = jest.fn().mockReturnValue({ download: mockDownload })
  const mockBucket = jest.fn().mockReturnValue({ file: mockFile })
  return {
    Storage: jest.fn().mockImplementation(() => ({ bucket: mockBucket })),
    __mockDownload: mockDownload,
    __mockBucket: mockBucket,
    __mockFile: mockFile,
  }
})

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { GET } from '../../app/api/jurisdictions/[id]/pdf/route'
import { db } from '@/db/client'
import fs from 'fs'

const { __mockDownload: mockDownload } = jest.requireMock('@google-cloud/storage')

function makeRequest(id: string) {
  return {
    req: new NextRequest(`http://localhost/api/jurisdictions/${id}/pdf`),
    params: Promise.resolve({ id }),
  }
}

function mockDbRow(sourceDocument: string | null) {
  const mockChain = {
    from: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnValue({
        orderBy: jest.fn().mockReturnValue({
          limit: jest.fn().mockResolvedValue(
            sourceDocument ? [{ sourceDocument }] : [],
          ),
        }),
      }),
    }),
  }
  ;(db.select as jest.Mock).mockReturnValue(mockChain)
}

describe('GET /api/jurisdictions/[id]/pdf', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation()
    process.env = { ...originalEnv, RAW_DATA_BUCKET: 'test-bucket' }
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 404 when no source document found', async () => {
    mockDbRow(null)

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No source document found for this jurisdiction')
  })

  it('streams PDF from GCS when RAW_DATA_BUCKET is set', async () => {
    mockDbRow('gs://test-bucket/zoning/fairfax/ordinance.pdf')
    mockDownload.mockResolvedValue([Buffer.from('%PDF-1.4 fake content')])

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe('inline')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=3600')
  })

  it('reads PDF from local filesystem when RAW_DATA_BUCKET is not set', async () => {
    delete process.env.RAW_DATA_BUCKET
    mockDbRow('/local/path/to/ordinance.pdf')
    ;(fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('%PDF-1.4 local'))

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(fs.readFileSync).toHaveBeenCalled()
  })

  it('returns 500 when GCS download fails', async () => {
    mockDbRow('gs://test-bucket/zoning/fairfax/ordinance.pdf')
    mockDownload.mockRejectedValue(new Error('GCS access denied'))

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to retrieve source PDF')
    expect(body.detail).toBe('GCS access denied')
  })

  it('returns 500 when local file read fails', async () => {
    delete process.env.RAW_DATA_BUCKET
    mockDbRow('/nonexistent/path.pdf')
    ;(fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT') })

    const { req, params } = makeRequest('uuid-1')
    const res = await GET(req, { params })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Failed to retrieve source PDF')
  })
})
