'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LayoutDashboard, Search, Kanban, LogOut, Settings, Sun, Moon, Monitor, Send, UserCog } from 'lucide-react'
import { useTheme, type ThemePref } from '@/lib/useTheme'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/search', label: 'Find Contacts', icon: Search },
  { href: '/outreach', label: 'Outreach', icon: Send },
  { href: '/crm', label: 'My Pipeline', icon: Kanban },
]

const THEME_OPTS: { value: ThemePref; icon: typeof Sun; label: string }[] = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
]

function Mascot({ className }: { className?: string }) {
  // Linework uses the theme line color: espresso on light, cream on dark.
  return (
    <svg viewBox="0 0 200 200" className={className}>
      <path
        d="M 72 30 L 128 30 Q 172 30 172 74 L 172 96 Q 172 140 128 140 L 90 140 L 66 176 L 62 140 Q 28 140 28 96 L 28 74 Q 28 30 72 30 Z"
        fill="#c14a19"
        stroke="var(--nb-line)"
        strokeWidth="9"
        strokeLinejoin="round"
      />
      <circle cx="82" cy="78" r="9" fill="var(--nb-line)" />
      <circle cx="118" cy="78" r="9" fill="var(--nb-line)" />
      <path d="M 84 101 Q 100 121 116 101" fill="none" stroke="var(--nb-line)" strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}

export default function AppNav({ userName }: { userName: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { pref, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const footerRef = useRef<HTMLDivElement>(null)

  // Close the menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return
    function onDown(e: MouseEvent) {
      if (footerRef.current && !footerRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-sidebar border-r border-line/10 flex flex-col">
      <div className="px-6 py-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Mascot className="w-8 h-8" />
          <span className="font-display text-xl font-extrabold tracking-[-0.02em] lowercase text-content">
            network<span className="text-accent">buddy</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-content/65 hover:text-content hover:bg-content/5'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Account row — name + gear that opens the account menu */}
      <div ref={footerRef} className="relative px-3 py-4 border-t border-line/10">
        {menuOpen && (
          <div className="absolute bottom-full left-3 right-3 mb-2 bg-surface border border-line/20 rounded-2xl shadow-xl p-2 theme-transition">
            <div className="px-2 pt-1 pb-2">
              <div className="text-[10px] uppercase tracking-[0.12em] text-content/45 font-semibold mb-1.5">Appearance</div>
              <div className="grid grid-cols-3 gap-1">
                {THEME_OPTS.map(({ value, icon: Icon, label }) => {
                  const active = pref === value
                  return (
                    <button
                      key={value}
                      onClick={() => setTheme(value)}
                      className={`flex flex-col items-center gap-1 py-2 rounded-lg text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-accent text-white'
                          : 'text-content/60 hover:text-content hover:bg-content/5'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="h-px bg-line/10 my-1" />

            <Link
              href="/account"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-content/70 hover:text-content hover:bg-content/5 transition-colors"
            >
              <UserCog className="w-4 h-4 flex-shrink-0" />
              Account
            </Link>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-content/70 hover:text-content hover:bg-content/5 transition-colors"
            >
              <LogOut className="w-4 h-4 flex-shrink-0" />
              Sign out
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
          <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
            {userName?.trim()?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <span className="flex-1 text-sm text-content/80 truncate">{userName}</span>
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Account menu"
            aria-expanded={menuOpen}
            className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
              menuOpen ? 'bg-content/10 text-content' : 'text-content/55 hover:text-content hover:bg-content/5'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  )
}
