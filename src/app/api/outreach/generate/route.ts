import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId } = await request.json()
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 })

  const [{ data: profile }, { data: contact }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('contacts').select('*').eq('id', contactId).single(),
  ])

  if (!profile || !contact) return NextResponse.json({ error: 'Data not found' }, { status: 404 })

  let resumeContext = ''
  if (profile.resume_summary) {
    try {
      const parsed = JSON.parse(profile.resume_summary)
      resumeContext = `
Student's experience:
${parsed.experience?.map((e: { role: string; company: string; highlights?: string[] }) => `- ${e.role} at ${e.company}: ${e.highlights?.slice(0, 2).join('; ')}`).join('\n') ?? ''}
Key skills: ${parsed.skills?.slice(0, 6).join(', ') ?? ''}
`
    } catch {
      resumeContext = profile.resume_summary
    }
  }

  const prompt = `You are helping a university student write genuine, concise networking outreach messages.

Student info:
- Name: ${profile.name}
- School: ${profile.school}
- Program: ${profile.program}
- Year: ${profile.year}
${resumeContext}

Contact info:
- Name: ${contact.full_name}
- Title: ${contact.title}
- Company: ${contact.company}

Write two messages:
1. A personalized email (subject + body)
2. A LinkedIn connection message

Guidelines:
- Concise and genuine, not salesy or templated
- Reference something specific about their role or company
- End with a specific ask: "Would you be open to a 15-minute coffee chat?"
- Email: 3-4 short paragraphs max
- LinkedIn: under 300 characters

Return JSON:
{
  "email_subject": "...",
  "email_body": "...",
  "linkedin_message": "..."
}`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') return NextResponse.json({ error: 'Generation failed' }, { status: 500 })

  try {
    const parsed = JSON.parse(content.text.replace(/```json\n?|\n?```/g, ''))
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Parse failed', raw: content.text }, { status: 500 })
  }
}
