'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, ArrowUp } from 'lucide-react'
import ContactCard from '@/components/contacts/ContactCard'
import { Contact } from '@/types'

interface Filters {
  q_organization_name?: string | null
  person_titles?: string[] | null
  person_locations?: string[] | null
  organization_num_employees_ranges?: string[] | null
  q_keywords?: string | null
}

const EXAMPLES = [
  'Investment banking analysts at RBC in Toronto',
  'Asset management people at boutique firms in Vancouver',
  'Product managers at Series A startups in San Francisco',
  'Recruiters at Big 4 accounting firms',
]

function SearchContent() {
  const searchParams = useSearchParams()
  const initialCompany = searchParams.get('company') ?? ''

  const [input, setInput] = useState(initialCompany ? `People at ${initialCompany}` : '')
  const [lastQuery, setLastQuery] = useState('')
  const [filters, setFilters] = useState<Filters | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (initialCompany) handleSearch(`People at ${initialCompany}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(q?: string) {
    const query = (q ?? input).trim()
    if (!query) return
    setLoading(true)
    setError('')
    setSearched(true)
    setLastQuery(query)
    setContacts([])
    setFilters(null)
    try {
      const res = await fetch('/api/contacts/nl-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setContacts(data.contacts ?? [])
      setFilters(data.filters ?? null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleSearch()
  }

  // Human-readable chips for how the query was interpreted.
  const filterChips: string[] = []
  if (filters?.q_organization_name) filterChips.push(filters.q_organization_name)
  if (filters?.person_titles?.length) filterChips.push(...filters.person_titles)
  if (filters?.person_locations?.length) filterChips.push(...filters.person_locations)
  if (filters?.organization_num_employees_ranges?.length) filterChips.push('by company size')

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-extrabold text-[#2a1710]">Find people</h1>
        <p className="text-[#2a1710]/60 mt-1">Describe who you&apos;re looking for in plain English.</p>
      </div>

      <form onSubmit={onSubmit} className="mb-4">
        <div className="relative">
          <Sparkles className="absolute left-4 top-4 w-4 h-4 text-[#c14a19]" />
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSearch()
              }
            }}
            rows={2}
            placeholder="e.g. Asset management analysts at boutique firms in Vancouver"
            className="w-full pl-11 pr-14 py-3.5 border border-[#2a1710]/15 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#c14a19]/40 focus:border-transparent bg-white text-[#2a1710] resize-none"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="absolute right-3 bottom-3 bg-[#c14a19] hover:bg-[#a83d12] text-white rounded-xl p-2 transition-colors disabled:opacity-40"
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
              onClick={() => {
                setInput(ex)
                handleSearch(ex)
              }}
              className="text-sm text-[#2a1710]/70 bg-white border border-[#2a1710]/10 hover:border-[#c14a19]/40 rounded-full px-3.5 py-1.5 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col items-center py-16 text-[#2a1710]/40">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#c14a19]" />
          <p className="text-sm">Understanding your search…</p>
        </div>
      )}

      {!loading && contacts.length > 0 && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-[#2a1710]/60">
              Found <strong>{contacts.length}</strong> — interpreted as:
            </span>
            {filterChips.map((c, i) => (
              <span key={i} className="text-xs font-medium bg-[#c14a19]/10 text-[#c14a19] rounded-full px-2.5 py-1">
                {c}
              </span>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {contacts.map(contact => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </div>
      )}

      {!loading && searched && contacts.length === 0 && !error && (
        <div className="text-center py-16 text-[#2a1710]/40">
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
