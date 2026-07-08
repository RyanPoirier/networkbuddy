import { NextRequest, NextResponse } from 'next/server'
import { resolvePhones } from '@/lib/phoneStore'

// Apollo calls this back (asynchronously) with the revealed phone number(s).
// We correlate it to the original request via the ?id= we appended to the
// webhook_url. Apollo's payload shape varies, so we parse defensively: pull
// phone numbers from whatever person/contact records are present.

interface ApolloPhone {
  sanitized_number?: string
  raw_number?: string
  number?: string
  type?: string
  phone_type?: string
}
interface ApolloPersonish {
  phone_numbers?: ApolloPhone[]
  sanitized_phone?: string
  phone?: string
}

function pull(records: ApolloPersonish[]): { number: string; type: string }[] {
  const out: { number: string; type: string }[] = []
  for (const r of records) {
    for (const p of r.phone_numbers ?? []) {
      const num = p.sanitized_number || p.raw_number || p.number
      if (num) out.push({ number: num, type: p.type || p.phone_type || 'direct' })
    }
    const single = r.sanitized_phone || r.phone
    if (single) out.push({ number: single, type: 'direct' })
  }
  // de-dupe by digits
  const seen = new Set<string>()
  return out.filter((p) => {
    const k = p.number.replace(/\D/g, '')
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export async function POST(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    /* Apollo may send empty/non-JSON pings */
  }

  // Gather any person/contact-like records out of the payload.
  const b = (body ?? {}) as Record<string, unknown>
  const records: ApolloPersonish[] = []
  if (Array.isArray(b.people)) records.push(...(b.people as ApolloPersonish[]))
  if (Array.isArray(b.contacts)) records.push(...(b.contacts as ApolloPersonish[]))
  if (b.person) records.push(b.person as ApolloPersonish)
  if (b.contact) records.push(b.contact as ApolloPersonish)
  // Sometimes the person fields sit at the top level.
  records.push(b as ApolloPersonish)

  const phones = pull(records)
  if (id) resolvePhones(id, phones)

  return NextResponse.json({ ok: true, received: phones.length })
}

// Allow a quick manual check in the browser.
export async function GET() {
  return NextResponse.json({ ok: true, hint: 'Apollo phone webhook receiver. POST only.' })
}
