'use client'

import { useCallback, useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'
const STORAGE_KEY = 'nb-theme'

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

// Resolve a preference to the concrete class state, then toggle `.dark`.
function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', dark)
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>('system')

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemePref | null) ?? 'system'
    setPref(stored)
  }, [])

  // Keep "system" in sync with OS changes while that mode is selected.
  useEffect(() => {
    if (pref !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [pref])

  const setTheme = useCallback((next: ThemePref) => {
    setPref(next)
    localStorage.setItem(STORAGE_KEY, next)
    apply(next)
  }, [])

  return { pref, setTheme }
}
