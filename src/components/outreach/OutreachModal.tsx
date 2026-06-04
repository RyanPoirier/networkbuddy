'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Loader2, Copy, Check, ExternalLink } from 'lucide-react'
import LinkedInIcon from '@/components/ui/LinkedInIcon'
import { Contact, GeneratedMessages } from '@/types'

export default function OutreachModal({
  contact,
  onClose,
}: {
  contact: Contact
  onClose: () => void
}) {
  const [messages, setMessages] = useState<GeneratedMessages | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState<'email' | 'linkedin'>('email')

  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [linkedinMsg, setLinkedinMsg] = useState('')

  useEffect(() => {
    generateMessages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generateMessages() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/outreach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data: GeneratedMessages = await res.json()
      setMessages(data)
      setEmailSubject(data.email_subject)
      setEmailBody(data.email_body)
      setLinkedinMsg(data.linkedin_message)

      // Auto-save to outreach tracker
      await fetch('/api/outreach/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: contact.id, status: 'saved' }),
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate messages')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopyLinkedin() {
    await navigator.clipboard.writeText(linkedinMsg)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleOpenLinkedin() {
    handleCopyLinkedin()
    if (contact.linkedin_url) {
      window.open(contact.linkedin_url, '_blank', 'noopener,noreferrer')
    }
  }

  const mailtoHref = `mailto:${contact.email ?? ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="font-bold text-[#0f1f3d] text-lg">Outreach for {contact.full_name}</h2>
            <p className="text-sm text-slate-500">{contact.title} · {contact.company}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-[#f97316] mb-3" />
            <p className="text-sm">Generating personalized messages...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16">
            <p className="text-red-500 text-sm mb-4">{error}</p>
            <button onClick={generateMessages} className="text-[#f97316] font-medium text-sm hover:underline">
              Try again
            </button>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-slate-100">
              {[
                { key: 'email' as const, label: 'Email', icon: Mail },
                { key: 'linkedin' as const, label: 'LinkedIn', icon: LinkedInIcon },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                    tab === key
                      ? 'border-[#f97316] text-[#f97316]'
                      : 'border-transparent text-slate-500 hover:text-[#0f1f3d]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {tab === 'email' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Subject</label>
                    <input
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-[#0f1f3d] focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wide">Body</label>
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={12}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0f1f3d] focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent resize-none leading-relaxed"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-medium text-slate-500 uppercase tracking-wide">Message</label>
                    <span className={`text-xs ${linkedinMsg.length > 300 ? 'text-red-500' : 'text-slate-400'}`}>
                      {linkedinMsg.length}/300 chars
                    </span>
                  </div>
                  <textarea
                    value={linkedinMsg}
                    onChange={e => setLinkedinMsg(e.target.value)}
                    rows={6}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-[#0f1f3d] focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent resize-none leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t border-slate-100 flex gap-3">
              {tab === 'email' ? (
                <a
                  href={mailtoHref}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#0f1f3d] hover:bg-[#1a3560] text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                >
                  <Mail className="w-4 h-4" />
                  Open in Email Client
                </a>
              ) : (
                <>
                  <button
                    onClick={handleCopyLinkedin}
                    className="flex items-center gap-2 border border-slate-200 text-[#0f1f3d] hover:bg-slate-50 font-medium px-4 py-3 rounded-xl transition-colors text-sm"
                  >
                    {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  {contact.linkedin_url && (
                    <button
                      onClick={handleOpenLinkedin}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#0077b5] hover:bg-[#006097] text-white font-semibold py-3 rounded-xl transition-colors text-sm"
                    >
                      <LinkedInIcon className="w-4 h-4" />
                      Copy & Open LinkedIn
                      <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
