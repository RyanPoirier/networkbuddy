'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, ArrowUp, Mail, Lock } from 'lucide-react'
import LinkedInIcon from '@/components/ui/LinkedInIcon'

interface Filters {
  q_organization_name?: string | null
  person_titles?: string[] | null
  person_locations?: string[] | null
  organization_num_employees_ranges?: string[] | null
  industries?: string[] | null
  early_stage?: boolean | null
  past_company?: string | null
  intern?: boolean | null
  experience_year?: number | null
  person_name?: string | null
}

type Source = 'apollo' | 'pdl' | 'coresignal'

interface Row {
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
  sources: Source[]
  apolloId: string | null
  // client-side only
  revealing?: boolean
  fullName?: string
}

interface SourceInfo {
  queried: Source[]
  errors: Source[]
  configured: Source[]
}

const SOURCE_LABELS: Record<Source, string> = { apollo: 'Apollo', pdl: 'PDL', coresignal: 'Coresignal' }

const EXAMPLES = [
  'Investment banking analysts at RBC in Toronto',
  'Someone who interned at BCG last year',
  'Ex-Google product managers at startups',
  'Recruiters at Big 4 accounting firms',
]

function SearchContent() {
  const searchParams = useSearchParams()
  const initialCompany = searchParams.get('company') ?? ''

  const [input, setInput] = useState(initialCompany ? `People at ${initialCompany}` : '')
  const [lastQuery, setLastQuery] = useState('')
  const [filters, setFilters] = useState<Filters | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [usage, setUsage] = useState<{ plan: string; used: number; quota: number } | null>(null)
  const [quotaHit, setQuotaHit] = useState(false)
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [premiumLocked, setPremiumLocked] = useState(false)

  useEffect(() => {
    // Show the plan / god-mode badge on load, before any search runs.
    fetch('/api/usage')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && !d.error) setUsage(d) })
      .catch(() => {})
    if (initialCompany) handleSearch(`People at ${initialCompany}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(q?: string, sources?: Source[]) {
    const query = (q ?? input).trim()
    if (!query) return
    setLoading(true)
    setError('')
    setSearched(true)
    setLastQuery(query)
    setRows([])
    setFilters(null)
    setPremiumLocked(false)
    try {
      const res = await fetch('/api/contacts/nl-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, ...(sources ? { sources } : {}) }),
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      if (data.usage) setUsage(data.usage)
      setRows(data.rows ?? [])
      setFilters(data.filters ?? null)
      setSourceInfo(data.sources ?? null)
      setPremiumLocked(data.premiumLocked ?? false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  async function reveal(i: number) {
    const row = rows[i]
    if (row.revealed || row.revealing || !row.apolloId) return
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, revealing: true } : r)))
    try {
      const res = await fetch('/api/contacts/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apolloId: row.apolloId, title: row.title, company: row.company, domain: row.domain }),
      })
      const data = await res.json()
      if (res.status === 402 || data.error === 'quota_exceeded') {
        if (data.usage) setUsage(data.usage)
        setQuotaHit(true)
        setRows(rs => rs.map((r, j) => (j === i ? { ...r, revealing: false } : r)))
        return
      }
      if (!res.ok) throw new Error(data.error || 'reveal failed')
      if (data.usage) setUsage(data.usage)
      setRows(rs =>
        rs.map((r, j) =>
          j === i
            ? {
                ...r,
                revealing: false,
                revealed: true,
                fullName: data.contact.full_name,
                email: data.contact.email,
                linkedinUrl: data.contact.linkedin_url,
              }
            : r
        )
      )
    } catch {
      setRows(rs => rs.map((r, j) => (j === i ? { ...r, revealing: false } : r)))
    }
  }

  const filterChips: string[] = []
  if (filters?.q_organization_name) filterChips.push(filters.q_organization_name)
  if (filters?.person_titles?.length) filterChips.push(...filters.person_titles)
  if (filters?.industries?.length) filterChips.push(...filters.industries)
  if (filters?.early_stage) filterChips.push('early-stage')
  if (filters?.person_locations?.length) filterChips.push(...filters.person_locations)
  if (filters?.organization_num_employees_ranges?.length) filterChips.push('small companies')

  const queriedSources = sourceInfo?.queried ?? []
  const extraSources = (sourceInfo?.configured ?? []).filter(s => !queriedSources.includes(s))

  return (
    <div className="max-w-5xl mx-auto">
      <style>{`@keyframes nb-rainbow{to{background-position:200% center}}.god-mode{background-image:linear-gradient(90deg,#ff3b3b,#ff9f1c,#ffe600,#2ecc40,#1e90ff,#b23bff,#ff3b3b);background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:nb-rainbow 2.2s linear infinite}`}</style>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Find contacts</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">
            Find the right people
          </h1>
          <p className="text-content/65 mt-2.5">Search is free — spend a credit only on the people you want.</p>
        </div>
        {usage && (
          <div className="shrink-0 text-right bg-surface/50 border border-line/10 rounded-2xl px-4 py-2.5">
            {usage.plan === 'unlimited' ? (
              <>
                <div className="text-[10px] uppercase tracking-[0.2em] font-extrabold">
                  <span className="god-mode">God</span> <span className="text-content/50">mode</span>
                </div>
                <div className="text-sm font-bold text-content mt-0.5">
                  {Math.max(0, usage.quota - usage.used)}<span className="text-content/45 font-medium"> reveals</span>
                </div>
              </>
            ) : (
              <>
                <div className="text-[10px] text-content/50 uppercase tracking-[0.15em] font-semibold">{usage.plan} plan</div>
                <div className="text-sm font-bold text-content mt-0.5">
                  {Math.max(0, usage.quota - usage.used)}<span className="text-content/45 font-medium">/{usage.quota} reveals</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <form onSubmit={e => { e.preventDefault(); handleSearch() }} className="mb-4">
        <div className="relative">
          <Sparkles className="absolute left-4 top-4 w-4 h-4 text-accent" />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch() }
            }}
            rows={2}
            placeholder="e.g. Startup founders in Vancouver, or IB analysts at RBC in Toronto"
            className="w-full pl-11 pr-14 py-3.5 bg-surface border border-line/15 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-transparent text-content placeholder:text-content/40 resize-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-3 bottom-3 bg-accent hover:bg-accent-hover text-white rounded-xl p-2 transition-colors disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
          </button>
        </div>
      </form>

      {!searched && (
        <div className="flex flex-wrap gap-2 mb-8">
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => { setInput(ex); handleSearch(ex) }}
              className="text-sm text-content/70 bg-surface border border-line/10 hover:border-accent/40 rounded-full px-3.5 py-1.5 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && <div className="bg-red-500/10 text-red-500 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>}

      {premiumLocked && (
        <div className="bg-accent/10 border border-accent/25 rounded-2xl px-5 py-5 mb-6 flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
            <Lock className="w-4 h-4 text-accent" />
          </div>
          <div className="flex-1">
            <p className="font-display font-bold text-content">History Search is a Pro feature</p>
            <p className="text-sm text-content/70 mt-1">
              Searching by past experience — like people who <span className="font-medium">interned at your target company last year</span> — needs Pro. Below are current-role matches from Apollo in the meantime.
            </p>
          </div>
          <button className="shrink-0 self-center bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors">
            Upgrade
          </button>
        </div>
      )}

      {quotaHit && (
        <div className="bg-accent/10 border border-accent/25 rounded-2xl px-5 py-6 mb-6 text-center">
          <p className="font-display font-bold text-content text-lg">You&apos;ve used all your reveals this month</p>
          <p className="text-sm text-content/70 mt-1">
            Your {usage?.plan} plan includes {usage?.quota} reveals per month. Upgrade to keep going.
          </p>
          <button className="mt-4 bg-accent hover:bg-accent-hover text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Upgrade to Pro
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center py-16 text-content/40">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-accent" />
          <p className="text-sm">Understanding your search…</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-sm text-content/60">{rows.length} results —</span>
            {filterChips.map((c, i) => (
              <span key={i} className="text-xs font-medium bg-accent/10 text-accent rounded-full px-2.5 py-1">{c}</span>
            ))}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-line/10 bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-content/50 bg-bg/60 border-b border-line/10">
                  <th className="font-semibold text-xs uppercase tracking-[0.08em] px-4 py-3">Name</th>
                  <th className="font-semibold text-xs uppercase tracking-[0.08em] px-4 py-3">Title</th>
                  <th className="font-semibold text-xs uppercase tracking-[0.08em] px-4 py-3">Company</th>
                  <th className="font-semibold text-xs uppercase tracking-[0.08em] px-4 py-3 text-right">Contact</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const hasContact = Boolean(r.email || r.linkedinUrl)
                  const showContact = r.revealed || hasContact
                  return (
                  <tr key={r.key || i} className="border-b border-line/5 last:border-0 hover:bg-bg/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-content">
                        {r.fullName
                          ? r.fullName
                          : r.lastNameMasked
                            ? `${r.firstName}${r.lastName ? ` ${r.lastName.charAt(0)}.` : ''}`.trim()
                            : `${r.firstName} ${r.lastName}`.trim()}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {r.sources.map(s => (
                          <span key={s} className="text-[9px] font-semibold uppercase tracking-wide text-content/45 bg-content/8 rounded px-1.5 py-0.5">
                            {SOURCE_LABELS[s]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-content/70">{r.title || '—'}</td>
                    <td className="px-4 py-3 text-content/70">{r.company || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {showContact ? (
                        <div className="flex items-center justify-end gap-3">
                          {r.email && (
                            <a href={`mailto:${r.email}`} title={r.email} className="text-content/70 hover:text-accent">
                              <Mail className="w-4 h-4" />
                            </a>
                          )}
                          {r.linkedinUrl && (
                            <a href={r.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400">
                              <LinkedInIcon className="w-4 h-4" />
                            </a>
                          )}
                          {!hasContact && <span className="text-xs text-content/40">no contact found</span>}
                        </div>
                      ) : r.apolloId ? (
                        <button
                          onClick={() => reveal(i)}
                          disabled={r.revealing}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent border border-accent/30 hover:bg-accent/10 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
                        >
                          {r.revealing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                          Reveal
                        </button>
                      ) : (
                        <span className="text-xs text-content/40">—</span>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
            <p className="text-xs text-content/45">
              {queriedSources.length > 0 && <>Searched {queriedSources.map(s => SOURCE_LABELS[s]).join(' · ')}. </>}
              Apollo rows use 1 credit to reveal; PDL/Coresignal rows arrive already unlocked.
            </p>
            {extraSources.length > 0 && (
              <button
                onClick={() => handleSearch(lastQuery, ['apollo', 'pdl', 'coresignal'])}
                className="text-xs font-semibold text-accent border border-accent/30 hover:bg-accent/10 rounded-lg px-3 py-1.5 transition-colors"
              >
                Also search {extraSources.map(s => SOURCE_LABELS[s]).join(' + ')} (uses credits)
              </button>
            )}
          </div>
        </div>
      )}

      {!loading && searched && rows.length === 0 && !error && (
        <div className="text-center py-16 text-content/40">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No matches for &quot;{lastQuery}&quot;</p>
          <p className="text-sm mt-1">Try naming a company, role, or location more specifically.</p>
        </div>
      )}
    </div>
  )
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  )
}
