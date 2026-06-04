import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const text = await file.text()

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract a concise professional summary from this resume. Return a JSON object with these fields:
- summary: 2-3 sentence professional summary
- experience: array of { company, role, duration, highlights[] }
- skills: array of strings
- education: { school, degree, year }

Resume text:
${text}

Return only valid JSON.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') return NextResponse.json({ summary: null })

  try {
    const parsed = JSON.parse(content.text.replace(/```json\n?|\n?```/g, ''))
    return NextResponse.json({ summary: JSON.stringify(parsed) })
  } catch {
    return NextResponse.json({ summary: content.text })
  }
}
