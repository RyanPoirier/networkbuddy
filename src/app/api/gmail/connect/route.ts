import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUrl } from '@/lib/gmail'

// Kick off the Gmail OAuth flow — redirects the student to Google's consent.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.GOOGLE_CLIENT_ID) {
    return NextResponse.json({ error: 'Gmail not configured' }, { status: 500 })
  }
  return NextResponse.redirect(getAuthUrl(user.id))
}
