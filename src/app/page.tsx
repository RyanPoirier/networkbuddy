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
            viewBox="0 0 140 140"
            className="w-20 h-20 sm:w-28 sm:h-28 flex-shrink-0"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffb38a" />
                <stop offset="35%" stopColor="#ff7f4a" />
                <stop offset="100%" stopColor="#c14a1a" />
              </linearGradient>
              <linearGradient id="bodyTopGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffd4b8" />
                <stop offset="100%" stopColor="#ff8a55" />
              </linearGradient>
              <linearGradient id="claspGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fff4c4" />
                <stop offset="50%" stopColor="#f5c563" />
                <stop offset="100%" stopColor="#a8771f" />
              </linearGradient>
              <radialGradient id="cheekGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ff4d1a" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#ff4d1a" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="handGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#fff4c4" />
                <stop offset="100%" stopColor="#e0a04a" />
              </linearGradient>
              <radialGradient id="shadowGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#000" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#000" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* ground shadow */}
            <ellipse cx="70" cy="128" rx="34" ry="4" fill="url(#shadowGrad)">
              <animate attributeName="rx" values="34;30;34" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.7;0.5;0.7" dur="2.4s" repeatCount="indefinite" />
            </ellipse>

            {/* whole character bobs */}
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0; 0 -3; 0 0"
                dur="2.4s"
                repeatCount="indefinite"
              />

              {/* legs */}
              <path d="M 52 108 Q 50 116 48 124" stroke="#2a1810" strokeWidth="5" strokeLinecap="round" fill="none" />
              <path d="M 88 108 Q 90 116 92 124" stroke="#2a1810" strokeWidth="5" strokeLinecap="round" fill="none" />
              {/* shoes */}
              <ellipse cx="44" cy="126" rx="10" ry="5" fill="#2a1810" />
              <ellipse cx="44" cy="124" rx="9" ry="2" fill="#5c3a20" />
              <ellipse cx="96" cy="126" rx="10" ry="5" fill="#2a1810" />
              <ellipse cx="96" cy="124" rx="9" ry="2" fill="#5c3a20" />

              {/* handle */}
              <path d="M 55 36 Q 70 14 85 36" stroke="#2a1810" strokeWidth="5" fill="none" strokeLinecap="round" />
              <path d="M 56 36 Q 70 18 84 36" stroke="#7a4a20" strokeWidth="2" fill="none" strokeLinecap="round" />

              {/* briefcase body — back/shadow side */}
              <rect x="25" y="36" width="90" height="76" rx="10" fill="#8a3818" />
              {/* main body */}
              <rect x="25" y="36" width="86" height="74" rx="10" fill="url(#bodyGrad)" />
              {/* top highlight */}
              <rect x="25" y="36" width="86" height="14" rx="10" fill="url(#bodyTopGrad)" />
              {/* subtle side shine */}
              <rect x="28" y="40" width="6" height="66" rx="3" fill="#fff" opacity="0.18" />

              {/* divider */}
              <line x1="25" y1="68" x2="111" y2="68" stroke="#7a2e10" strokeWidth="2" />
              <line x1="25" y1="70" x2="111" y2="70" stroke="#ffb38a" strokeWidth="1" opacity="0.6" />

              {/* clasps with depth */}
              <rect x="40" y="60" width="14" height="9" rx="2" fill="#5a3a10" />
              <rect x="40" y="59" width="14" height="8" rx="2" fill="url(#claspGrad)" />
              <circle cx="47" cy="63" r="1.2" fill="#5a3a10" />

              <rect x="82" y="60" width="14" height="9" rx="2" fill="#5a3a10" />
              <rect x="82" y="59" width="14" height="8" rx="2" fill="url(#claspGrad)" />
              <circle cx="89" cy="63" r="1.2" fill="#5a3a10" />

              {/* eyes */}
              <ellipse cx="55" cy="85" rx="3.5" ry="4.5" fill="#1a1208" />
              <circle cx="56" cy="84" r="1.3" fill="white" />
              <ellipse cx="85" cy="85" rx="3.5" ry="4.5" fill="#1a1208" />
              <circle cx="86" cy="84" r="1.3" fill="white" />

              {/* smile */}
              <path d="M 58 95 Q 70 105 82 95" stroke="#1a1208" strokeWidth="3" fill="none" strokeLinecap="round" />

              {/* left arm */}
              <path d="M 25 76 Q 14 86 18 100" stroke="#2a1810" strokeWidth="5" fill="none" strokeLinecap="round" />
              <circle cx="18" cy="102" r="5" fill="url(#handGrad)" stroke="#2a1810" strokeWidth="1.8" />

              {/* right arm — waving */}
              <g>
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  values="-12 111 76; 12 111 76; -12 111 76"
                  dur="1.4s"
                  repeatCount="indefinite"
                />
                <path d="M 111 76 Q 124 60 122 42" stroke="#2a1810" strokeWidth="5" fill="none" strokeLinecap="round" />
                <circle cx="122" cy="40" r="5.5" fill="url(#handGrad)" stroke="#2a1810" strokeWidth="1.8" />
              </g>

              {/* sparkles around him */}
              <circle cx="14" cy="50" r="1.5" fill="#ffd4b8">
                <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite" />
                <animate attributeName="r" values="0.8;2;0.8" dur="1.8s" repeatCount="indefinite" />
              </circle>
              <circle cx="128" cy="62" r="1.5" fill="#ffd4b8">
                <animate attributeName="opacity" values="0;1;0" dur="2.2s" begin="0.4s" repeatCount="indefinite" />
                <animate attributeName="r" values="0.8;2;0.8" dur="2.2s" begin="0.4s" repeatCount="indefinite" />
              </circle>
              <circle cx="20" cy="120" r="1.5" fill="#ffd4b8">
                <animate attributeName="opacity" values="0;1;0" dur="2s" begin="0.8s" repeatCount="indefinite" />
                <animate attributeName="r" values="0.8;2;0.8" dur="2s" begin="0.8s" repeatCount="indefinite" />
              </circle>
            </g>
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
