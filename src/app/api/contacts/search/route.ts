import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = request.nextUrl.searchParams.get('company')
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  // Check cache first
  const { data: cached } = await supabase
    .from('contacts')
    .select('*')
    .ilike('company', company)
    .order('created_at', { ascending: false })

  if (cached && cached.length > 0) {
    return NextResponse.json({ contacts: cached, source: 'cache' })
  }

  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return NextResponse.json({ contacts: [], source: 'no_api_key' })

  // If input looks like a domain use it directly, otherwise use company name
  const looksLikeDomain = company.includes('.')
  const searchParam = looksLikeDomain
    ? `domain=${encodeURIComponent(company.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim())}`
    : `company=${encodeURIComponent(company)}`

  const domainRes = await fetch(
    `https://api.hunter.io/v2/domain-search?${searchParam}&limit=10&api_key=${hunterKey}`
  )

  if (!domainRes.ok) {
    return NextResponse.json({ contacts: [], source: 'hunter_error' })
  }

  const hunterData = await domainRes.json()
  const emails = hunterData.data?.emails ?? []
  const hunterDomain = hunterData.data?.domain ?? ''
  const hunterCompany = hunterData.data?.organization ?? company

  if (emails.length === 0) {
    return NextResponse.json({ contacts: [], source: 'hunter_empty' })
  }

  const contacts = emails.filter((e: { first_name?: string; last_name?: string }) =>
    (e.first_name ?? '').trim() || (e.last_name ?? '').trim()
  ).map((e: {
    first_name?: string
    last_name?: string
    position?: string
    value?: string
    linkedin?: string
    confidence?: number
  }) => ({
    full_name: `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim(),
    title: e.position ?? '',
    company: hunterCompany,
    domain: hunterDomain,
    email: e.value ?? null,
    linkedin_url: e.linkedin ?? null,
    email_verified: (e.confidence ?? 0) >= 90,
    last_verified_at: new Date().toISOString(),
  }))

  const { data: inserted } = await supabase
    .from('contacts')
    .insert(contacts)
    .select()

  return NextResponse.json({ contacts: inserted ?? contacts, source: 'hunter' })
}
