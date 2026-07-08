import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// Generates personalized GTM outreach for Sonibel Instruments — a hardtech
// startup whose real-time acoustic weld quality-control system cuts weld-defect
// costs ~30% and takes ~2 months off year-long fabrication projects. Targets
// industrial decision-makers (Quality Director, VP Manufacturing, Welding
// Supervisor) at shipbuilders, structural-steel fabricators, and energy firms.
//
// Auth mirrors the rest of the extension API: x-nb-key === EXTENSION_API_KEY.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nb-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

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

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-nb-key')
  if (!process.env.EXTENSION_API_KEY || key !== process.env.EXTENSION_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const {
    name = '',
    title = '',
    company = '',
    profileText = '',
    senderName = '',
    senderTitle = 'Go-To-Market',
  } = (await request.json().catch(() => ({}))) as Record<string, string>

  if (!name && !profileText) {
    return NextResponse.json(
      { error: 'name or profileText required' },
      { status: 400, headers: corsHeaders }
    )
  }

  const prompt = `You write outbound GTM messages for Sonibel Instruments, a hardtech startup.

ABOUT SONIBEL (use naturally, never dump the whole list):
- Product: a real-time acoustic weld quality-control system that inspects welds as they happen.
- Value: cuts weld-defect rework costs by ~30% and takes roughly 2 months off year-long fabrication projects by catching defects in-process instead of via after-the-fact NDT/rework.
- Buyers: industrial quality + manufacturing leaders (Quality Director, VP Manufacturing, Welding Engineer/Supervisor, Operations) at shipbuilders, structural-steel fabricators, and energy firms (pressure vessels, pipelines, offshore).

PERSON YOU'RE WRITING TO (scraped from LinkedIn):
- Name: ${name || '(unknown)'}
- Title: ${title || '(not captured)'}
- Company: ${company || '(not captured)'}
- Raw profile text: ${profileText ? profileText.slice(0, 1800) : '(not captured)'}

SENDER:
- Name: ${senderName || '(unspecified — sign as the Sonibel team)'}
- Role: ${senderTitle || 'Go-To-Market'} at Sonibel Instruments

Infer the person's role, company, and industry from the raw profile text if the structured fields are missing. Anchor the message in something SPECIFIC and real about them — their actual role, company, or the kind of welding/fabrication their company does — never vague filler like "your industry".

Produce 3 outputs:
1. A cold EMAIL: a tight subject line (under 60 chars, no clickbait) and a body of 90–130 words. Lead with a specific, relevant observation; connect Sonibel's value to a pain THIS buyer plausibly owns (rework cost, schedule slip, NDT bottleneck, scrap, audit/quality compliance); one clear soft ask for a 15-min call. Plain-spoken, credible to an engineer — no hype, no exclamation marks, no buzzwords.
2. A SHORT email variant: same idea in 45–60 words for a busy exec.
3. A LINKEDIN message: under 280 characters, warmer and more casual, still specific, ending in a low-friction ask.

Return ONLY JSON, no prose:
{
  "email": { "subject": "...", "body": "..." },
  "emailShort": { "subject": "...", "body": "..." },
  "linkedin": "..."
}`

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    })
    const content = message.content[0]
    if (content.type !== 'text') {
      return NextResponse.json({ error: 'Generation failed' }, { status: 500, headers: corsHeaders })
    }
    const parsed = extractJson(content.text) as {
      email?: { subject?: string; body?: string }
      emailShort?: { subject?: string; body?: string }
      linkedin?: string
    } | null
    if (parsed && (parsed.email || parsed.linkedin)) {
      return NextResponse.json(parsed, { headers: corsHeaders })
    }
    return NextResponse.json(
      { error: 'Parse failed', raw: content.text },
      { status: 500, headers: corsHeaders }
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Generation failed' },
      { status: 500, headers: corsHeaders }
    )
  }
}
