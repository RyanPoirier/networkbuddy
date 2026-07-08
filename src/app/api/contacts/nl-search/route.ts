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
- "boutique", "small", "startup" firms -> organization_num_employees_ranges like ["1,10","11,50","51,200"]. NEVER put these words anywhere else.
- "mid-size" -> ["201,500","501,1000"]. "large"/"enterprise" -> ["1001,5000","5001,10000","10001,50000"].
- Only set q_organization_name when a real company is named; do NOT put "boutique firms" there.
- person_titles: give a few sensible variants of the role (e.g. ["Asset Management","Investment Analyst","Portfolio Manager"]). Keep them realistic, not hyper-specific.
- q_keywords: almost always null. Apollo matches it against literal profile text, so it over-filters badly. Only set it if there are NO titles and NO company — never duplicate the role or put qualitative words like "boutique" in it.
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
  // q_keywords over-filters hard (it matches literal profile text), so only use
  // it as a last resort when we have no titles and no company to search on.
  if (filters.q_keywords && !filters.person_titles?.length && !filters.q_organization_name) {
    body.q_keywords = filters.q_keywords
  }

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
  interface ApolloPerson {
    id?: string
    first_name?: string
    last_name?: string
    last_name_obfuscated?: string
    name?: string
    title?: string
    organization?: { name?: string; primary_domain?: string }
    email?: string
    linkedin_url?: string
  }
  const people: ApolloPerson[] = (apolloData.people ?? []).filter(
    (p: ApolloPerson) => (p.first_name ?? p.name ?? '').trim()
  )
  if (people.length === 0) {
    return NextResponse.json({ contacts: [], source: 'apollo_empty', filters })
  }

  // Reveal real names/emails/LinkedIn via People Enrichment (search obfuscates
  // last names on the Basic plan). One credit per person — done in parallel.
  const revealed: ApolloPerson[] = await Promise.all(
    people.map(async (p) => {
      if (!p.id) return p
      try {
        const r = await fetch('https://api.apollo.io/api/v1/people/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
          body: JSON.stringify({ id: p.id }),
        })
        if (r.ok) {
          const d = await r.json()
          return (d.person as ApolloPerson) ?? p
        }
      } catch {}
      return p
    })
  )

  const contacts = revealed.map((p) => ({
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
