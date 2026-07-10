'use client'

import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTheme, type ThemePref } from '@/lib/useTheme'

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun; hint: string }[] = [
  { value: 'light', label: 'Light', icon: Sun, hint: 'Warm cream' },
  { value: 'dark', label: 'Dark', icon: Moon, hint: 'Espresso' },
  { value: 'system', label: 'System', icon: Monitor, hint: 'Match device' },
]

export default function SettingsPage() {
  const { pref, setTheme } = useTheme()

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Settings</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">
          Settings
        </h1>
        <p className="text-content/65 mt-2.5">Make Network Buddy feel like yours.</p>
      </div>

      <section className="bg-surface border border-line/10 rounded-2xl p-6 theme-transition">
        <h2 className="font-display text-lg font-bold text-content">Appearance</h2>
        <p className="text-sm text-content/60 mt-1 mb-5">Choose how Network Buddy looks. System follows your device setting.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
            const active = pref === value
            return (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`relative text-left rounded-2xl border p-4 transition-all ${
                  active
                    ? 'border-accent ring-2 ring-accent/30 bg-accent/5'
                    : 'border-line/15 hover:border-accent/40'
                }`}
              >
                {active && (
                  <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-content/5 text-accent mb-3">
                  <Icon className="w-5 h-5" />
                </span>
                <div className="font-semibold text-content">{label}</div>
                <div className="text-xs text-content/50 mt-0.5">{hint}</div>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
