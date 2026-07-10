#!/usr/bin/env node
/*
 * PDL coverage check — the $0 go/no-go test for Network Buddy.
 *
 * Answers the one question that gates the whole company: does PDL actually have
 * the people students want to find (interns, by company + office city), with a
 * reachable contact?
 *
 * HOW TO USE HONESTLY (per the pilot design):
 *  1. Get real students to WRITE the 15 targets below BEFORE you run this.
 *     Do NOT cherry-pick easy ones (BCG Toronto, RBC). Include the ugly,
 *     specific, mid-tier ones students will actually type. Pre-register them.
 *  2. Add your PDL key to .env.local as  PDL_API_KEY=...  (free tier = 100
 *     records/mo; this script caps size to stay under that).
 *  3. Run:  node scripts/pdl-coverage-check.mjs
 *
 * Verdict: green if >=60% of targets return >=3 usable people; kill if <40%.
 * Report the honest hit-rate INCLUDING the misses.
 */

import fs from 'node:fs'
import path from 'node:path'

// ---- 15 PRE-REGISTERED, STUDENT-WRITTEN TARGETS -----------------------------
// Replace these with the real searches your pilot students wrote. Each is
// "someone who interned at <company> in <city>" (+ optional specific name).
// Keep the mix realistic: not all elite/dense targets.
const TARGETS = [
  { label: 'BCG summer intern in Toronto',        company: 'Boston Consulting Group', city: 'Toronto',   intern: true },
  { label: 'RBC Capital Markets intern Toronto',  company: 'RBC Capital Markets',      city: 'Toronto',   intern: true },
  { label: 'Deloitte intern in Vancouver',        company: 'Deloitte',                 city: 'Vancouver', intern: true },
  { label: 'Amazon SWE intern in Vancouver',      company: 'Amazon',                   city: 'Vancouver', intern: true, title: 'software' },
  { label: 'KPMG co-op in Vancouver',             company: 'KPMG',                     city: 'Vancouver', intern: true },
  { label: 'TD intern in Toronto',                company: 'TD',                       city: 'Toronto',   intern: true },
  { label: 'PwC intern in Vancouver',             company: 'PwC',                      city: 'Vancouver', intern: true },
  { label: 'Microsoft intern in Vancouver',       company: 'Microsoft',                city: 'Vancouver', intern: true, title: 'software' },
  { label: 'EY intern in Vancouver',              company: 'EY',                       city: 'Vancouver', intern: true },
  { label: 'Scotiabank intern in Toronto',        company: 'Scotiabank',               city: 'Toronto',   intern: true },
  // Add 5 more that YOUR students actually wrote — include harder/mid-tier ones.
]

// ---- PDL query --------------------------------------------------------------
const esc = (s) => String(s).replace(/'/g, "''").toLowerCase().trim()

function buildSql(t) {
  const where = [`experience.company.name='${esc(t.company)}'`]
  if (t.intern) where.push(`experience.title.levels='training'`)
  else if (t.title) where.push(`experience.title.name LIKE '%${esc(t.title)}%'`)
  if (t.title && t.intern) where.push(`experience.title.name LIKE '%${esc(t.title)}%'`)
  if (t.city) where.push(`experience.location_names='${esc(t.city)}'`)
  if (t.name) where.push(`full_name='${esc(t.name)}'`)
  return `SELECT * FROM person WHERE ${where.join(' AND ')}`
}

function loadKey() {
  if (process.env.PDL_API_KEY) return process.env.PDL_API_KEY
  try {
    const env = fs.readFileSync(path.resolve('.env.local'), 'utf8')
    const m = env.match(/^PDL_API_KEY=(.*)$/m)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  } catch {}
  return null
}

async function search(key, sql) {
  const res = await fetch('https://api.peopledatalabs.com/v5/person/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
    // size kept low: PDL bills 1 credit PER returned record. 15 * 5 = 75 < 100.
    body: JSON.stringify({ sql, size: 5, dataset: 'all' }),
  })
  if (!res.ok) return { error: `${res.status} ${await res.text()}`.slice(0, 120), people: [] }
  const data = await res.json()
  return { people: data.data ?? [], total: data.total ?? 0 }
}

const usable = (p) => Boolean((p.full_name || (p.first_name && p.last_name)) && (p.work_email || p.emails?.length || p.linkedin_url))
const hasEmail = (p) => Boolean(p.work_email || p.emails?.length)

async function main() {
  const key = loadKey()
  if (!key) {
    console.error('\n  No PDL_API_KEY found. Add it to .env.local, then re-run.\n  (Free tier: peopledatalabs.com — 100 records/mo, no card.)\n')
    process.exit(1)
  }

  console.log(`\n  PDL coverage check — ${TARGETS.length} targets, size=5 each (~${TARGETS.length * 5} credits max)\n`)
  let hits = 0
  for (const t of TARGETS) {
    const { people, error } = await search(key, buildSql(t))
    if (error) { console.log(`  ✗  ${t.label.padEnd(38)}  ERROR ${error}`); continue }
    const u = people.filter(usable).length
    const e = people.filter(hasEmail).length
    const hit = u >= 3
    if (hit) hits++
    console.log(`  ${hit ? '✓' : '·'}  ${t.label.padEnd(38)}  found ${people.length}  usable ${u}  w/email ${e}  ${hit ? 'HIT' : 'miss'}`)
  }

  const rate = Math.round((hits / TARGETS.length) * 100)
  const verdict = rate >= 60 ? 'GREEN — PDL covers your students. Build the pilot.'
    : rate < 40 ? 'RED — coverage too thin. The differentiated product is not viable on this data.'
    : 'AMBER — borderline. Widen the sample and decide with more targets.'
  console.log(`\n  Hit-rate: ${hits}/${TARGETS.length} = ${rate}%   →   ${verdict}\n`)
}

main()
