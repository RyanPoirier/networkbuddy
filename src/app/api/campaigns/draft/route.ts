import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// Batch-generate a genuinely personalized message per contact in ONE Claude
// call. The personalization uses each contact's real background + the student's
// — that specificity is the whole point (a template blast is what we avoid).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactIds } = (await request.json()) as { contactIds: string[] }
  if (!contactIds?.length) return NextResponse.json({ error: 'contactIds required' }, { status: 400 })

  const [{ data: profile }, { data: contacts }] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('contacts').select('*').eq('user_id', user.id).in('id', contactIds),
  ])
  if (!profile || !contacts?.length) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const withEmail = contacts.filter((c) => c.email)
  if (!withEmail.length) return NextResponse.json({ drafts: [], note: 'no contacts have emails' })

  let resumeContext = ''
  if (profile.resume_summary) {
    try {
      const p = JSON.parse(profile.resume_summary)
      resumeContext = `Experience: ${(p.experience ?? []).map((e: { role: string; company: string }) => `${e.role}@${e.company}`).join(', ')}. Skills: ${(p.skills ?? []).slice(0, 6).join(', ')}.`
    } catch { resumeContext = String(profile.resume_summary).slice(0, 400) }
  }

  const prompt = `Write short, genuine networking emails for a student reaching out to professionals for a coffee chat / advice. One email per contact.

STUDENT: ${profile.name}, ${profile.year ?? ''} ${profile.program ?? ''} at ${profile.school ?? ''}. ${resumeContext}

CONTACTS (write one email to each, referencing something SPECIFIC and true about their role/company vs the student's goals — no generic flattery, no "I came across your profile"):
${withEmail.map((c) => `- id=${c.id} | ${c.full_name} — ${c.title} at ${c.company}`).join('\n')}

Rules: 3-5 sentences, warm and specific, ask for a brief 15-min chat, sign as the student's first name. Subject line short and human (no "Networking Opportunity").
Return ONLY a JSON array: [{"contactId":"<id>","subject":"...","body":"..."}]`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text : '[]'
  let parsed: { contactId: string; subject: string; body: string }[] = []
  try {
    const s = text.indexOf('['), e = text.lastIndexOf(']')
    parsed = JSON.parse(text.slice(s, e + 1))
  } catch {
    return NextResponse.json({ error: 'draft_parse_failed' }, { status: 502 })
  }

  const byId = new Map(withEmail.map((c) => [c.id, c]))
  const drafts = parsed
    .filter((d) => byId.has(d.contactId))
    .map((d) => ({
      contactId: d.contactId,
      name: byId.get(d.contactId)!.full_name,
      company: byId.get(d.contactId)!.company,
      toEmail: byId.get(d.contactId)!.email as string,
      subject: d.subject,
      body: d.body,
    }))

  return NextResponse.json({ drafts })
}
