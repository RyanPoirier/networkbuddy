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
    topCardText = '',
    studentName = '',
    studentSchool = '',
    studentProgram = '',
    studentBackground = '',
  } = await request.json()

  if (!name) {
    return NextResponse.json({ error: 'name required' }, { status: 400, headers: corsHeaders })
  }

  const prompt = `You are helping a university student write LinkedIn connection request notes to a professional they want to network with for a potential referral.

Student (the person sending the message):
- Name: ${studentName || '(unspecified)'}
- School: ${studentSchool || '(unspecified)'}
- Program: ${studentProgram || '(unspecified)'}
${studentBackground ? `- Background / resume:\n${studentBackground.slice(0, 1500)}` : ''}

Person they're reaching out to (scraped from their LinkedIn profile):
- Name: ${name}
- Headline: ${headline || '(not captured)'}
- Company: ${company || '(not captured)'}
- About: ${about ? about.slice(0, 600) : '(not captured)'}
- Raw profile top-card text: ${topCardText || '(not captured)'}

Use the raw top-card text to infer their role, company, school, or focus if the structured fields above are missing.

Write 3 distinct LinkedIn connection request notes. Each must:
- Be under 300 characters (LinkedIn's hard limit)
- Reference something SPECIFIC about this person (their actual role, company, school, or field) — never vague filler like "your field" or "your industry"
- Where natural, tie in a relevant detail from the student's own background (shared school, similar interest, relevant experience) so it reads as a genuine two-way connection
- Sound genuine and human, not templated or salesy
- End with a soft ask to connect or chat briefly
- Vary in angle: one curious/learning-focused, one shared-background, one direct-and-warm

If you genuinely cannot determine anything specific about the person, still write warm notes but reference whatever concrete detail is available (their name, school, location).

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

  // Extract the JSON object even if Claude wraps it in prose or code fences.
  function extractJson(raw: string): unknown | null {
    const stripped = raw.replace(/```json\n?|\n?```/g, '').trim()
    try {
      return JSON.parse(stripped)
    } catch {
      const start = stripped.indexOf('{')
      const end = stripped.lastIndexOf('}')
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(stripped.slice(start, end + 1))
        } catch {
          return null
        }
      }
      return null
    }
  }

  const parsed = extractJson(content.text) as { drafts?: string[] } | null
  if (parsed && Array.isArray(parsed.drafts)) {
    return NextResponse.json(parsed, { headers: corsHeaders })
  }
  return NextResponse.json({ error: 'Parse failed', raw: content.text }, { status: 500, headers: corsHeaders })
}
