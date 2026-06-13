import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// CORS so the Chrome extension can call this endpoint.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nb-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  // Demo auth: shared secret. Replace with per-user auth before public launch.
  const key = request.headers.get('x-nb-key')
  if (!process.env.EXTENSION_API_KEY || key !== process.env.EXTENSION_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const {
    name = '',
    headline = '',
    company = '',
    about = '',
    studentName = '',
    studentSchool = '',
    studentProgram = '',
  } = await request.json()

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400, headers: corsHeaders })
  }

  const prompt = `You are helping a university student write LinkedIn connection request notes to a professional they want to network with for a potential referral.

Student:
- Name: ${studentName || '(unspecified)'}
- School: ${studentSchool || '(unspecified)'}
- Program: ${studentProgram || '(unspecified)'}

Person they're reaching out to (from their LinkedIn profile):
- Name: ${name}
- Headline: ${headline}
- Company: ${company}
- About: ${about.slice(0, 600)}

Write 3 distinct LinkedIn connection request notes. Each must:
- Be under 300 characters (LinkedIn's hard limit)
- Reference something specific about this person's role or company
- Sound genuine and human, not templated or salesy
- End with a soft ask to connect or chat briefly
- Vary in angle: e.g. one curious/learning-focused, one shared-background, one direct-and-warm

Return ONLY JSON:
{ "drafts": ["...", "...", "..."] }`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    return NextResponse.json({ error: 'Generation failed' }, { status: 500, headers: corsHeaders })
  }

  try {
    const parsed = JSON.parse(content.text.replace(/```json\n?|\n?```/g, ''))
    return NextResponse.json(parsed, { headers: corsHeaders })
  } catch {
    return NextResponse.json({ error: 'Parse failed', raw: content.text }, { status: 500, headers: corsHeaders })
  }
}
