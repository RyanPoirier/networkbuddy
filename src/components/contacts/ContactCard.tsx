'use client'

import { useState } from 'react'
import { Mail, CheckCircle, AlertCircle, Loader2, ExternalLink, Search } from 'lucide-react'
import LinkedInIcon from '@/components/ui/LinkedInIcon'
import { Contact } from '@/types'
import OutreachModal from '@/components/outreach/OutreachModal'

export default function ContactCard({ contact }: { contact: Contact }) {
  const [showOutreach, setShowOutreach] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [email, setEmail] = useState(contact.email)
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedin_url)
  const [findingEmail, setFindingEmail] = useState(false)

  async function handleFindEmail() {
    setFindingEmail(true)
    try {
      const res = await fetch('/api/contacts/find-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact.id,
          fullName: contact.full_name,
          domain: contact.domain,
        }),
      })
      const data = await res.json()
      if (data.email) setEmail(data.email)
      if (data.linkedin_url) setLinkedinUrl(data.linkedin_url)
    } finally {
      setFindingEmail(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    await fetch('/api/outreach/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId: contact.id, status: 'saved' }),
    })
    setSaved(true)
    setSaving(false)
  }

  const initials = contact.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 bg-[#0f1f3d] rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {initials || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[#0f1f3d] truncate">{contact.full_name || 'Unknown'}</h3>
            <p className="text-sm text-slate-500 truncate">{contact.title || 'Title unknown'}</p>
            <p className="text-sm text-slate-400 truncate">{contact.company}</p>
          </div>
        </div>

        {email ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            <span className="truncate">{email}</span>
            {contact.email_verified ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            )}
          </div>
        ) : (
          <button
            onClick={handleFindEmail}
            disabled={findingEmail}
            className="flex items-center gap-2 text-sm text-[#f97316] hover:text-orange-600 transition-colors disabled:opacity-50"
          >
            {findingEmail ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {findingEmail ? 'Finding email...' : 'Find Email'}
          </button>
        )}

        {linkedinUrl && (
          <a
            href={linkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            <LinkedInIcon className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">LinkedIn Profile</span>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
          </a>
        )}

        <div className="flex gap-2 mt-auto pt-1">
          <button
            onClick={() => setShowOutreach(true)}
            className="flex-1 bg-[#0f1f3d] hover:bg-[#1a3560] text-white text-sm font-medium py-2 rounded-xl transition-colors"
          >
            Generate Outreach
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
              saved
                ? 'bg-green-50 text-green-600 cursor-default'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? '✓' : 'Save'}
          </button>
        </div>
      </div>

      {showOutreach && (
        <OutreachModal
          contact={contact}
          onClose={() => setShowOutreach(false)}
        />
      )}
    </>
  )
}
