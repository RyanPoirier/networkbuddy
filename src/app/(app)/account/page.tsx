'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, User, Mail, Lock, ShieldCheck } from 'lucide-react'

type Msg = { section: string; ok: boolean; text: string } | null

export default function AccountPage() {
  const supabase = createClient()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const [currentEmail, setCurrentEmail] = useState('')
  const [hasPassword, setHasPassword] = useState(true)

  const [name, setName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [emailPw, setEmailPw] = useState('')
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      setCurrentEmail(user.email ?? '')
      setHasPassword((user.identities ?? []).some((i) => i.provider === 'email'))
      const { data } = await supabase.from('users').select('name').eq('id', user.id).single()
      setName(data?.name ?? '')
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Step-up: verify the current password without depending on email.
  async function verifyPw(pw: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: currentEmail, password: pw })
    return !error
  }

  async function saveName() {
    setBusy('name'); setMsg(null)
    const { error } = await supabase.from('users').update({ name }).eq('id', userId)
    setMsg({ section: 'name', ok: !error, text: error ? error.message : 'Display name updated.' })
    if (!error) router.refresh() // re-fetch the server layout so the sidebar name updates
    setBusy(null)
  }

  async function saveEmail() {
    setBusy('email'); setMsg(null)
    if (!newEmail.includes('@')) { setMsg({ section: 'email', ok: false, text: 'Enter a valid email.' }); setBusy(null); return }
    if (!(await verifyPw(emailPw))) { setMsg({ section: 'email', ok: false, text: 'Current password is incorrect.' }); setBusy(null); return }
    const { error } = await supabase.auth.updateUser({ email: newEmail })
    setMsg({ section: 'email', ok: !error, text: error ? error.message : `Confirmation sent to ${newEmail} — click the link there to finish the change.` })
    if (!error) { setNewEmail(''); setEmailPw('') }
    setBusy(null)
  }

  async function savePassword() {
    setBusy('password'); setMsg(null)
    if (newPw.length < 8) { setMsg({ section: 'password', ok: false, text: 'New password must be at least 8 characters.' }); setBusy(null); return }
    if (!(await verifyPw(curPw))) { setMsg({ section: 'password', ok: false, text: 'Current password is incorrect.' }); setBusy(null); return }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setMsg({ section: 'password', ok: !error, text: error ? error.message : 'Password updated.' })
    if (!error) { setCurPw(''); setNewPw('') }
    setBusy(null)
  }

  const input = 'w-full bg-transparent border border-line/15 rounded-xl px-4 py-2.5 text-sm text-content placeholder:text-content/40 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-transparent'
  const label = 'block text-xs font-medium text-content/55 mb-1.5'
  const primaryBtn = 'inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold px-4 py-2 rounded-xl text-sm transition-colors disabled:opacity-50'

  function Note({ section }: { section: string }) {
    if (msg?.section !== section) return null
    return <p className={`text-xs mt-2 ${msg.ok ? 'text-emerald-500' : 'text-red-500'}`}>{msg.text}</p>
  }

  if (loading) {
    return <div className="flex justify-center py-20 text-content/40"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Account</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">Account</h1>
        <p className="text-content/65 mt-2.5">Manage your name, email, and password.</p>
      </div>

      {/* Display name */}
      <section className="bg-surface border border-line/10 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-4 h-4 text-accent" />
          <h2 className="font-display font-bold text-content">Display name</h2>
        </div>
        <label className={label}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} className={input} placeholder="Your name" />
        <div className="mt-4">
          <button onClick={saveName} disabled={busy === 'name'} className={primaryBtn}>
            {busy === 'name' && <Loader2 className="w-4 h-4 animate-spin" />} Save name
          </button>
          <Note section="name" />
        </div>
      </section>

      {/* Email */}
      <section className="bg-surface border border-line/10 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-accent" />
          <h2 className="font-display font-bold text-content">Email</h2>
        </div>
        <p className="text-sm text-content/55 mb-4">Currently <span className="text-content/80 font-medium">{currentEmail}</span></p>
        {hasPassword ? (
          <>
            <label className={label}>New email</label>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={`${input} mb-3`} placeholder="new@email.com" />
            <label className={label}>Current password <span className="text-content/40">(to confirm it's you)</span></label>
            <input type="password" value={emailPw} onChange={e => setEmailPw(e.target.value)} className={input} placeholder="••••••••" />
            <div className="mt-4">
              <button onClick={saveEmail} disabled={busy === 'email' || !newEmail || !emailPw} className={primaryBtn}>
                {busy === 'email' && <Loader2 className="w-4 h-4 animate-spin" />} Change email
              </button>
              <Note section="email" />
            </div>
          </>
        ) : (
          <p className="text-sm text-content/50">You sign in with Google, so your email is managed through your Google account.</p>
        )}
      </section>

      {/* Password */}
      <section className="bg-surface border border-line/10 rounded-2xl p-6 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-accent" />
          <h2 className="font-display font-bold text-content">Password</h2>
        </div>
        <p className="text-sm text-content/55 mb-4 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Confirmed with your current password — no email needed.
        </p>
        {hasPassword ? (
          <>
            <label className={label}>Current password</label>
            <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} className={`${input} mb-3`} placeholder="••••••••" />
            <label className={label}>New password <span className="text-content/40">(8+ characters)</span></label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={input} placeholder="••••••••" />
            <div className="mt-4">
              <button onClick={savePassword} disabled={busy === 'password' || !curPw || !newPw} className={primaryBtn}>
                {busy === 'password' && <Loader2 className="w-4 h-4 animate-spin" />} Change password
              </button>
              <Note section="password" />
            </div>
          </>
        ) : (
          <p className="text-sm text-content/50">You sign in with Google, so there&apos;s no password to change here — Google handles it.</p>
        )}
      </section>

      <p className="text-xs text-content/40 mt-2">
        Two-factor authentication (authenticator app + recovery codes) is coming soon.
      </p>
    </div>
  )
}
