import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, fullName, domain: rawDomain, company } = await request.json()
  if (!fullName) return NextResponse.json({ error: 'fullName required' }, { status: 400 })

  let domain = rawDomain

  // If no domain, resolve it from company name via Hunter
  if (!domain && company) {
    const enrichRes = await fetch(
      `https://api.hunter.io/v2/companies/find?name=${encodeURIComponent(company)}&api_key=${hunterKey}`
    )
    if (enrichRes.ok) {
      const enrichData = await enrichRes.json()
      domain = enrichData.data?.domain ?? ''
    }
  }

  if (!domain) return NextResponse.json({ email: null, linkedin_url: null })

  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return NextResponse.json({ error: 'no hunter key' }, { status: 500 })

  const firstName = fullName.trim().split(' ')[0].toLowerCase()

  // Hunter domain search — returns emails + LinkedIn URLs for contacts at this domain
  const res = await fetch(
    `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${hunterKey}&limit=100`
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
