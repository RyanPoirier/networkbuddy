import { PeopleProvider, ProviderName, ProviderPerson, SearchFilters } from './types'
import { apolloProvider } from './apollo'
import { pdlProvider } from './pdl'
import { coresignalProvider } from './coresignal'

export * from './types'

const ALL: PeopleProvider[] = [apolloProvider, pdlProvider, coresignalProvider]

// A person merged across the sources that found them.
export interface MergedPerson {
  key: string
  firstName: string
  lastName: string
  lastNameMasked: boolean
  title: string
  company: string
  domain: string
  location: string
  linkedinUrl: string | null
  email: string | null
  revealed: boolean
  sources: ProviderName[]
  apolloId: string | null // set when an Apollo source exists → reveal via /reveal
}

export function configuredProviders(): ProviderName[] {
  return ALL.filter((p) => p.isConfigured()).map((p) => p.name)
}

function dedupeKey(p: ProviderPerson): string {
  if (p.linkedinUrl) {
    return p.linkedinUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase()
  }
  return `${p.firstName}|${p.company}`.toLowerCase()
}

function merge(group: ProviderPerson[]): MergedPerson {
  // Prefer a fully-revealed record (PDL/Coresignal) for the display fields;
  // fall back to the (masked) Apollo record.
  const display = group.find((p) => p.revealed) ?? group[0]
  const apollo = group.find((p) => p.provider === 'apollo')
  return {
    key: dedupeKey(display),
    firstName: display.firstName,
    lastName: display.lastName,
    lastNameMasked: display.lastNameMasked && !group.some((p) => p.revealed),
    title: display.title || group.find((p) => p.title)?.title || '',
    company: display.company || group.find((p) => p.company)?.company || '',
    domain: display.domain || group.find((p) => p.domain)?.domain || '',
    location: display.location || group.find((p) => p.location)?.location || '',
    linkedinUrl: group.find((p) => p.linkedinUrl)?.linkedinUrl ?? null,
    email: group.find((p) => p.email)?.email ?? null,
    revealed: group.some((p) => p.revealed),
    sources: [...new Set(group.map((p) => p.provider))],
    apolloId: apollo?.providerId ?? null,
  }
}

export interface SearchAllResult {
  rows: MergedPerson[]
  sourcesQueried: ProviderName[]
  errors: ProviderName[]
}

// Run a specific set of configured providers in parallel.
async function runSources(
  names: ProviderName[],
  filters: SearchFilters,
  limit: number
): Promise<{ flat: ProviderPerson[]; ran: ProviderName[]; errors: ProviderName[] }> {
  const active = ALL.filter((p) => p.isConfigured() && names.includes(p.name))
  const settled = await Promise.allSettled(active.map((p) => p.search(filters, limit)))
  const flat: ProviderPerson[] = []
  const errors: ProviderName[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') flat.push(...r.value)
    else errors.push(active[i].name)
  })
  return { flat, ran: active.map((p) => p.name), errors }
}

function dedupeMerge(flat: ProviderPerson[]): MergedPerson[] {
  const groups = new Map<string, ProviderPerson[]>()
  for (const p of flat) {
    const k = dedupeKey(p)
    ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(p)
  }
  return [...groups.values()].map(merge)
}

// Fan out to the primary `sources`, then — only if the result is thin — pull in
// `fallbackSources` for extra coverage (keeps the pricey providers off the hot
// path). The caller sets the cost policy.
export async function searchAll(
  filters: SearchFilters,
  opts: {
    sources?: ProviderName[]
    fallbackSources?: ProviderName[]
    minResults?: number
    limit?: number
  } = {}
): Promise<SearchAllResult> {
  const limit = opts.limit ?? 10
  const primary = opts.sources ?? ['apollo']

  const first = await runSources(primary, filters, limit)
  let flat = first.flat
  const ran = [...first.ran]
  const errors = [...first.errors]

  if (opts.fallbackSources?.length && dedupeMerge(flat).length < (opts.minResults ?? 5)) {
    const extra = opts.fallbackSources.filter((s) => !ran.includes(s))
    if (extra.length) {
      const fb = await runSources(extra, filters, limit)
      flat = flat.concat(fb.flat)
      ran.push(...fb.ran)
      errors.push(...fb.errors)
    }
  }

  return { rows: dedupeMerge(flat), sourcesQueried: ran, errors }
}
