import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getUsage, isPremium } from '@/lib/quota'
import { searchAll, configuredProviders, SearchFilters, ProviderName, MergedPerson } from '@/lib/providers'

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

// Real-time relevance gate. After the providers return, a fast model reads the
// original query against each candidate (title — company (location)) and keeps
// only the ones that genuinely match the intent, best-first. Keyword rules
// can't tell that "Argyle Cancer Formula @ Rural Doctors Association of
// Australia" isn't a BC cancer researcher — a model can. It prunes and reranks,
// but never zeroes out the page (a model hiccup falls back to the raw set).
async function judgeRelevance(
  client: Anthropic,
  query: string,
  rows: MergedPerson[],
): Promise<{ rows: MergedPerson[]; removed: number; dropped: MergedPerson[] }> {
  if (rows.length < 2) return { rows, removed: 0, dropped: [] }

  const candidates = rows
    .map((r, i) => `${i}. ${r.title || 'Unknown title'} — ${r.company || 'Unknown company'}${r.location ? ` (${r.location})` : ''}`)
    .join('\n')

  const prompt = `A user is searching for people and typed: "${query}".
Below are candidate results, one per line as "index. job title — company (location)".
Decide which candidates GENUINELY match the search intent (role, field/industry, seniority, and location if the query names one).
Be inclusive of real matches even when the title is worded differently — "Research Scientist @ BC Cancer" DOES match "cancer researcher"; "Staff Engineer" matches "software engineer". Only drop CLEAR mismatches: wrong role/field, obvious junk, or wrong location when a place was requested.

Return ONLY JSON: {"keep":[indexes that match, most relevant first]}.

Candidates:
${candidates}`

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const txt = msg.content[0]?.type === 'text' ? msg.content[0].text : ''
    const match = txt.match(/\{[\s\S]*\}/)
    if (!match) return { rows, removed: 0, dropped: [] }
    const keep = (JSON.parse(match[0]) as { keep?: unknown }).keep
    if (!Array.isArray(keep)) return { rows, removed: 0, dropped: [] }

    const keepSet = new Set(
      keep.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < rows.length),
    )
    const picked = [...keepSet].map((i) => rows[i])

    // Safety net: the judge may prune but not empty the page (guards against an
    // over-strict or malformed response showing nothing on a valid search).
    if (!picked.length) return { rows, removed: 0, dropped: [] }
    const dropped = rows.filter((_, i) => !keepSet.has(i))
    return { rows: picked, removed: dropped.length, dropped }
  } catch {
    return { rows, removed: 0, dropped: [] }
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

  // Semantic providers (Exa) search the user's original words, not the parsed
  // filters — "IB analysts" carries meaning the structured fields lose.
  filters.raw_query = query

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
    // Exa is the semantic discovery engine (skipped automatically when its key
    // isn't set); Apollo rides along for masked rows that carry an apolloId,
    // which is what powers 1-credit email reveals.
    sources = ['apollo', 'exa']
    if (historyIntent && isPro) sources.push('pdl')
  }

  const searchOpts = {
    sources,
    fallbackSources: ['coresignal'] as ProviderName[], // coverage backfill when Apollo is thin
    minResults: 5,
    limit: 50,
  }
  let { rows, sourcesQueried, errors } = await searchAll(filters, searchOpts)
  let effectiveFilters: SearchFilters = filters

  // Progressive relaxation: "soft" qualifiers (startup/early-stage, industry,
  // company size, stray keywords) are easy to over-constrain — e.g. "startup GTM
  // engineers in bc" stacks a funding-stage + size + industry filter that Apollo
  // has no data to satisfy, returning 0 even though real GTM engineers exist. If
  // the constrained search is empty, drop those soft filters and retry on the
  // core intent (title + location + company). Hard filters are never dropped.
  const SOFT_KEYS: (keyof SearchFilters)[] = [
    'industries', 'early_stage', 'organization_num_employees_ranges', 'q_keywords',
  ]
  const hasSoft = SOFT_KEYS.some((k) => {
    const v = filters[k]
    return Array.isArray(v) ? v.length > 0 : v != null
  })
  if (!rows.length && hasSoft) {
    const relaxed: SearchFilters = { ...filters }
    for (const k of SOFT_KEYS) delete relaxed[k]
    const retry = await searchAll(relaxed, searchOpts)
    if (retry.rows.length) {
      rows = retry.rows
      sourcesQueried = retry.sourcesQueried
      errors = retry.errors
      effectiveFilters = relaxed
    }
  }

  // Real-time AI relevance gate: vet the results against the query before the
  // user sees them, dropping clear mismatches and reranking best-first.
  const vetted = await judgeRelevance(client, query, rows)
  rows = vetted.rows

  // Honest filter echo: reflect what was actually applied (relaxation may have
  // dropped the soft filters), and don't advertise location as a hard filter
  // when a company is named (Apollo's city data is too sparse).
  const locationApplied = Boolean(effectiveFilters.person_locations?.length && !effectiveFilters.q_organization_name)
  const appliedFilters = { ...effectiveFilters, person_locations: locationApplied ? effectiveFilters.person_locations : null }

  return NextResponse.json({
    rows,
    filters: appliedFilters,
    premiumLocked,
    vetted: { removed: vetted.removed, dropped: vetted.dropped },
    sources: { queried: sourcesQueried, errors, configured: configuredProviders() },
    usage: { plan: usage.plan, used: usage.used, quota: usage.quota },
  })
}
