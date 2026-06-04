'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Loader2 } from 'lucide-react'
import ContactCard from '@/components/contacts/ContactCard'
import { Contact } from '@/types'

function SearchContent() {
  const searchParams = useSearchParams()
  const initialCompany = searchParams.get('company') ?? ''

  const [query, setQuery] = useState(initialCompany)
  const [input, setInput] = useState(initialCompany)
  const [roleInput, setRoleInput] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (initialCompany) {
      handleSearch(initialCompany)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSearch(company?: string) {
    const q = company ?? query
    if (!q.trim()) return
    setLoading(true)
    setError('')
    setSearched(true)
    try {
      const res = await fetch(`/api/contacts/search?company=${encodeURIComponent(q)}`)
      if (!res.ok) throw new Error('Search failed')
      const data = await res.json()
      setContacts(data.contacts ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setQuery(input)
    setRoleFilter(roleInput)
    handleSearch(input)
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0f1f3d]">Find Contacts</h1>
        <p className="text-slate-500 mt-1">Search a company to find people who can refer you.</p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-3 mb-8">
        <div className="flex-1 flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g. Shopify, Google, RBC..."
              className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent bg-white text-[#0f1f3d]"
            />
          </div>
          <div className="relative w-48">
            <input
              type="text"
              value={roleInput}
              onChange={e => setRoleInput(e.target.value)}
              placeholder="Role (optional)"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent bg-white text-[#0f1f3d]"
            />
          </div>
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

      {!loading && searched && contacts.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No contacts found for &quot;{query}&quot;</p>
          <p className="text-sm mt-1">Try a different company name or check the spelling.</p>
        </div>
      )}

      {!loading && contacts.length > 0 && (
        <div>
          {(() => {
            const filtered = roleFilter.trim()
              ? contacts.filter(c => c.title?.toLowerCase().includes(roleFilter.toLowerCase()))
              : contacts
            return (
              <>
                <p className="text-sm text-slate-500 mb-4">
                  Found <strong>{filtered.length}</strong> contact{filtered.length !== 1 ? 's' : ''} at <strong>{query}</strong>
                  {roleFilter && <> matching <strong>{roleFilter}</strong></>}
                </p>
                {filtered.length === 0 ? (
                  <div className="text-center py-16 text-slate-400">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No contacts match &quot;{roleFilter}&quot; at {query}</p>
                    <p className="text-sm mt-1">Try a broader role keyword.</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    {filtered.map(contact => (
                      <ContactCard key={contact.id} contact={contact} />
                    ))}
                  </div>
                )}
              </>
            )
          })()}
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
