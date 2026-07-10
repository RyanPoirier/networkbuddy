'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Mail, Check, CalendarClock } from 'lucide-react'

interface Contact { id: string; full_name: string; title: string | null; company: string | null; email: string }
interface Draft { contactId: string; name: string; company: string; toEmail: string; subject: string; body: string }

export default function CampaignComposer({ contacts, gmailEmail }: { contacts: Contact[]; gmailEmail: string | null }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [stage, setStage] = useState<'pick' | 'review' | 'done'>('pick')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ queued: number; firstSend: string; lastSend: string } | null>(null)

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function generate() {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: [...selected] }),
      })
      const data = await res.json()
      setDrafts(data.drafts ?? [])
      setStage('review')
    } finally { setLoading(false) }
  }

  function editDraft(i: number, field: 'subject' | 'body', value: string) {
    setDrafts(d => d.map((x, j) => (j === i ? { ...x, [field]: value } : x)))
  }

  async function schedule() {
    setLoading(true)
    try {
      const res = await fetch('/api/campaigns/enqueue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: drafts.map(d => ({ contactId: d.contactId, toEmail: d.toEmail, subject: d.subject, body: d.body })) }),
      })
      const data = await res.json()
      setResult(data)
      setStage('done')
    } finally { setLoading(false) }
  }

  // --- Gmail not connected -------------------------------------------------
  if (!gmailEmail) {
    return (
      <div className="bg-surface border border-line/10 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
          <Mail className="w-6 h-6 text-accent" />
        </div>
        <h2 className="font-display font-bold text-content text-lg">Connect your Gmail to send</h2>
        <p className="text-sm text-content/60 mt-1.5 max-w-md mx-auto">
          Messages send from your own inbox, a few per day, so they stay personal. You approve every message before anything sends.
        </p>
        <a href="/api/gmail/connect" className="inline-flex items-center gap-2 mt-5 bg-accent hover:bg-accent-hover text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
          <Mail className="w-4 h-4" /> Connect Gmail
        </a>
      </div>
    )
  }

  // --- Done ----------------------------------------------------------------
  if (stage === 'done' && result) {
    return (
      <div className="bg-surface border border-line/10 rounded-2xl p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
          <CalendarClock className="w-6 h-6 text-accent" />
        </div>
        <h2 className="font-display font-bold text-content text-lg">{result.queued} messages scheduled</h2>
        <p className="text-sm text-content/60 mt-1.5">
          Sending 3/day from {gmailEmail}. First goes out {new Date(result.firstSend).toLocaleString()}, last {new Date(result.lastSend).toLocaleDateString()}.
        </p>
        <button onClick={() => { setStage('pick'); setSelected(new Set()); setDrafts([]); setResult(null) }}
          className="mt-5 text-accent font-semibold text-sm hover:underline">Start another batch</button>
      </div>
    )
  }

  // --- Review --------------------------------------------------------------
  if (stage === 'review') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-content/60">Review & edit — nothing sends until you approve.</p>
          <div className="flex gap-2">
            <button onClick={() => setStage('pick')} className="text-sm text-content/60 hover:text-content px-3 py-2">Back</button>
            <button onClick={schedule} disabled={loading || !drafts.length}
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
              Schedule {drafts.length} · 3/day
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {drafts.map((d, i) => (
            <div key={d.contactId} className="bg-surface border border-line/10 rounded-2xl p-4">
              <div className="text-xs text-content/50 mb-2">To <span className="text-content/80 font-medium">{d.name}</span> · {d.company} · {d.toEmail}</div>
              <input value={d.subject} onChange={e => editDraft(i, 'subject', e.target.value)}
                className="w-full bg-transparent border-b border-line/15 pb-1.5 mb-2 text-sm font-semibold text-content focus:outline-none focus:border-accent" />
              <textarea value={d.body} onChange={e => editDraft(i, 'body', e.target.value)} rows={5}
                className="w-full bg-transparent text-sm text-content/80 focus:outline-none resize-none leading-relaxed" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- Pick contacts -------------------------------------------------------
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-content/60">
          Sending from <span className="text-content/80 font-medium">{gmailEmail}</span> · {selected.size} selected
        </p>
        <button onClick={generate} disabled={loading || selected.size === 0}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Write {selected.size || ''} personalized {selected.size === 1 ? 'message' : 'messages'}
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-surface border border-line/10 rounded-2xl p-8 text-center text-content/50 text-sm">
          No contacts with emails yet. Reveal some people in Find Contacts first.
        </div>
      ) : (
        <div className="bg-surface border border-line/10 rounded-2xl divide-y divide-line/5 overflow-hidden">
          {contacts.map(c => {
            const on = selected.has(c.id)
            return (
              <button key={c.id} onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg/40 transition-colors">
                <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${on ? 'bg-accent border-accent' : 'border-line/25'}`}>
                  {on && <Check className="w-3.5 h-3.5 text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-content">{c.full_name}</span>
                  <span className="text-xs text-content/50 ml-2">{c.title} · {c.company}</span>
                </span>
                <span className="text-xs text-content/40 truncate max-w-[180px]">{c.email}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
