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
    <div className="min-h-screen text-[#2a1710] relative overflow-hidden flex flex-col items-center justify-center px-5 sm:px-6 py-20 bg-[#f2ecd6]">
      <style>{`@keyframes buddyfloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-12px) rotate(-1.6deg)}}`}</style>

      <div className="relative max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 mb-8 sm:mb-12">
          <div className="w-2 h-2 rounded-full bg-[#c14a19] animate-pulse" />
          <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-[#2a1710]/55 font-semibold">
            Coming Soon
          </span>
        </div>

        {/* New brand mascot */}
        <svg
          viewBox="0 0 200 200"
          className="w-24 h-24 sm:w-28 sm:h-28 mx-auto mb-6"
          style={{ animation: 'buddyfloat 4s ease-in-out infinite' }}
        >
          <path
            d="M 72 30 L 128 30 Q 172 30 172 74 L 172 96 Q 172 140 128 140 L 90 140 L 66 176 L 62 140 Q 28 140 28 96 L 28 74 Q 28 30 72 30 Z"
            fill="#c14a19"
            stroke="#2a1710"
            strokeWidth="9"
            strokeLinejoin="round"
          />
          <circle cx="82" cy="78" r="9" fill="#2a1710" />
          <circle cx="118" cy="78" r="9" fill="#2a1710" />
          <path d="M 84 101 Q 100 121 116 101" fill="none" stroke="#2a1710" strokeWidth="8" strokeLinecap="round" />
        </svg>

        <h1 className="font-display text-5xl sm:text-6xl font-extrabold leading-[0.98] tracking-[-0.03em] mb-5 lowercase">
          <span>network</span>
          <span className="text-[#c14a19]">buddy</span>
        </h1>

        <p className="text-base sm:text-lg text-[#2a1710]/75 leading-relaxed mb-8 sm:mb-12 max-w-md mx-auto">
          Discover the right people, send messages that actually get replies, and track your network — all in one place.
        </p>

        {submitted ? (
          <div className="bg-white/40 border border-[#c14a19]/20 backdrop-blur-sm rounded-2xl px-5 sm:px-6 py-5 text-[#2a1710] font-medium text-sm sm:text-base">
            <span className="text-[#c14a19] mr-2">✓</span>You&apos;re on the list. We&apos;ll be in touch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 p-1.5 bg-white/40 border border-[#2a1710]/15 backdrop-blur-sm rounded-2xl">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 bg-transparent px-4 py-3 text-base text-[#2a1710] placeholder:text-[#2a1710]/45 focus:outline-none min-w-0"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-[#c14a19] hover:bg-[#a83d12] text-white disabled:opacity-50 font-semibold px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 group whitespace-nowrap"
            >
              {loading ? 'Joining' : 'Notify me'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        )}

        {error && <p className="text-red-700 text-sm mt-3">{error}</p>}
      </div>

      <footer className="absolute bottom-5 sm:bottom-8 text-[#2a1710]/45 text-[10px] sm:text-xs tracking-wider uppercase font-medium">
        © {new Date().getFullYear()} Network Buddy
      </footer>
    </div>
  )
}
