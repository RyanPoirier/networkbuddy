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
          <svg
            viewBox="0 0 120 120"
            className="w-16 h-16 sm:w-24 sm:h-24 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* legs */}
            <path d="M 45 96 L 42 110" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
            <path d="M 75 96 L 78 110" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" />
            {/* shoes */}
            <ellipse cx="38" cy="112" rx="8" ry="4" fill="#d4843a" />
            <ellipse cx="82" cy="112" rx="8" ry="4" fill="#d4843a" />
            {/* handle */}
            <path d="M 48 30 Q 60 14 72 30" stroke="#1a1a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
            {/* briefcase body */}
            <rect x="22" y="30" width="76" height="66" rx="8" fill="#ff6b35" />
            {/* highlight stripe */}
            <rect x="22" y="30" width="76" height="6" rx="3" fill="#ffa07a" opacity="0.6" />
            {/* divider line */}
            <line x1="22" y1="58" x2="98" y2="58" stroke="#d4843a" strokeWidth="1.5" />
            {/* clasps */}
            <rect x="36" y="52" width="10" height="6" rx="1.5" fill="#fde68a" />
            <rect x="74" y="52" width="10" height="6" rx="1.5" fill="#fde68a" />
            {/* face — eyes */}
            <ellipse cx="48" cy="74" rx="3" ry="4" fill="#1a1a1a" />
            <ellipse cx="72" cy="74" rx="3" ry="4" fill="#1a1a1a" />
            {/* cheek blush */}
            <circle cx="40" cy="82" r="3" fill="#ff4d1a" opacity="0.5" />
            <circle cx="80" cy="82" r="3" fill="#ff4d1a" opacity="0.5" />
            {/* smile */}
            <path d="M 50 82 Q 60 90 70 82" stroke="#1a1a1a" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            {/* left arm (down) */}
            <path d="M 22 64 Q 14 72 16 84" stroke="#1a1a1a" strokeWidth="4" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="86" r="4" fill="#fde68a" stroke="#1a1a1a" strokeWidth="1.5" />
            {/* right arm (waving) */}
            <path d="M 98 64 Q 110 56 108 42" stroke="#1a1a1a" strokeWidth="4" fill="none" strokeLinecap="round">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="-6 98 64; 6 98 64; -6 98 64"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </path>
            <circle cx="108" cy="40" r="4" fill="#fde68a" stroke="#1a1a1a" strokeWidth="1.5">
              <animateTransform
                attributeName="transform"
                type="rotate"
                values="-6 98 64; 6 98 64; -6 98 64"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
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
