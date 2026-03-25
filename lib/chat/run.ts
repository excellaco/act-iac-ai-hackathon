/**
 * Chat orchestration — runs the ADK agent for a single user turn.
 *
 * Each API request creates a fresh InMemoryRunner and uses runEphemeral,
 * which manages its own throwaway session internally. Conversation history
 * is embedded into the user message content so the agent sees prior turns
 * without needing to reconstruct ADK session events (which would require
 * replaying tool calls). This keeps the API fully stateless.
 *
 * If the first attempt returns an empty response (e.g., due to a transient
 * rate limit from Gemini), a single retry is attempted before returning
 * the fallback message. See #174 for details.
 */

import { InMemoryRunner, isFinalResponse } from '@google/adk'
import { createUserContent, type Content } from '@google/genai'
import { zoningAgent } from './agent'

export interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

const MAX_ATTEMPTS = 2

/** Run the ADK agent once and extract the final text reply (empty string if none). */
async function executeAgent(userContent: Content): Promise<string> {
  const runner = new InMemoryRunner({ agent: zoningAgent })

  let reply = ''
  for await (const event of runner.runEphemeral({
    userId: 'anonymous',
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

  return reply
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

  // Retry once on empty response — transient rate limits from Gemini can
  // cause ADK to end the event loop without producing a final text response.
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const reply = await executeAgent(userContent)
    if (reply) return reply

    if (attempt < MAX_ATTEMPTS) {
      console.warn(`Chat agent returned empty response (attempt ${attempt}/${MAX_ATTEMPTS}), retrying...`)
    }
  }

  return 'I was unable to generate a response. Please try again.'
}
