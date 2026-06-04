'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Loader2, ChevronDown } from 'lucide-react'
import ContactCard from '@/components/contacts/ContactCard'
import { Contact } from '@/types'

const DEPARTMENTS = [
  { value: '', label: 'All roles' },
  { value: 'executive', label: 'Executive / C-Suite' },
  { value: 'management', label: 'Management / Director' },
  { value: 'finance', label: 'Finance' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'sales', label: 'Sales' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'hr', label: 'HR / Recruiting' },
  { value: 'legal', label: 'Legal' },
  { value: 'operations', label: 'Operations' },
]

function SearchContent() {
  const searchParams = useSearchParams()
  const initialCompany = searchParams.get('company') ?? ''

  const [query, setQuery] = useState(initialCompany)
  const [input, setInput] = useState(initialCompany)
  const [department, setDepartment] = useState('')
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (initialCompany) {
      handleSearch(initialCompany, '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(company?: string, dept?: string) {
    const q = company ?? query
    const d = dept ?? department
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const params = new URLSearchParams({ company: q })
      if (d) params.set('department', d)
      const res = await fetch(`/api/contacts/search?${params}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setAllContacts(data.contacts ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setQuery(input)
    handleSearch(input, department)
  }

  function onDepartmentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setDepartment(e.target.value)
    if (searched) handleSearch(query, e.target.value)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0f1f3d]">Find Contacts</h1>
        <p className="text-slate-500 mt-1">Search a company to find people who can refer you.</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Company — e.g. RBC, Google, Shopify"
            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent bg-white text-[#0f1f3d]"
          />
        </div>
        <div className="relative">
          <select
            value={department}
            onChange={onDepartmentChange}
            className="appearance-none pl-4 pr-10 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent bg-white text-[#0f1f3d] cursor-pointer"
          >
            {DEPARTMENTS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-[#0f1f3d] hover:bg-[#1a3560] text-white font-semibold px-6 py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
      </form>

      {error && (
        <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-6">{error}</div>
      )}

      {loading && (
        <div className="flex flex-col items-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin mb-3 text-[#f97316]" />
          <p className="text-sm">Finding contacts at {input}...</p>
        </div>
      )}

      {!loading && searched && allContacts.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No contacts found for &quot;{query}&quot;</p>
          <p className="text-sm mt-1">Try a different company name or department.</p>
        </div>
      )}

      {!loading && allContacts.length > 0 && (
        <div>
          <p className="text-sm text-slate-500 mb-4">
            Found <strong>{allContacts.length}</strong> contact{allContacts.length !== 1 ? 's' : ''} at <strong>{query}</strong>
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {allContacts.map(contact => (
              <ContactCard key={contact.id} contact={contact} />
            ))}
          </div>
        </div>
      )}

      {!searched && (
        <div className="text-center py-20 text-slate-300">
          <Search className="w-12 h-12 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Search for a company to get started</p>
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
