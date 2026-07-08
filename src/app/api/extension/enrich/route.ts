import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createPending } from '@/lib/phoneStore'

// Waterfall contact enrichment for the Sonibel extension. Tries data providers
// in order and falls through until it gets a hit, labelling every result by
// source and returning a "sources tried" trace the UI can show off:
//
//   1. Apollo People Match   — email (if unlocked) + phone(s) + org/domain
//   2. Hunter email-finder   — pinpoint email from domain + name
//   3. Hunter domain-search  — name-match in the company's known emails (+ pattern)
//   4. Pattern guess + verify — build {pattern}@domain, verify with Hunter (free)
//
// Phone is Apollo-only (Hunter has no phones); add a phone provider to the
// chain below to waterfall phones too. Auth: x-nb-key === EXTENSION_API_KEY.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nb-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

// Apollo's placeholder for a locked email; treat as "no email".
function realEmail(email?: string | null): string | null {
  if (!email) return null
  if (/email_not_unlocked|notunlocked|locked/i.test(email)) return null
  if (!email.includes('@')) return null
  return email
}

type Phone = { number: string; type: string; source: string }

function dedupePhones(phones: Phone[]): Phone[] {
  const seen = new Set<string>()
  const out: Phone[] = []
  for (const p of phones) {
    const key = (p.number || '').replace(/\D/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(p)
  }
  return out
}

// From a set of candidate domains, pick the registrable apex (fewest dots,
// then shortest) — avoids press/subdomains like newsroom.hii.com.
function pickApex(domains: (string | undefined)[]): string {
  const valid = domains.filter((d): d is string => typeof d === 'string' && d.includes('.'))
  if (!valid.length) return ''
  return valid.sort((a, b) => {
    const da = a.split('.').length
    const db = b.split('.').length
    return da !== db ? da - db : a.length - b.length
  })[0]
}

// Fill a Hunter-style email pattern ({first}.{last}, {f}{last}, …) for a person.
function applyPattern(pattern: string | null | undefined, first: string, last: string, domain: string): string | null {
  if (!pattern || !domain) return null
  const f = (first || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const l = (last || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!f) return null
  let local = pattern
    .replace(/\{first\}/gi, f)
    .replace(/\{last\}/gi, l)
    .replace(/\{f\}/gi, f.charAt(0))
    .replace(/\{l\}/gi, l.charAt(0))
    .replace(/[{}]/g, '')
  if (!local) return null
  return `${local}@${domain}`
}

interface ApolloPhone { sanitized_number?: string; raw_number?: string; type?: string }
interface ApolloOrg { name?: string; primary_domain?: string; phone?: string; sanitized_phone?: string }
interface ApolloPerson {
  first_name?: string; last_name?: string; name?: string; title?: string
  email?: string; email_status?: string; personal_emails?: string[]
  phone_numbers?: ApolloPhone[]; linkedin_url?: string; organization?: ApolloOrg
}

type Ctx = {
  firstName: string; lastName: string; name: string
  company: string; domain: string; linkedinUrl: string; title: string
  companies: string[] // current + past employers, most relevant first
  pattern?: string
}

type Trace = { source: string; status: 'hit' | 'miss' | 'skipped' | 'error'; detail: string; ms: number }

type Acc = {
  name: string; title: string; company: string; domain: string; linkedinUrl: string
  email: string | null; emailStatus: string | null; personalEmails: string[]
  phones: Phone[]; phone: string | null
  phonePending: boolean; phoneRequestId: string | null
  source: string; notes: string[]; waterfall: Trace[]; debug?: unknown
}

function noteSource(acc: Acc, name: string) {
  acc.source = acc.source && acc.source !== 'none' ? `${acc.source}+${name}` : name
}

// ---- providers -------------------------------------------------------------

async function providerApollo(ctx: Ctx, acc: Acc): Promise<{ status: Trace['status']; detail: string }> {
  const apolloKey = process.env.APOLLO_API_KEY
  if (!apolloKey) return { status: 'skipped', detail: 'no APOLLO_API_KEY' }

  const phoneWebhook = process.env.APOLLO_PHONE_WEBHOOK_URL
  // Prepare a phone-reveal request id, but DON'T mark the phone "pending" yet —
  // only do that once Apollo actually accepts the request (below). Otherwise an
  // Apollo error leaves the UI spinning on a callback that will never come.
  let reqId: string | null = null
  const matchBody: Record<string, unknown> = { reveal_personal_emails: true }
  if (phoneWebhook) {
    reqId = randomUUID()
    const sep = phoneWebhook.includes('?') ? '&' : '?'
    matchBody.reveal_phone_number = true
    matchBody.webhook_url = `${phoneWebhook}${sep}id=${reqId}`
  }
  if (ctx.firstName) matchBody.first_name = ctx.firstName
  if (ctx.lastName) matchBody.last_name = ctx.lastName
  if (ctx.linkedinUrl) matchBody.linkedin_url = ctx.linkedinUrl
  if (ctx.domain) matchBody.domain = ctx.domain
  else if (ctx.company) matchBody.organization_name = ctx.company

  const res = await fetch('https://api.apollo.io/api/v1/people/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'X-Api-Key': apolloKey },
    body: JSON.stringify(matchBody),
  })
  if (!res.ok) {
    const bodyText = await res.text()
    // Apollo returns 422 both for "out of credits" and for an unmatchable
    // request — distinguish them so the trace is honest.
    if (/insufficient credits|lead credits/i.test(bodyText)) {
      return { status: 'error', detail: 'Apollo out of credits — Hunter still covers email; phone needs Apollo credits' }
    }
    if (res.status === 422) return { status: 'miss', detail: 'no match — add a company or domain' }
    acc.debug = bodyText.slice(0, 300)
    return { status: 'error', detail: `Apollo HTTP ${res.status}` }
  }
  const data = await res.json()
  const person: ApolloPerson | undefined = data.person
  if (!person) return { status: 'miss', detail: 'no matching person' }

  acc.title = acc.title || person.title || ''
  acc.company = acc.company || person.organization?.name || ''
  acc.domain = acc.domain || person.organization?.primary_domain || ''
  acc.linkedinUrl = acc.linkedinUrl || person.linkedin_url || ''
  acc.name = acc.name || person.name || `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim()
  ctx.domain = ctx.domain || acc.domain

  const email = realEmail(person.email)
  if (email) {
    acc.email = email
    acc.emailStatus = person.email_status ?? 'unknown'
    noteSource(acc, 'apollo')
  }
  if (Array.isArray(person.personal_emails)) {
    acc.personalEmails = person.personal_emails.filter((e) => realEmail(e)) as string[]
  }

  const phones: Phone[] = []
  for (const p of person.phone_numbers ?? []) {
    const num = p.sanitized_number || p.raw_number
    if (num) phones.push({ number: num, type: p.type || 'direct', source: 'apollo:person' })
  }
  const orgPhone = person.organization?.sanitized_phone || person.organization?.phone
  if (orgPhone) phones.push({ number: orgPhone, type: 'company HQ', source: 'apollo:org' })
  acc.phones = dedupePhones([...acc.phones, ...phones])
  acc.phone = acc.phones[0]?.number ?? null

  // Apollo accepted the match. If a phone reveal was requested and we have no
  // sync phone, register the pending lookup so the UI polls for the webhook.
  if (reqId && !acc.phones.length) {
    createPending(reqId)
    acc.phoneRequestId = reqId
    acc.phonePending = true
  }

  const bits: string[] = []
  bits.push(email ? 'email unlocked' : 'email locked/none')
  bits.push(acc.phones.length ? `${acc.phones.length} phone(s)` : 'no sync phone')
  return { status: email || acc.phones.length ? 'hit' : 'miss', detail: `matched — ${bits.join(', ')}` }
}

async function hunterGetJson(url: URL): Promise<{ ok: boolean; data?: Record<string, unknown> }> {
  try {
    const r = await fetch(url)
    if (!r.ok) return { ok: false }
    const j = await r.json()
    return { ok: true, data: j.data ?? {} }
  } catch {
    return { ok: false }
  }
}

// Try ONE company through the full Hunter chain: resolve its domain, then
// directory name-match → email-finder → pattern-guess+verify. Sets acc.email on
// the first hit. This is the unit the waterfall loops over the person's
// employers (current + past experience) with.
async function hunterTryCompany(company: string, ctx: Ctx, acc: Acc): Promise<{ status: Trace['status']; detail: string }> {
  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return { status: 'skipped', detail: 'no HUNTER_API_KEY' }
  if (!company) return { status: 'skipped', detail: 'no company' }

  // 1. company -> apex domain (+ pattern + directory name-match)
  const ds = new URL('https://api.hunter.io/v2/domain-search')
  ds.searchParams.set('company', company)
  ds.searchParams.set('api_key', hunterKey)
  ds.searchParams.set('limit', '10') // this plan caps results at 10
  const dsr = await hunterGetJson(ds)
  if (!dsr.ok) return { status: 'error', detail: `${company}: Hunter domain-search failed` }
  // Hunter sometimes returns a subdomain (newsroom.hii.com) as `domain`; the
  // real apex is in linked_domains — pick the apex.
  const domain = pickApex([dsr.data?.domain as string, ...((dsr.data?.linked_domains as string[]) ?? [])])
  const pattern = (dsr.data?.pattern as string) || ctx.pattern

  const emails = (dsr.data?.emails as Array<{ first_name?: string; last_name?: string; email?: string; confidence?: number }>) ?? []
  const fn = ctx.firstName.toLowerCase()
  const ln = ctx.lastName.toLowerCase()
  const m =
    emails.find((c) => (c.first_name ?? '').toLowerCase() === fn && (!ln || (c.last_name ?? '').toLowerCase() === ln)) ||
    emails.find((c) => (c.first_name ?? '').toLowerCase() === fn)
  const dirEmail = realEmail(m?.email)
  if (dirEmail) {
    acc.email = dirEmail
    acc.emailStatus = `hunter:${m?.confidence ?? '?'}`
    acc.domain = acc.domain || domain
    noteSource(acc, 'hunter')
    return { status: 'hit', detail: `${company} → ${dirEmail} (directory)` }
  }
  if (!domain) return { status: 'miss', detail: `${company}: no domain found` }
  acc.domain = acc.domain || domain

  // 2. email-finder (domain + name)
  if (ctx.firstName) {
    const ef = new URL('https://api.hunter.io/v2/email-finder')
    ef.searchParams.set('domain', domain)
    ef.searchParams.set('first_name', ctx.firstName)
    if (ctx.lastName) ef.searchParams.set('last_name', ctx.lastName)
    ef.searchParams.set('api_key', hunterKey)
    const efr = await hunterGetJson(ef)
    const found = realEmail(efr.data?.email as string)
    if (found) {
      acc.email = found
      acc.emailStatus = `hunter:${efr.data?.score ?? '?'}`
      noteSource(acc, 'hunter')
      return { status: 'hit', detail: `${company} (${domain}) → ${found} (finder ${efr.data?.score ?? '?'})` }
    }
  }

  // 3. pattern guess + verify
  const candidate = applyPattern(pattern || '{first}.{last}', ctx.firstName, ctx.lastName, domain)
  if (candidate) {
    const ev = new URL('https://api.hunter.io/v2/email-verifier')
    ev.searchParams.set('email', candidate)
    ev.searchParams.set('api_key', hunterKey)
    const evr = await hunterGetJson(ev)
    const status = (evr.data?.status as string) ?? 'unknown'
    const score = (evr.data?.score as number) ?? 0
    if (status === 'valid' || status === 'accept_all' || score >= 80) {
      acc.email = candidate
      acc.emailStatus = `guess-verified:${status}/${score}`
      noteSource(acc, 'guess')
      return { status: 'hit', detail: `${company} (${domain}) → guessed ${candidate} (${status})` }
    }
  }
  return { status: 'miss', detail: `${company} (${domain}): no email` }
}

// LinkedIn's DOM is too brittle to reliably scrape the current employer
// client-side, so when the company is missing we let Claude read the profile
// text (main.innerText) and pull out the CURRENT company + role + name. This is
// what makes the waterfall work on any profile, not just ones where a CSS
// selector happened to match.
async function parseProfile(profileText: string, nameHint: string) {
  const client = new Anthropic()
  const prompt = `From this LinkedIn profile text, extract the person's name, current role, and EVERY employer/organization in their Experience (current first, then past roles).

Return ONLY JSON, no prose:
{"firstName":"","lastName":"","title":"","companies":["",""]}

Rules for "companies":
- List actual employers from their work experience, most recent first.
- Put real companies BEFORE schools/universities (a "BCom Candidate at UBC" should list any internship employers first, then UBC last).
- Up to 5. Use a real company name, not a job title. Empty array if none are clear.

Name hint: ${nameHint || '(none)'}

Profile text:
${profileText.slice(0, 2000)}`
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })
  const content = msg.content[0]
  if (content.type !== 'text') return null
  const stripped = content.text.replace(/```json\n?|\n?```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(stripped.slice(start, end + 1)) as {
      firstName?: string; lastName?: string; title?: string; companies?: string[]
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-nb-key')
  if (!process.env.EXTENSION_API_KEY || key !== process.env.EXTENSION_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const body = await request.json().catch(() => ({}))
  let { name = '', firstName = '', lastName = '', company = '', domain = '', linkedinUrl = '', title = '' } =
    body as Record<string, string>
  const profileText: string = (body as Record<string, string>).profileText || ''

  if ((!firstName || !lastName) && name) {
    const parts = name.trim().split(/\s+/)
    firstName = firstName || parts[0] || ''
    lastName = lastName || (parts.length > 1 ? parts[parts.length - 1] : '')
  }
  if (!firstName && !linkedinUrl) {
    return NextResponse.json({ error: 'Provide at least a name or a LinkedIn URL.' }, { status: 400, headers: corsHeaders })
  }

  const ctx: Ctx = { firstName, lastName, name, company, domain, linkedinUrl, title, companies: company ? [company] : [] }
  const acc: Acc = {
    name: name || `${firstName} ${lastName}`.trim(),
    title, company, domain, linkedinUrl,
    email: null, emailStatus: null, personalEmails: [],
    phones: [], phone: null, phonePending: false, phoneRequestId: null,
    source: 'none', notes: [], waterfall: [],
  }

  // Pre-step: when we don't already have a company/domain, let Claude read the
  // profile text and pull out EVERY employer (current + past experience). This
  // both unblocks scraping failures and gives the waterfall multiple companies
  // to try.
  if (!ctx.company && !ctx.domain && profileText) {
    const t0 = Date.now()
    try {
      const parsed = await parseProfile(profileText, acc.name)
      const companies = (parsed?.companies ?? []).map((c) => (c || '').trim()).filter(Boolean)
      // de-dupe, keep order
      ctx.companies = [...new Set(companies)]
      if (ctx.companies.length) {
        ctx.company = ctx.companies[0]
        acc.company = acc.company || ctx.companies[0]
      }
      if (parsed?.title && !ctx.title) {
        ctx.title = parsed.title
        acc.title = acc.title || parsed.title
      }
      if (parsed?.firstName && !ctx.firstName) ctx.firstName = parsed.firstName
      if (parsed?.lastName && !ctx.lastName) ctx.lastName = parsed.lastName
      acc.waterfall.push({
        source: 'Profile parse (Claude)',
        status: ctx.companies.length ? 'hit' : 'miss',
        detail: ctx.companies.length
          ? `read profile → ${ctx.companies.join(', ')}`
          : 'no employer found in profile text',
        ms: Date.now() - t0,
      })
    } catch (e) {
      acc.waterfall.push({
        source: 'Profile parse (Claude)',
        status: 'error',
        detail: e instanceof Error ? e.message : 'parse failed',
        ms: Date.now() - t0,
      })
    }
  }

  // Step 1: Apollo (matches on LinkedIn URL / primary company; returns phone).
  {
    const t0 = Date.now()
    let outcome: { status: Trace['status']; detail: string }
    try {
      outcome = await providerApollo(ctx, acc)
    } catch (e) {
      outcome = { status: 'error', detail: e instanceof Error ? e.message : 'failed' }
    }
    acc.waterfall.push({ source: 'Apollo People Match', status: outcome.status, detail: outcome.detail, ms: Date.now() - t0 })
  }

  // Step 2: if Apollo didn't get an email, waterfall Hunter across each employer
  // (current + past) until one yields an email. Cap to keep API usage sane.
  if (!acc.email) {
    const toTry = (ctx.companies.length ? ctx.companies : ctx.company ? [ctx.company] : []).slice(0, 4)
    for (const co of toTry) {
      const t0 = Date.now()
      let outcome: { status: Trace['status']; detail: string }
      try {
        outcome = await hunterTryCompany(co, ctx, acc)
      } catch (e) {
        outcome = { status: 'error', detail: e instanceof Error ? e.message : 'failed' }
      }
      acc.waterfall.push({ source: `Hunter · ${co}`, status: outcome.status, detail: outcome.detail, ms: Date.now() - t0 })
      if (acc.email) break
    }
  }

  // Phone note. Only say "looking up" when a reveal is genuinely in flight;
  // only say "no phone on file" when we actually found the person (an email).
  // If we found nothing at all, the summary note below covers it.
  if (!acc.phones.length) {
    if (acc.phonePending) {
      acc.notes.push('Phone is being looked up — Apollo returns it asynchronously, so it may arrive a few seconds after the email.')
    } else if (acc.email) {
      acc.notes.push('No phone on file for this contact.')
    }
  }
  if (!acc.email && !acc.phone) {
    acc.notes.unshift('No contact details found across all sources. Try adding the company name.')
  }

  return NextResponse.json(acc, { headers: corsHeaders })
}
