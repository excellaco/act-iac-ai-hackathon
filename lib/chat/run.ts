/**
 * Chat orchestration — runs the ADK agent for a single user turn.
 *
 * Each API request creates a fresh InMemoryRunner. Conversation history
 * is injected into the system instruction so the agent sees prior turns
 * without needing to reconstruct ADK session events (which would require
 * replaying tool calls). This keeps the API fully stateless.
 */

import { InMemoryRunner, isFinalResponse } from '@google/adk'
import { createUserContent } from '@google/genai'
import { zoningAgent } from './agent'

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

/**
 * Run one turn of the chat agent and return the assistant's reply.
 *
 * @param jurisdictionId  UUID of the jurisdiction being discussed
 * @param message         The user's new message
 * @param history         Prior conversation turns (maintained client-side)
 */
export async function runChat(
  jurisdictionId: string,
  message: string,
  history: ChatMessage[],
): Promise<string> {
  const runner = new InMemoryRunner({ agent: zoningAgent })

  const session = await runner.sessionService.createSession({
    appName: 'parcela-chat',
    userId: 'anonymous',
  })

  // Build context message that includes jurisdiction ID and conversation history
  const contextParts: string[] = [
    `The user is asking about jurisdiction ID: ${jurisdictionId}`,
    `Always pass this jurisdiction ID when calling tools.`,
  ]

  if (history.length > 0) {
    contextParts.push('\n## Conversation so far')
    for (const turn of history) {
      const label = turn.role === 'user' ? 'User' : 'Assistant'
      contextParts.push(`${label}: ${turn.content}`)
    }
    contextParts.push('\n## New message from user')
  }

  const fullMessage = history.length > 0
    ? `${contextParts.join('\n')}\n${message}`
    : `${contextParts.join('\n')}\n\n${message}`

  const userContent = createUserContent(fullMessage)

  let reply = ''
  for await (const event of runner.runAsync({
    userId: session.userId,
    sessionId: session.id,
    newMessage: userContent,
  })) {
    if (isFinalResponse(event)) {
      const parts = event.content?.parts
      if (parts) {
        reply = parts
          .filter((p): p is { text: string } => 'text' in p && typeof p.text === 'string')
          .map((p) => p.text)
          .join('')
      }
    }
  }

  return reply || 'I was unable to generate a response. Please try again.'
}
