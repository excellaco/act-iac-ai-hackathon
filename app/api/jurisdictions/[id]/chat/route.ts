import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runChat } from '@/lib/chat/run'

const MAX_MESSAGE_LENGTH = 4000
const MAX_HISTORY_TURNS = 20
const MAX_HISTORY_CHARS = 8000

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { message?: string; history?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return NextResponse.json(
      { error: 'Message is required and must be non-empty' },
      { status: 400 },
    )
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer` },
      { status: 400 },
    )
  }

  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(jurisdictions.id, id),
  })

  if (!jurisdiction) {
    return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 })
  }

  // Sanitize history: only accept valid role/content pairs, bounded by turns and size
  const rawHistory = Array.isArray(body.history) ? body.history : []
  const history: Array<{ role: 'user' | 'model'; content: string }> = []
  let totalChars = 0

  for (const h of rawHistory) {
    if (!h || typeof h !== 'object') continue

    const entry = h as { role?: unknown; content?: unknown }
    if (entry.role !== 'user' && entry.role !== 'model') continue
    if (typeof entry.content !== 'string') continue

    if (history.length >= MAX_HISTORY_TURNS) break
    totalChars += entry.content.length
    if (totalChars > MAX_HISTORY_CHARS) break

    history.push({ role: entry.role, content: entry.content })
  }

  try {
    const reply = await runChat(id, message, history)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Chat agent error:', err)
    return NextResponse.json(
      { error: 'Unable to reach assistant. Try again.' },
      { status: 500 },
    )
  }
}
