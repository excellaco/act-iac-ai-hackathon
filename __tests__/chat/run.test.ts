/**
 * @jest-environment node
 */

const mockRunEphemeral = jest.fn()

jest.mock('@google/adk', () => ({
  InMemoryRunner: jest.fn().mockImplementation(() => ({
    runEphemeral: mockRunEphemeral,
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
  })

  it('returns the final response text from the agent', async () => {
    const finalEvent = {
      content: { parts: [{ text: 'Fairfax requires 2.0 spaces per unit.' }] },
    }
    ;(isFinalResponse as jest.Mock).mockImplementation((e) => e === finalEvent)

    // Simulate async generator
    mockRunEphemeral.mockImplementation(async function* () {
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
    mockRunEphemeral.mockImplementation(async function* () {
      yield finalEvent
    })

    const history = [
      { role: 'user' as const, content: 'What is the parking score?' },
      { role: 'model' as const, content: 'The parking score is high.' },
    ]

    const reply = await runChat('uuid-1', 'What about setbacks?', history)

    expect(reply).toBe('The setback is 25 feet.')
    // Verify the message passed to runEphemeral includes history context
    const call = mockRunEphemeral.mock.calls[0][0]
    expect(call.newMessage.parts[0].text).toContain('Conversation so far')
    expect(call.newMessage.parts[0].text).toContain('What is the parking score?')
  })

  it('retries once on empty response then returns on success', async () => {
    const finalEvent = {
      content: { parts: [{ text: 'Got it on retry.' }] },
    }
    ;(isFinalResponse as jest.Mock).mockImplementation((e) => e === finalEvent)

    // First attempt: empty, second attempt: success
    mockRunEphemeral
      .mockImplementationOnce(async function* () {
        yield { content: { parts: [] } }
      })
      .mockImplementationOnce(async function* () {
        yield finalEvent
      })

    jest.spyOn(console, 'warn').mockImplementation()

    const reply = await runChat('uuid-1', 'Hello', [])

    expect(reply).toBe('Got it on retry.')
    expect(mockRunEphemeral).toHaveBeenCalledTimes(2)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('attempt 1/2'))

    jest.restoreAllMocks()
  })

  it('returns fallback after all retry attempts exhausted', async () => {
    ;(isFinalResponse as jest.Mock).mockReturnValue(false)
    mockRunEphemeral.mockImplementation(async function* () {
      yield { content: { parts: [] } }
    })

    jest.spyOn(console, 'warn').mockImplementation()

    const reply = await runChat('uuid-1', 'Hello', [])

    expect(reply).toBe('I was unable to generate a response. Please try again.')
    expect(mockRunEphemeral).toHaveBeenCalledTimes(2)

    jest.restoreAllMocks()
  })
})
