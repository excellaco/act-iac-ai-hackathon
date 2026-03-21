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

  const history = (body.history ?? []).map((h) => ({
    role: h.role as 'user' | 'model',
    content: h.content,
  }))

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
