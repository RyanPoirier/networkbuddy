// Hunter.io — the reliability layer that runs at REVEAL time (cheap, and the
// key is already configured). Two jobs: verify an email is deliverable, and
// find/backfill an email when a provider didn't return one.

export interface EmailVerification {
  email: string
  verified: boolean            // deliverable per Hunter
  result: string               // deliverable | risky | undeliverable | unknown
  score: number                // Hunter confidence 0-100
}

export function hunterConfigured(): boolean {
  return Boolean(process.env.HUNTER_API_KEY)
}

// Verify deliverability of a known email.
export async function verifyEmail(email: string): Promise<EmailVerification | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key || !email) return null
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`
    )
    if (!res.ok) return null
    const data = await res.json()
    const result: string = data.data?.result ?? 'unknown'
    return { email, verified: result === 'deliverable', result, score: data.data?.score ?? 0 }
  } catch {
    return null
  }
}

// Find an email by name when a provider returned none. Matches Hunter's
// domain-search results on first name (reused from the existing find-email route).
export async function findEmail(
  fullName: string,
  domain?: string | null,
  company?: string | null
): Promise<EmailVerification | null> {
  const key = process.env.HUNTER_API_KEY
  if (!key || !fullName) return null
  const searchParam = domain
    ? `domain=${encodeURIComponent(domain)}`
    : company
      ? `company=${encodeURIComponent(company)}`
      : null
  if (!searchParam) return null

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?${searchParam}&api_key=${key}&limit=100`
    )
    if (!res.ok) return null
    const data = await res.json()
    const emails: Array<{ first_name?: string; email?: string; confidence?: number }> =
      data.data?.emails ?? []
    const first = fullName.trim().split(' ')[0].toLowerCase()
    const match = emails.find((c) => (c.first_name ?? '').toLowerCase() === first)
    if (!match?.email) return null
    const score = match.confidence ?? 0
    return { email: match.email, verified: score >= 90, result: 'found', score }
  } catch {
    return null
  }
}
