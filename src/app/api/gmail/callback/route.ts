import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode, getUserEmail } from '@/lib/gmail'
import { createAdminClient } from '@/lib/supabase/admin'

// Google redirects here after consent. Exchange the code, store the tokens.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const userId = request.nextUrl.searchParams.get('state') // we set state = user.id
  // Redirect back to whatever host handled the callback (localhost or prod).
  const base = request.nextUrl.origin

  if (!code || !userId) {
    return NextResponse.redirect(`${base}/outreach?gmail=error`)
  }

  const tokens = await exchangeCode(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    // No refresh_token usually means they'd connected before without prompt=consent.
    return NextResponse.redirect(`${base}/outreach?gmail=error`)
  }

  const email = (await getUserEmail(tokens.access_token)) ?? ''
  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString()

  const admin = createAdminClient()
  await admin.from('gmail_accounts').upsert({
    user_id: userId,
    email,
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    token_expires_at: expiresAt,
    connected_at: new Date().toISOString(),
  })

  return NextResponse.redirect(`${base}/outreach?gmail=connected`)
}
