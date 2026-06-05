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
    <div className="min-h-screen bg-[#0a0a0a] text-white relative overflow-hidden flex flex-col items-center justify-center px-6">
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(120, 119, 198, 0.3), transparent), radial-gradient(ellipse 60% 50% at 80% 100%, rgba(255, 107, 53, 0.15), transparent)',
        }}
      />

      <div className="relative max-w-xl w-full text-center">
        <div className="inline-flex items-center gap-2 mb-12">
          <div className="w-2 h-2 rounded-full bg-[#ff6b35] animate-pulse" />
          <span className="text-xs uppercase tracking-[0.2em] text-neutral-400 font-medium">
            Coming Soon
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.05] tracking-tight mb-6 flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
          <span>Network</span>
          <span className="bg-gradient-to-r from-[#ff6b35] to-[#ffa07a] bg-clip-text text-transparent">
            Buddy.
          </span>
          <video
            src="/mascot.mp4"
            autoPlay
            loop
            muted
            playsInline
            className="w-20 h-20 sm:w-28 sm:h-28 flex-shrink-0 object-contain"
          />

        </h1>

        <p className="text-lg text-neutral-400 leading-relaxed mb-12 max-w-md mx-auto">
          Land referrals at your dream companies. We&apos;re building something special — be the first to know when we launch.
        </p>

        {submitted ? (
          <div className="bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl px-6 py-5 text-white font-medium">
            <span className="text-[#ff6b35]">✓</span> You&apos;re on the list. We&apos;ll be in touch.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 p-1.5 bg-white/5 border border-white/10 backdrop-blur-sm rounded-2xl">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              className="flex-1 bg-transparent px-4 py-3 text-white placeholder:text-neutral-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-white text-black hover:bg-neutral-200 disabled:opacity-50 font-semibold px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 group"
            >
              {loading ? 'Joining' : 'Notify me'}
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </form>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
      </div>

      <footer className="absolute bottom-8 text-neutral-600 text-xs tracking-wider uppercase">
        © {new Date().getFullYear()} Network Buddy
      </footer>
    </div>
  )
}
