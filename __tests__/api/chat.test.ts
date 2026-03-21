/**
 * @jest-environment node
 */

jest.mock('@/db/client', () => ({
  db: {
    query: {
      jurisdictions: { findFirst: jest.fn() },
    },
  },
}))

jest.mock('@/lib/chat/run', () => ({
  runChat: jest.fn(),
}))

import { NextRequest } from 'next/server'
import { POST } from '../../app/api/jurisdictions/[id]/chat/route'
import { db } from '@/db/client'
import { runChat } from '@/lib/chat/run'

const mockJurisdiction = {
  id: 'uuid-1',
  name: 'Fairfax County',
  state: 'VA',
  displayName: 'Fairfax County, VA',
  slug: 'fairfax',
  dataType: 'real',
}

function makeRequest(id: string, body: Record<string, unknown>) {
  return {
    req: new NextRequest(`http://localhost/api/jurisdictions/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params: Promise.resolve({ id }),
  }
}

describe('POST /api/jurisdictions/[id]/chat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns a reply for a valid request', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    ;(runChat as jest.Mock).mockResolvedValue('Fairfax requires 2.0 parking spaces per unit.')

    const { req, params } = makeRequest('uuid-1', {
      message: 'Why is parking score high?',
    })
    const res = await POST(req, { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reply).toBe('Fairfax requires 2.0 parking spaces per unit.')
    expect(runChat).toHaveBeenCalledWith('uuid-1', 'Why is parking score high?', [])
  })

  it('passes conversation history to runChat', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    ;(runChat as jest.Mock).mockResolvedValue('The setback is 25 feet.')

    const history = [
      { role: 'user', content: 'What is the parking score?' },
      { role: 'model', content: 'The parking score is 70.' },
    ]

    const { req, params } = makeRequest('uuid-1', {
      message: 'What about setbacks?',
      history,
    })
    const res = await POST(req, { params })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reply).toBe('The setback is 25 feet.')
    expect(runChat).toHaveBeenCalledWith(
      'uuid-1',
      'What about setbacks?',
      history,
    )
  })

  it('returns 404 for an unknown jurisdiction', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(null)

    const { req, params } = makeRequest('unknown-id', {
      message: 'Hello',
    })
    const res = await POST(req, { params })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Jurisdiction not found')
  })

  it('returns 400 for empty message', async () => {
    const { req, params } = makeRequest('uuid-1', { message: '' })
    const res = await POST(req, { params })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Message is required and must be non-empty')
  })

  it('returns 400 for missing message', async () => {
    const { req, params } = makeRequest('uuid-1', {})
    const res = await POST(req, { params })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Message is required and must be non-empty')
  })

  it('returns 400 for message exceeding max length', async () => {
    const longMessage = 'a'.repeat(4001)
    const { req, params } = makeRequest('uuid-1', { message: longMessage })
    const res = await POST(req, { params })

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/4000 characters/)
  })

  it('sanitizes history — strips invalid entries', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    ;(runChat as jest.Mock).mockResolvedValue('Response')

    const history = [
      { role: 'user', content: 'Valid' },
      { role: 'invalid-role', content: 'Bad role' },
      { role: 'model', content: 123 }, // non-string content
      null,
      { role: 'model', content: 'Also valid' },
    ]

    const { req, params } = makeRequest('uuid-1', { message: 'Hi', history })
    const res = await POST(req, { params })

    expect(res.status).toBe(200)
    // Only the two valid entries should pass through
    expect(runChat).toHaveBeenCalledWith('uuid-1', 'Hi', [
      { role: 'user', content: 'Valid' },
      { role: 'model', content: 'Also valid' },
    ])
  })

  it('returns 500 when runChat throws', async () => {
    ;(db.query.jurisdictions.findFirst as jest.Mock).mockResolvedValue(mockJurisdiction)
    ;(runChat as jest.Mock).mockRejectedValue(new Error('Vertex AI error'))

    const { req, params } = makeRequest('uuid-1', {
      message: 'Hello',
    })
    const res = await POST(req, { params })

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Unable to reach assistant. Try again.')
  })
})
