/**
 * @jest-environment node
 */

const mockRunAsync = jest.fn()
const mockCreateSession = jest.fn()

jest.mock('@google/adk', () => ({
  InMemoryRunner: jest.fn().mockImplementation(() => ({
    sessionService: { createSession: mockCreateSession },
    runAsync: mockRunAsync,
  })),
  isFinalResponse: jest.fn(),
}))

jest.mock('@google/genai', () => ({
  createUserContent: jest.fn((text: string) => ({
    role: 'user',
    parts: [{ text }],
  })),
}))

jest.mock('../../lib/chat/agent', () => ({
  zoningAgent: { name: 'mock_agent' },
}))

import { isFinalResponse } from '@google/adk'
import { runChat } from '../../lib/chat/run'

describe('runChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreateSession.mockResolvedValue({
      userId: 'anonymous',
      id: 'session-1',
    })
  })

  it('returns the final response text from the agent', async () => {
    const finalEvent = {
      content: { parts: [{ text: 'Fairfax requires 2.0 spaces per unit.' }] },
    }
    ;(isFinalResponse as jest.Mock).mockImplementation((e) => e === finalEvent)

    // Simulate async generator
    mockRunAsync.mockImplementation(async function* () {
      yield { content: { parts: [{ functionCall: {} }] } } // tool call event
      yield finalEvent
    })

    const reply = await runChat('uuid-1', 'Why is parking score high?', [])

    expect(reply).toBe('Fairfax requires 2.0 spaces per unit.')
  })

  it('includes conversation history in the message', async () => {
    const finalEvent = {
      content: { parts: [{ text: 'The setback is 25 feet.' }] },
    }
    ;(isFinalResponse as jest.Mock).mockImplementation((e) => e === finalEvent)
    mockRunAsync.mockImplementation(async function* () {
      yield finalEvent
    })

    const history = [
      { role: 'user' as const, content: 'What is the parking score?' },
      { role: 'model' as const, content: 'The parking score is high.' },
    ]

    const reply = await runChat('uuid-1', 'What about setbacks?', history)

    expect(reply).toBe('The setback is 25 feet.')
    // Verify the message passed to runAsync includes history context
    const runAsyncCall = mockRunAsync.mock.calls[0][0]
    expect(runAsyncCall.newMessage.parts[0].text).toContain('Conversation so far')
    expect(runAsyncCall.newMessage.parts[0].text).toContain('What is the parking score?')
  })

  it('returns fallback message when agent produces no text', async () => {
    ;(isFinalResponse as jest.Mock).mockReturnValue(false)
    mockRunAsync.mockImplementation(async function* () {
      yield { content: { parts: [] } }
    })

    const reply = await runChat('uuid-1', 'Hello', [])

    expect(reply).toBe('I was unable to generate a response. Please try again.')
  })
})
