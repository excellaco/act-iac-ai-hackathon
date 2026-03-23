/**
 * @jest-environment node
 */

import { fetchJurisdictions, fetchScore, sendChatMessage } from '../lib/apiClient'

const mockFetch = jest.fn()
global.fetch = mockFetch as unknown as typeof fetch

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  }
}

describe('fetchJurisdictions', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns parsed jurisdiction list on success', async () => {
    const data = [
      { id: '1', name: 'Fairfax County', state: 'VA', displayName: 'Fairfax County, VA', dataType: 'real', risComposite: '73' },
    ]
    mockFetch.mockResolvedValue(jsonResponse(data))

    const result = await fetchJurisdictions()

    expect(result).toEqual(data)
    expect(mockFetch).toHaveBeenCalledWith('/api/jurisdictions')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null, 500))

    await expect(fetchJurisdictions()).rejects.toThrow('Failed to fetch jurisdictions')
  })
})

describe('fetchScore', () => {
  beforeEach(() => mockFetch.mockReset())

  it('returns parsed score response on success', async () => {
    const data = {
      jurisdiction: { id: '1', name: 'Fairfax County', state: 'VA', slug: 'fairfax', displayName: 'Fairfax County, VA', dataType: 'real' },
      score: { risComposite: '73', dci: '75', dcoi: '70', pci: '65', crp: '80', scoredAt: '2026-03-01' },
      extractedFields: [],
      feasibility: null,
      marketData: null,
      zoneScores: [],
    }
    mockFetch.mockResolvedValue(jsonResponse(data))

    const result = await fetchScore('uuid-1')

    expect(result).toEqual(data)
    expect(mockFetch).toHaveBeenCalledWith('/api/jurisdictions/uuid-1/score')
  })

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValue(jsonResponse(null, 404))

    await expect(fetchScore('unknown')).rejects.toThrow('Failed to fetch score')
  })
})

describe('sendChatMessage', () => {
  beforeEach(() => mockFetch.mockReset())

  it('sends POST with correct body and returns reply', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: 'Fairfax requires 2.0 spaces per unit.' }))

    const result = await sendChatMessage('uuid-1', 'Why is parking high?', [])

    expect(result.reply).toBe('Fairfax requires 2.0 spaces per unit.')
    expect(mockFetch).toHaveBeenCalledWith('/api/jurisdictions/uuid-1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Why is parking high?', history: [] }),
    })
  })

  it('passes conversation history in request body', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ reply: 'Answer' }))
    const history = [
      { role: 'user', content: 'First question' },
      { role: 'model', content: 'First answer' },
    ]

    await sendChatMessage('uuid-1', 'Follow-up', history)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.history).toEqual(history)
    expect(body.message).toBe('Follow-up')
  })

  it('throws parsed error message on API failure', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: jest.fn().mockResolvedValue({ error: 'Message is required' }),
    })

    await expect(sendChatMessage('uuid-1', '', [])).rejects.toThrow('Message is required')
  })

  it('throws default message when error body is unparseable', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: jest.fn().mockRejectedValue(new Error('not json')),
    })

    await expect(sendChatMessage('uuid-1', 'hi', [])).rejects.toThrow('Request failed')
  })
})
