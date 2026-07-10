import { PeopleProvider, ProviderPerson, SearchFilters } from './types'

// Exa People Search — semantic discovery over 1B+ professional profiles.
// Unlike Apollo (which matches the primary title string only), Exa embeds the
// whole profile (headline, work history, education), so "IB analysts at RBC"
// finds people titled just "Analyst" whose profile says investment banking.
// It searches on the user's ORIGINAL natural-language query (filters.raw_query)
// rather than the structured filters. Rows come back with full names and
// LinkedIn URLs but no emails — email enrichment stays with Apollo/Hunter at
// reveal time. ~$7 per 1,000 searches: cheap enough to run on every query.

interface ExaWorkEntry {
  title?: string
  location?: string
  dates?: { from?: string | null; to?: string | null }
  company?: { id?: string; name?: string }
}

interface ExaPersonProps {
  name?: string
  firstName?: string
  lastName?: string
  location?: string
  workHistory?: ExaWorkEntry[]
}

interface ExaResult {
  id?: string
  url?: string
  properties?: ExaPersonProps
  // Some response shapes inline the person fields at the top level.
  name?: string
  firstName?: string
  lastName?: string
  location?: string
  workHistory?: ExaWorkEntry[]
}

// The current role = the work entry with no end date (or the first entry).
function currentRole(work: ExaWorkEntry[] | undefined): ExaWorkEntry | undefined {
  if (!work?.length) return undefined
  return work.find((w) => w.dates && !w.dates.to) ?? work[0]
}

export const exaProvider: PeopleProvider = {
  name: 'exa',
  isConfigured: () => Boolean(process.env.EXA_API_KEY),

  async search(filters: SearchFilters, limit: number): Promise<ProviderPerson[]> {
    const key = process.env.EXA_API_KEY
    const query = filters.raw_query?.trim()
    if (!key || !query) return []

    const res = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        query,
        category: 'people',
        type: 'auto',
        numResults: Math.min(limit, 100),
      }),
    })
    if (!res.ok) throw new Error(`Exa search failed: ${res.status}`)
    const data = await res.json()

    return ((data.results ?? []) as ExaResult[])
      .map((r): ProviderPerson | null => {
        const p = r.properties ?? r
        const role = currentRole(p.workHistory)
        const first = p.firstName ?? (p.name ?? '').split(' ')[0] ?? ''
        const last = p.lastName ?? (p.name ?? '').split(' ').slice(1).join(' ')
        if (!first.trim()) return null
        return {
          provider: 'exa',
          providerId: r.id ?? r.url ?? '',
          firstName: first,
          lastName: last,
          lastNameMasked: false, // Exa returns full names
          title: role?.title ?? '',
          company: role?.company?.name ?? '',
          domain: '',
          location: role?.location || p.location || '',
          linkedinUrl: r.url ?? null,
          email: null, // enrichment happens at reveal time (Apollo/Hunter)
          revealed: false,
        }
      })
      .filter((p): p is ProviderPerson => p !== null)
  },
}
