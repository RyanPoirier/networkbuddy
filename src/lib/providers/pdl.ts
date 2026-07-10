import { PeopleProvider, ProviderPerson, SearchFilters } from './types'

// People Data Labs — /v5/person/search (1 credit PER returned record).
// Its power is the queryable `experience[]` array: every past/secondary role is
// searchable with dates and an intern flag (experience.title.levels = "training").
// We match on experience.company.name (not job_company_name) so it also catches
// people whose target-company role is NOT their primary position — the exact
// case Apollo misses (e.g. a student whose BCG summer role is secondary).

interface PdlExperience {
  company?: { name?: string }
  title?: { name?: string }
  start_date?: string
  end_date?: string
  is_primary?: boolean
}
interface PdlPerson {
  id?: string
  first_name?: string
  last_name?: string
  full_name?: string
  job_title?: string
  job_company_name?: string
  job_company_website?: string
  linkedin_url?: string
  work_email?: string
  emails?: { address?: string }[]
  location_name?: string
  experience?: PdlExperience[]
}

const esc = (s: string) => s.replace(/'/g, "''").toLowerCase().trim()

// Build a PDL SQL WHERE from the parsed intent. Returns null if there's nothing
// specific enough to search on (PDL rejects unbounded queries).
function buildSql(f: SearchFilters): string | null {
  const where: string[] = []

  const company = f.past_company || f.q_organization_name
  if (company) where.push(`experience.company.name='${esc(company)}'`)

  if (f.intern) {
    where.push(`experience.title.levels='training'`)
  } else {
    const titleKw = f.past_title || f.person_titles?.[0]
    if (titleKw) where.push(`experience.title.name LIKE '%${esc(titleKw)}%'`)
  }

  if (f.experience_year) {
    where.push(`experience.end_date >= '${f.experience_year}-01-01'`)
    where.push(`experience.start_date <= '${f.experience_year}-12-31'`)
  }

  if (f.person_name) where.push(`full_name='${esc(f.person_name)}'`)

  // Location is a person-level field in PDL; only apply for broad searches.
  if (f.person_locations?.length && !company) {
    where.push(`location_name='${esc(f.person_locations[0])}'`)
  }

  if (where.length === 0) return null
  return `SELECT * FROM person WHERE ${where.join(' AND ')}`
}

export const pdlProvider: PeopleProvider = {
  name: 'pdl',
  isConfigured: () => Boolean(process.env.PDL_API_KEY),

  async search(filters: SearchFilters, limit: number): Promise<ProviderPerson[]> {
    const key = process.env.PDL_API_KEY
    if (!key) return []
    const sql = buildSql(filters)
    if (!sql) return []

    const res = await fetch('https://api.peopledatalabs.com/v5/person/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
      // size caps credits spent: PDL bills 1 credit per returned record.
      body: JSON.stringify({ sql, size: Math.min(limit, 10) }),
    })
    if (!res.ok) return []
    const data = await res.json()

    return (data.data ?? []).map((p: PdlPerson): ProviderPerson => {
      const email = p.work_email ?? p.emails?.[0]?.address ?? null
      return {
        provider: 'pdl',
        providerId: p.id ?? '',
        firstName: p.first_name ?? p.full_name?.split(' ')[0] ?? '',
        lastName: p.last_name ?? p.full_name?.split(' ').slice(1).join(' ') ?? '',
        lastNameMasked: false,
        title: p.job_title ?? '',
        company: p.job_company_name ?? '',
        domain: p.job_company_website ?? '',
        location: p.location_name ?? '',
        linkedinUrl: p.linkedin_url ? `https://${p.linkedin_url.replace(/^https?:\/\//, '')}` : null,
        email,
        // We already paid 1 credit for this full record — it's revealed.
        revealed: true,
      }
    })
  },
}
