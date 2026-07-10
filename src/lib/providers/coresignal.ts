import { PeopleProvider, ProviderPerson, SearchFilters } from './types'

// Coresignal — two-step: POST .../search/es_dsl returns matching employee IDs
// (1-2 credits/request), then GET .../collect/{id} returns each full record
// (credits per record). We cap collects to bound cost.
//
// NOTE: field names on the collected record vary by dataset tier, so we read
// several plausible keys defensively. Verify against a live response once a
// CORESIGNAL_API_KEY is set (this path is implemented to the documented shape).

const TIER = 'employee_multisource'
const BASE = `https://api.coresignal.com/cdapi/v2/${TIER}`
const MAX_COLLECT = 8 // hard cap on per-record collect credits per search

type Json = Record<string, unknown>
const str = (o: Json, ...keys: string[]): string => {
  for (const k of keys) {
    const v = o[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

function buildEsDsl(f: SearchFilters): Json | null {
  const must: Json[] = []
  const company = f.past_company || f.q_organization_name
  if (company) must.push({ match: { 'member_experience.company_name': company } })

  const titleKw = f.intern ? 'intern' : f.past_title || f.person_titles?.[0]
  if (titleKw) must.push({ match: { 'member_experience.job_title': titleKw } })

  if (f.person_name) must.push({ match: { full_name: f.person_name } })
  if (f.person_locations?.length && !company) {
    must.push({ match: { location_full: f.person_locations[0] } })
  }

  if (must.length === 0) return null
  return { query: { bool: { must } } }
}

export const coresignalProvider: PeopleProvider = {
  name: 'coresignal',
  isConfigured: () => Boolean(process.env.CORESIGNAL_API_KEY),

  async search(filters: SearchFilters, limit: number): Promise<ProviderPerson[]> {
    const key = process.env.CORESIGNAL_API_KEY
    if (!key) return []
    const dsl = buildEsDsl(filters)
    if (!dsl) return []

    const searchRes = await fetch(`${BASE}/search/es_dsl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify(dsl),
    })
    if (!searchRes.ok) return []
    const ids: unknown = await searchRes.json()
    if (!Array.isArray(ids)) return []

    const toCollect = ids.slice(0, Math.min(limit, MAX_COLLECT))
    const records = await Promise.all(
      toCollect.map(async (id): Promise<ProviderPerson | null> => {
        const r = await fetch(`${BASE}/collect/${id}`, { headers: { apikey: key } })
        if (!r.ok) return null
        const p: Json = await r.json()
        const fullName = str(p, 'full_name', 'name')
        return {
          provider: 'coresignal',
          providerId: String(id),
          firstName: str(p, 'first_name') || fullName.split(' ')[0] || '',
          lastName: str(p, 'last_name') || fullName.split(' ').slice(1).join(' '),
          lastNameMasked: false,
          title: str(p, 'active_experience_title', 'job_title', 'title'),
          company: str(p, 'active_experience_company_name', 'company_name', 'company'),
          domain: str(p, 'company_website', 'website'),
          location: str(p, 'location_full', 'location'),
          linkedinUrl: str(p, 'linkedin_url', 'url') || null,
          email: str(p, 'primary_professional_email', 'email') || null,
          revealed: true, // collected record is already paid for and full
        }
      })
    )
    return records.filter((x): x is ProviderPerson => x !== null)
  },
}
