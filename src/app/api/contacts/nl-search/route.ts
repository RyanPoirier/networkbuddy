import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getUsage, isPremium } from '@/lib/quota'
import { searchAll, configuredProviders, SearchFilters, ProviderName } from '@/lib/providers'

function extractJson(raw: string): SearchFilters | null {
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

  const { query, sources: requestedSources } = await request.json()
  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'query required' }, { status: 400 })
  }

  const thisYear = new Date().getFullYear()

  // 1. Claude turns the natural-language query into structured filters.
  const prompt = `You convert a natural-language people-search query into structured filters.
The current year is ${thisYear}.

Query: "${query}"

Return ONLY JSON with these optional fields (omit or null when not implied):
{
  "q_organization_name": string | null,        // a SPECIFIC current company if named (e.g. "RBC")
  "person_titles": string[] | null,            // current job titles/roles
  "person_locations": string[] | null,         // e.g. ["Vancouver, Canada"] — expand cities to "City, Country"
  "organization_num_employees_ranges": string[] | null, // company-size hints as "min,max"
  "industries": string[] | null,               // pick 1-3 EXACT names from the allowed list below, or null
  "early_stage": boolean | null,               // true only for startup / early-stage intent
  "q_keywords": string | null,                 // leftover free-text (almost always null)
  "past_company": string | null,               // a company the person USED TO work at ("interned at BCG", "ex-Google")
  "past_title": string | null,                 // a past role keyword ("intern", "analyst")
  "intern": boolean | null,                     // true if about interns / internships / co-ops
  "experience_year": number | null,             // year of the experience ("last year" -> ${thisYear - 1}, "in 2024" -> 2024)
  "person_name": string | null                  // a specific person's name if the query names one
}

Allowed industry names (EXACT strings only, else null):
computer software, internet, information technology & services, financial services, management consulting, marketing & advertising, real estate, hospital & health care, health, wellness & fitness, retail, consumer services, education management, food & beverages, restaurants, design, accounting, hospitality, automotive, construction, events services

Rules:
- "boutique"/"small"/"startup" -> organization_num_employees_ranges ["1,10","11,50"]. "startup" ALSO sets early_stage:true and (unless another industry is named) industries ["computer software","internet","information technology & services"].
- Map sector words to the allowed list: "finance"/"investment"/"banking"/"asset management" -> "financial services"; "consulting" -> "management consulting"; "healthcare"/"hospital" -> "hospital & health care"; "marketing"/"advertising"/"agency" -> "marketing & advertising". No clean map -> null.
- PAST/HISTORY intent (this is important): "interned at X" / "was an X at Y" / "ex-Y" / "previously/formerly at Y" / "used to work at Y" -> set past_company (and/or past_title). "intern"/"internship"/"co-op" -> intern:true. "last year" -> experience_year ${thisYear - 1}; "this summer"/"currently" is NOT past.
- If a specific person is named (e.g. "Alice Mandlis"), set person_name to their full name.
- Only set q_organization_name for a real CURRENT company; use past_company for former employers.
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
    return NextResponse.json({ rows: [], source: 'parse_failed' })
  }

  const usage = await getUsage(user.id)
  const isPro = isPremium(usage.plan) // pro or unlimited (god mode)

  // 2. Source policy + premium gate.
  //  - Apollo always runs (cheap browse).
  //  - History Search (PDL) — "past interns / ex-company / by-name" — is a Pro
  //    feature. Free users still get Apollo's current-role results, plus a flag
  //    to show the upsell.
  //  - Coresignal is a coverage fallback that only fires when Apollo is thin.
  const historyIntent = Boolean(
    filters.past_company || filters.past_title || filters.intern ||
    filters.experience_year || filters.person_name
  )
  const premiumLocked = historyIntent && !isPro

  let sources: ProviderName[]
  if (Array.isArray(requestedSources) && requestedSources.length) {
    // Explicit request (e.g. an "all sources" button) — but never PDL for free.
    sources = requestedSources.filter((s: ProviderName) => s !== 'pdl' || isPro)
  } else {
    sources = ['apollo']
    if (historyIntent && isPro) sources.push('pdl')
  }

  const { rows, sourcesQueried, errors } = await searchAll(filters, {
    sources,
    fallbackSources: ['coresignal'], // coverage backfill when Apollo is thin
    minResults: 5,
    limit: 10,
  })

  // Honest filter echo: location isn't applied as a hard filter when a company
  // is named (Apollo's city data is too sparse), so don't advertise it.
  const locationApplied = Boolean(filters.person_locations?.length && !filters.q_organization_name)
  const appliedFilters = { ...filters, person_locations: locationApplied ? filters.person_locations : null }

  return NextResponse.json({
    rows,
    filters: appliedFilters,
    premiumLocked,
    sources: { queried: sourcesQueried, errors, configured: configuredProviders() },
    usage: { plan: usage.plan, used: usage.used, quota: usage.quota },
  })
}
