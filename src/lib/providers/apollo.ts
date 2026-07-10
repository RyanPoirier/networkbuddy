import { PeopleProvider, ProviderPerson, SearchFilters } from './types'

// Verified Apollo linkedin_industry tag IDs (resolved live from Apollo's tag
// endpoint — do NOT guess these; a wrong ID is silently ignored and returns
// off-topic results). The parser picks names from this list; we map them here.
const INDUSTRY_TAGS: Record<string, string> = {
  'computer software': '5567cd4e7369643b70010000',
  'internet': '5567cd4d736964397e020000',
  'information technology & services': '5567cd4773696439b10b0000',
  'financial services': '5567cdd67369643e64020000',
  'management consulting': '5567cdd47369643dbf260000',
  'marketing & advertising': '5567cd467369644d39040000',
  'real estate': '5567cd477369645401010000',
  'hospital & health care': '5567cdde73696439812c0000',
  'health, wellness & fitness': '5567cddb7369644d250c0000',
  'retail': '5567ced173696450cb580000',
  'consumer services': '5567d1127261697f2b1d0000',
  'education management': '5567ce9e736964540d540000',
  'food & beverages': '5567ce1e7369643b806a0000',
  'restaurants': '5567e0e0736964198de70700',
  'design': '5567cdbc73696439d90b0000',
  'accounting': '5567ce1f7369643b78570000',
  'hospitality': '5567ce9d7369643bc19c0000',
  'automotive': '5567cdf27369644cfd800000',
  'construction': '5567cd4773696439dd350000',
  'events services': '5567cd8e7369645409450000',
}

const EARLY_STAGE_FUNDING = ['Seed', 'Series A', 'Series B']

interface ApolloPerson {
  id?: string
  first_name?: string
  last_name?: string
  last_name_obfuscated?: string
  name?: string
  title?: string
  city?: string
  state?: string
  country?: string
  linkedin_url?: string
  organization?: { name?: string; primary_domain?: string }
}

// Apollo indexes people by their PRIMARY current position. It's the cheap,
// broad browse tier (masked names; reveal costs 1 credit). It cannot search
// employment history — that's what PDL/Coresignal are for.
export const apolloProvider: PeopleProvider = {
  name: 'apollo',
  isConfigured: () => Boolean(process.env.APOLLO_API_KEY),

  async search(filters: SearchFilters, limit: number): Promise<ProviderPerson[]> {
    const apolloKey = process.env.APOLLO_API_KEY
    if (!apolloKey) return []

    // Base filters (everything except location).
    const base: Record<string, unknown> = { page: 1, per_page: limit }

    // Map history-encoded intent onto Apollo's CURRENT-role fields. Apollo can't
    // search history, but for a free fallback on "interns at BCG" it should at
    // least search current BCG employees with intern-ish titles.
    const company = filters.q_organization_name || filters.past_company
    if (company) base.q_organization_name = company

    // Intern queries: the parser often emits a narrow literal ("summer intern")
    // that Apollo barely matches (1 result), which then trips the location
    // broaden and leaks in global/India people. Use a broad intern title set
    // instead so a location-scoped search returns enough real matches.
    let titles: string[]
    if (filters.intern) {
      titles = ['Intern', 'Summer Associate', 'Summer Analyst', 'Co-op']
    } else {
      titles = filters.person_titles?.length
        ? filters.person_titles
        : filters.past_title
          ? [filters.past_title]
          : []
    }
    if (titles.length) base.person_titles = titles

    if (filters.organization_num_employees_ranges?.length) {
      base.organization_num_employees_ranges = filters.organization_num_employees_ranges
    }
    if (filters.industries?.length) {
      const tagIds = filters.industries
        .map((n) => INDUSTRY_TAGS[n.trim().toLowerCase()])
        .filter(Boolean)
      if (tagIds.length) base.organization_industry_tag_ids = tagIds
    }
    if (filters.early_stage) base.organization_latest_funding_stage_cd = EARLY_STAGE_FUNDING
    if (filters.q_keywords && !titles.length && !company) base.q_keywords = filters.q_keywords

    const location = filters.person_locations?.length ? filters.person_locations : null

    // Never run a wide-open search — an empty filter returns random people.
    const hasConstraint =
      company || titles.length || base.organization_industry_tag_ids || base.q_keywords || location
    if (!hasConstraint) return []

    const run = async (body: Record<string, unknown>): Promise<ProviderPerson[]> => {
      const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apolloKey },
        body: JSON.stringify(body),
      })
      if (!res.ok) return []
      const data = await res.json()
      return (data.people ?? [])
        .filter((p: ApolloPerson) => (p.first_name ?? p.name ?? '').trim())
        .map((p: ApolloPerson): ProviderPerson => ({
          provider: 'apollo',
          providerId: p.id ?? '',
          firstName: p.first_name ?? '',
          lastName: p.last_name ?? p.last_name_obfuscated ?? '',
          lastNameMasked: !p.last_name && Boolean(p.last_name_obfuscated),
          title: p.title ?? '',
          company: p.organization?.name ?? '',
          domain: p.organization?.primary_domain ?? '',
          location: [p.city, p.state, p.country].filter(Boolean).join(', '),
          linkedinUrl: p.linkedin_url ?? null,
          email: null,
          revealed: false, // Apollo rows are masked until the reveal endpoint runs
        }))
    }

    // Respect the requested location. Apollo filters on PROFILE location, so it
    // can't find out-of-town interns (that's the Pro/PDL feature) — but it must
    // NOT silently broaden to global results, which is how "Toronto" searches
    // leaked BCG India. Few accurate local results beat a global flood; if it's
    // empty, the UI shows the empty state + the Pro upsell.
    if (location) return run({ ...base, person_locations: location })
    return run(base)
  },
}
