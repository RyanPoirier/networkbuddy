import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const company = request.nextUrl.searchParams.get('company')
  if (!company) return NextResponse.json({ error: 'company required' }, { status: 400 })

  const apolloKey = process.env.APOLLO_API_KEY
  if (!apolloKey) return NextResponse.json({ contacts: [], source: 'no_api_key' })

  const apolloRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apolloKey,
    },
    body: JSON.stringify({
      q_organization_name: company,
      page: 1,
      per_page: 10,
    }),
  })

  if (!apolloRes.ok) {
    const err = await apolloRes.text()
    return NextResponse.json({ contacts: [], source: 'apollo_error', debug: err })
  }

  const apolloData = await apolloRes.json()
  const people = apolloData.people ?? []

  if (people.length === 0) {
    return NextResponse.json({ contacts: [], source: 'apollo_empty' })
  }

  const contacts = people.filter((p: { name?: string }) => (p.name ?? '').trim()).map((p: {
    name?: string
    title?: string
    organization?: { name?: string; primary_domain?: string }
    email?: string
    linkedin_url?: string
  }) => ({
    full_name: p.name ?? '',
    title: p.title ?? '',
    company: p.organization?.name ?? company,
    domain: p.organization?.primary_domain ?? '',
    email: p.email ?? null,
    linkedin_url: p.linkedin_url ?? null,
    email_verified: false,
    last_verified_at: new Date().toISOString(),
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('contacts')
    .insert(contacts)
    .select()

  return NextResponse.json({ contacts: inserted ?? contacts, source: 'apollo', debug: { insertError, contactCount: contacts.length, apolloPeople: people.length, firstPerson: people[0] ?? null } })
}
