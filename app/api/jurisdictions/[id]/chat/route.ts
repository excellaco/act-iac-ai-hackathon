import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/db/client'
import { jurisdictions } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runChat } from '@/lib/chat/run'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: { message?: string; history?: Array<{ role: string; content: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!message) {
    return NextResponse.json(
      { error: 'Message is required and must be non-empty' },
      { status: 400 },
    )
  }

  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(jurisdictions.id, id),
  })

  if (!jurisdiction) {
    return NextResponse.json({ error: 'Jurisdiction not found' }, { status: 404 })
  }

  const MAX_HISTORY_TURNS = 20
  const MAX_HISTORY_CHARS = 8000

  const rawHistory = Array.isArray(body.history) ? body.history : []
  const sanitizedHistory: Array<{ role: 'user' | 'model'; content: string }> = []

  let totalChars = message.length

  for (const h of rawHistory) {
    if (!h || typeof h !== 'object') continue

    const role = (h as { role?: unknown }).role
    const content = (h as { content?: unknown }).content

    if (role !== 'user' && role !== 'model') continue
    if (typeof content !== 'string') continue

    if (sanitizedHistory.length >= MAX_HISTORY_TURNS) break

    totalChars += content.length
    if (totalChars > MAX_HISTORY_CHARS) break

    sanitizedHistory.push({ role, content })
  }

  try {
    const reply = await runChat(id, message, sanitizedHistory)
    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Chat agent error:', err)
    return NextResponse.json(
      { error: 'Unable to reach assistant. Try again.' },
      { status: 500 },
    )
  }
}
