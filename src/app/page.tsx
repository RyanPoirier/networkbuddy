'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'

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
    <div className="min-h-screen text-[#2a1810] relative overflow-hidden flex flex-col items-center justify-center px-6 bg-[#f1ecd5]">
      <div className="relative max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 mb-12">
          <div className="w-2 h-2 rounded-full bg-[#c14a1a] animate-pulse" />
          <span className="text-xs uppercase tracking-[0.2em] text-[#7a4a20] font-semibold">
            Coming Soon
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight mb-6 flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
          <span>Network</span>
          <span className="text-[#c14a1a]">Buddy</span>
        </h1>

        <div className="flex items-center justify-center gap-4 mb-12 max-w-xl mx-auto">
          <img
            src="/mascot.gif"
            alt="Network Buddy mascot"
            className="w-24 h-24 sm:w-32 sm:h-32 flex-shrink-0 object-contain"
          />
          <p className="text-lg text-[#5c3a20] leading-relaxed text-left">
            Land referrals at your dream companies. We&apos;re building something special — be the first to know when we launch.
          </p>
        </div>

        {submitted ? (
          <div className="bg-white/40 border border-[#c14a1a]/20 backdrop-blur-sm rounded-2xl px-6 py-5 text-[#2a1810] font-medium">
            <span className="text-[#c14a1a]">✓</span> You&apos;re on the list. We&apos;ll be in touch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 p-1.5 bg-white/40 border border-[#2a1810]/15 backdrop-blur-sm rounded-2xl">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 bg-transparent px-4 py-3 text-[#2a1810] placeholder:text-[#7a4a20]/60 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[#c14a1a] hover:bg-[#a83d12] text-white disabled:opacity-50 font-semibold px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 group"
            >
              {loading ? 'Joining' : 'Notify me'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        )}

        {error && <p className="text-red-700 text-sm mt-3">{error}</p>}
      </div>

      <footer className="absolute bottom-8 text-[#7a4a20]/70 text-xs tracking-wider uppercase font-medium">
        © {new Date().getFullYear()} Network Buddy
      </footer>
    </div>
  )
}
