import { createAdminClient } from '@/lib/supabase/admin'

// Gmail send integration. Uses the restricted `gmail.send` scope so the app can
// send drip emails from the student's own mailbox in the background.
//
// Setup required (see docs at end of file / the setup note):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET  — from Google Cloud console
//   NEXT_PUBLIC_SITE_URL                    — used to build the redirect URI
//   Publish the OAuth app to "In production" (unverified is fine <100 users)
//   so refresh tokens are long-lived (no 7-day reconnect).

// gmail.send (restricted) to send; gmail.metadata (restricted) to detect
// replies from thread headers only (never reads message bodies); email/openid
// (non-sensitive) to learn which address they connected.
const SCOPE =
  'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.metadata openid email'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

// The connected address, so we can show it and send From it.
export async function getUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.email ?? null
}

function redirectUri(): string {
  // Explicit override lets you test locally (localhost) without changing the
  // production NEXT_PUBLIC_SITE_URL. Must exactly match a redirect URI you
  // registered in the Google Cloud console.
  return process.env.GOOGLE_REDIRECT_URI ?? `${process.env.NEXT_PUBLIC_SITE_URL}/api/gmail/callback`
}

// Step 1: the consent URL the student is sent to.
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // gets a refresh token
    prompt: 'consent', // force refresh_token issuance on reconnect
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  error?: string
}

// Step 2: exchange the auth code for tokens.
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  return res.json()
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      grant_type: 'refresh_token',
    }),
  })
  return res.json()
}

// Read the user's stored Gmail account and return a currently-valid access
// token, refreshing (and persisting) it if expired. Server-only (service role).
export async function getValidAccessToken(
  userId: string
): Promise<{ accessToken: string; email: string } | null> {
  const admin = createAdminClient()
  const { data: acct } = await admin
    .from('gmail_accounts')
    .select('email, refresh_token, access_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!acct) return null

  const stillValid =
    acct.access_token &&
    acct.token_expires_at &&
    new Date(acct.token_expires_at).getTime() - Date.now() > 60_000 // 1-min buffer
  if (stillValid) return { accessToken: acct.access_token, email: acct.email }

  const refreshed = await refreshAccessToken(acct.refresh_token)
  if (!refreshed.access_token) return null
  const expiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
  await admin
    .from('gmail_accounts')
    .update({ access_token: refreshed.access_token, token_expires_at: expiresAt })
    .eq('user_id', userId)
  return { accessToken: refreshed.access_token, email: acct.email }
}

// Has the contact replied on this thread? Reads header metadata only (no
// bodies) — looks for any message whose From isn't the student's own address.
export async function threadHasReply(
  accessToken: string,
  threadId: string,
  selfEmail: string
): Promise<boolean> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) return false
  const data = await res.json()
  const self = selfEmail.toLowerCase()
  for (const m of data.messages ?? []) {
    const from = (m.payload?.headers ?? []).find(
      (h: { name: string; value: string }) => h.name.toLowerCase() === 'from'
    )?.value?.toLowerCase() ?? ''
    // A message not from the student = a reply (skip auto-only heuristics for now).
    if (from && !from.includes(self)) return true
  }
  return false
}

// Send a plain-text email from the authenticated mailbox. threadId keeps
// follow-ups on the same thread.
export async function sendGmail(
  accessToken: string,
  msg: { to: string; subject: string; body: string; threadId?: string }
): Promise<{ id: string; threadId: string } | { error: string }> {
  const mime = [
    `To: ${msg.to}`,
    `Subject: ${msg.subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    msg.body,
  ].join('\r\n')
  const raw = Buffer.from(mime).toString('base64url')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, ...(msg.threadId ? { threadId: msg.threadId } : {}) }),
  })
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` }
  const data = await res.json()
  return { id: data.id, threadId: data.threadId }
}
