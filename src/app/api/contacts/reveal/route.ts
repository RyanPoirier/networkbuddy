import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsage, consumeReveals } from '@/lib/quota'
import { verifyEmail, findEmail } from '@/lib/providers/hunter'

// Reveal a single person: spends one quota credit, enriches via Apollo, saves
// the contact. This is the only place a credit is consumed.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { apolloId, title = '', company = '', domain = '' } = await request.json()
  if (!apolloId) return NextResponse.json({ error: 'apolloId required' }, { status: 400 })

  const apolloKey = process.env.APOLLO_API_KEY
  if (!apolloKey) return NextResponse.json({ error: 'no_api_key' }, { status: 500 })

  // Quota gate.
  const usage = await getUsage(user.id)
  if (usage.remaining <= 0) {
    return NextResponse.json({
      error: 'quota_exceeded',
      usage: { plan: usage.plan, used: usage.used, quota: usage.quota },
    }, { status: 402 })
  }

  // Enrich the single person by Apollo id.
  const r = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
    body: JSON.stringify({ id: apolloId }),
  })
  if (!r.ok) {
    return NextResponse.json({ error: 'reveal_failed' }, { status: 502 })
  }
  const data = await r.json()
  const p = data.person ?? {}

  const fullName = p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  const resolvedDomain = p.organization?.primary_domain ?? domain
  const resolvedCompany = p.organization?.name ?? company
  let email: string | null = p.email ?? null
  let emailVerified = false
  let emailStatus: string | null = null

  // Reliability layer (Hunter): verify Apollo's email is deliverable, or find
  // one if Apollo returned none. Makes every revealed contact trustworthy.
  if (email) {
    const v = await verifyEmail(email)
    if (v) { emailVerified = v.verified; emailStatus = v.result }
  } else {
    const found = await findEmail(fullName, resolvedDomain, resolvedCompany)
    if (found) { email = found.email; emailVerified = found.verified; emailStatus = found.result }
  }

  const contact = {
    user_id: user.id,
    full_name: fullName,
    title: p.title ?? title,
    company: resolvedCompany,
    domain: resolvedDomain,
    email,
    linkedin_url: p.linkedin_url ?? null,
    email_verified: emailVerified,
    last_verified_at: new Date().toISOString(),
  }

  const { data: inserted } = await supabase.from('contacts').insert(contact).select().single()

  // Spend the credit only after a successful reveal.
  await consumeReveals(user.id, 1)

  return NextResponse.json({
    contact: inserted ?? contact,
    emailStatus,
    usage: { plan: usage.plan, used: usage.used + 1, quota: usage.quota },
  })
}
