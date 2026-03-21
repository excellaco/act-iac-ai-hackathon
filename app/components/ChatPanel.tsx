'use client'

import { useState, useEffect, useRef } from 'react'
import { sendChatMessage } from '../../lib/apiClient'
import styles from './ChatPanel.module.css'

interface ChatPanelProps {
  jurisdictionId: string
  jurisdictionName: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPanel({ jurisdictionId, jurisdictionName }: ChatPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Clear conversation when jurisdiction changes
  useEffect(() => {
    setMessages([])
    setInput('')
    setError(null)
    setLoading(false)
  }, [jurisdictionId])

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const trimmed = input.trim()
    if (!trimmed || loading) return

    const userMessage: Message = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setError(null)
    setLoading(true)

    // Build history for the API — map 'assistant' to 'model' for Gemini
    const history = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      content: m.content,
    }))

    try {
      const { reply } = await sendChatMessage(jurisdictionId, trimmed, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unable to reach assistant. Try again.'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className={styles.chatSection}>
      <div
        className={styles.chatHeader}
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Toggle chat panel"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setExpanded((prev) => !prev)
          }
        }}
      >
        <div className={styles.chatHeaderLeft}>
          <span className={styles.chatTitle}>
            Ask about {jurisdictionName}
          </span>
          <span className={styles.chatSubtitle}>
            Chat with an AI assistant about zoning regulations
          </span>
        </div>
        <span className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}>
          ›
        </span>
      </div>

      {expanded && (
        <div className={styles.chatBody}>
          <div className={styles.messages} role="log" aria-label="Chat messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.message} ${
                  msg.role === 'user' ? styles.messageUser : styles.messageAssistant
                }`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className={styles.loading} aria-label="Loading response">
                Thinking<span className={styles.loadingDots} />
              </div>
            )}
            {error && (
              <div className={styles.errorMessage} role="alert">
                {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className={styles.inputRow}>
            <input
              className={styles.input}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this jurisdiction's zoning regulations…"
              disabled={loading}
              aria-label="Chat message input"
            />
            <button
              className={styles.sendButton}
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send message"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
