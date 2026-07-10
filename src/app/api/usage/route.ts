import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUsage } from '@/lib/quota'

// Lightweight read of the caller's plan + reveal usage, so the UI can show the
// quota / god-mode badge on page load without running a search.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const usage = await getUsage(user.id)
  return NextResponse.json({ plan: usage.plan, used: usage.used, quota: usage.quota })
}
