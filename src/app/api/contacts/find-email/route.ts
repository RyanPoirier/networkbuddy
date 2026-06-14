import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return NextResponse.json({ error: 'no hunter key' }, { status: 500 })

  const { contactId, fullName, domain: rawDomain, company } = await request.json()
  if (!fullName) return NextResponse.json({ error: 'fullName required' }, { status: 400 })

  let domain = rawDomain

  const firstName = fullName.trim().split(' ')[0].toLowerCase()

  // Hunter domain search — accepts domain or company name, returns emails + LinkedIn URLs
  const searchParam = domain
    ? `domain=${encodeURIComponent(domain)}`
    : company
    ? `company=${encodeURIComponent(company)}`
    : null

  if (!searchParam) return NextResponse.json({ email: null, linkedin_url: null })

  const res = await fetch(
    `https://api.hunter.io/v2/domain-search?${searchParam}&api_key=${hunterKey}&limit=100`
  )

  if (!res.ok) return NextResponse.json({ email: null, linkedin_url: null })

  const data = await res.json()
  const hunterContacts: Array<{ first_name?: string; email?: string; linkedin?: string; confidence?: number }> = data.data?.emails ?? []

  // Match by first name
  const match = hunterContacts.find(c => (c.first_name ?? '').toLowerCase() === firstName)

  const email = match?.email ?? null
  const linkedin_url = match?.linkedin ?? null
  const score = match?.confidence ?? 0

  if (contactId && (email || linkedin_url)) {
    await supabase
      .from('contacts')
      .update({
        ...(email ? { email, email_verified: score >= 90 } : {}),
        ...(linkedin_url ? { linkedin_url } : {}),
      })
      .eq('id', contactId)
  }

  return NextResponse.json({ email, linkedin_url, score })
}
