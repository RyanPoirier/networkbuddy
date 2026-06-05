'use client'

import { useState } from 'react'

export default function ComingSoonPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) throw new Error('Something went wrong')
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1f3d] flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-lg w-full">
        <div className="mb-8">
          <span className="text-4xl font-extrabold text-white">
            Network<span className="text-[#f97316]"> Buddy</span>
          </span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight mb-4">
          Something big<br />is coming.
        </h1>
        <p className="text-slate-400 text-lg mb-10">
          Land referrals at your dream companies. We&apos;re putting the finishing touches on Network Buddy — be the first to know when we launch.
        </p>

        {submitted ? (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl px-6 py-5 text-[#f97316] font-medium text-lg">
            You&apos;re on the list! We&apos;ll let you know when we launch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              className="flex-1 px-5 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[#f97316] hover:bg-[#ea6c0a] disabled:opacity-50 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors whitespace-nowrap"
            >
              {loading ? 'Joining...' : 'Notify me'}
            </button>
          </form>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      <footer className="absolute bottom-6 text-slate-600 text-sm">
        © {new Date().getFullYear()} Network Buddy
      </footer>
    </div>
  )
}
