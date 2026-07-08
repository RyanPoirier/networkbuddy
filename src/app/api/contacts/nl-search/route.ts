import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

// Parse a natural-language query into Apollo search filters.
interface ApolloFilters {
  q_organization_name?: string | null
  person_titles?: string[] | null
  person_locations?: string[] | null
  organization_num_employees_ranges?: string[] | null
  q_keywords?: string | null
}

function extractJson(raw: string): ApolloFilters | null {
  const stripped = raw.replace(/```json\n?|\n?```/g, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    const s = stripped.indexOf('{')
    const e = stripped.lastIndexOf('}')
    if (s !== -1 && e > s) {
      try {
        return JSON.parse(stripped.slice(s, e + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { query } = await request.json()
  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  const apolloKey = process.env.APOLLO_API_KEY
  if (!apolloKey) return NextResponse.json({ contacts: [], source: 'no_api_key' })

  // 1. Claude turns the natural-language query into Apollo filters.
  const prompt = `You convert a natural-language people-search query into Apollo API filters.

Query: "${query}"

Return ONLY JSON with these optional fields (omit or null when not implied):
{
  "q_organization_name": string | null,        // a SPECIFIC company name if named (e.g. "RBC"), else null
  "person_titles": string[] | null,            // job titles/roles, e.g. ["Investment Banking Analyst"]
  "person_locations": string[] | null,         // e.g. ["Vancouver, Canada"] — expand cities to "City, Country"
  "organization_num_employees_ranges": string[] | null, // company-size hints as "min,max" strings
  "q_keywords": string | null                  // any leftover free-text keywords
}

Rules:
- "boutique", "small", "startup" firms -> organization_num_employees_ranges like ["1,10","11,50","51,200"].
- "mid-size" -> ["201,500","501,1000"]. "large"/"enterprise" -> ["1001,5000","5001,10000","10001,50000"].
- Only set q_organization_name when a real company is named; do NOT put "boutique firms" there.
- Normalize titles to how they appear on LinkedIn (e.g. "asset management" -> "Asset Management Analyst" is too specific; prefer the role phrase they used, e.g. "Asset Management").
- Keep it minimal and accurate.`

  const client = new Anthropic()
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })
  const content = message.content[0]
  const filters = content.type === 'text' ? extractJson(content.text) : null
  if (!filters) {
    return NextResponse.json({ contacts: [], source: 'parse_failed' })
  }

  // 2. Build the Apollo request body from the parsed filters.
  const body: Record<string, unknown> = { page: 1, per_page: 10 }
  if (filters.q_organization_name) body.q_organization_name = filters.q_organization_name
  if (filters.person_titles?.length) body.person_titles = filters.person_titles
  if (filters.person_locations?.length) body.person_locations = filters.person_locations
  if (filters.organization_num_employees_ranges?.length)
    body.organization_num_employees_ranges = filters.organization_num_employees_ranges
  if (filters.q_keywords) body.q_keywords = filters.q_keywords

  const apolloRes = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
    body: JSON.stringify(body),
  })

  if (!apolloRes.ok) {
    const err = await apolloRes.text()
    return NextResponse.json({ contacts: [], source: 'apollo_error', debug: err, filters })
  }

  const apolloData = await apolloRes.json()
  const people = apolloData.people ?? []
  if (people.length === 0) {
    return NextResponse.json({ contacts: [], source: 'apollo_empty', filters })
  }

  const contacts = people
    .filter((p: { first_name?: string }) => (p.first_name ?? '').trim())
    .map((p: {
      first_name?: string
      last_name?: string
      last_name_obfuscated?: string
      name?: string
      title?: string
      organization?: { name?: string; primary_domain?: string }
      email?: string
      linkedin_url?: string
    }) => ({
      user_id: user.id,
      full_name: p.name ?? `${p.first_name ?? ''} ${p.last_name ?? p.last_name_obfuscated ?? ''}`.trim(),
      title: p.title ?? '',
      company: p.organization?.name ?? '',
      domain: p.organization?.primary_domain ?? '',
      email: p.email ?? null,
      linkedin_url: p.linkedin_url ?? null,
      email_verified: false,
      last_verified_at: new Date().toISOString(),
    }))

  const { data: inserted } = await supabase.from('contacts').insert(contacts).select()

  return NextResponse.json({ contacts: inserted ?? contacts, source: 'apollo', filters })
}
