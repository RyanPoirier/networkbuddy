# NetworkBuddy — Engineering & Strategy Handoff

> **Audience:** the next AI agent (GPT-5.6) picking up this project.
> **Written by:** the previous agent (Claude), after a long working session with the founder, Ryan.
> **Date:** July 2026.
> **Repo:** `~/dev/networkbuddy` · GitHub `github.com/RyanPoirier/networkbuddy` · deploys to Vercel (`networkbuddy.vercel.app`, target domain `networkbuddy.ca`).
>
> Read this end-to-end before touching code. It has the *why*, not just the *what*. At the bottom there's an explicit "think about this" brief — Ryan wants you to reason about the product, not just execute.

---

## 0. TL;DR for the impatient

NetworkBuddy helps **university students land referrals at their dream companies**. The flow: **discover the right people → reveal their contact info → send AI-personalized outreach → track it in a CRM.**

The hardest, most valuable, and most recently-worked-on part is **people search**. We just made a breakthrough: we moved off Apollo-only (which capped at ~13 results for "IB analysts at RBC") to a **multi-source semantic pipeline** (Exa + Apollo + an AI relevance gate) that returns **40–100+ genuinely-matching people per search**. That pipeline, its economics, and its next steps are the center of gravity of this document.

**Single most important insight of the whole session:** *Apollo (and every B2B contact DB) indexes people by their current job title. But users search by things that aren't in the title — research field, sub-specialty, alma mater, career stage. The fix is semantic search over the full profile (Exa) for recall + an LLM to vet relevance for precision.*

---

## 1. What the product is

- **User:** university/college students (starting with UBC / Canadian schools) trying to break into competitive fields — investment banking, consulting, tech, VC.
- **Job to be done:** "I want a referral / warm intro at [company/field]. Find me the right people and help me reach out without sounding like a robot."
- **Business model:** freemium.
  - **Free:** unlimited *search* (masked results), a small monthly quota of *reveals* (unmasking contact info costs 1 credit).
  - **Pro:** bigger reveal quota + premium sources (history/past-experience search) + automated outreach sequences.
  - **God mode:** founder/admin allowlist (`ADMIN_USER_IDS`) = unlimited everything, bypasses the quota table. (This is how Ryan tests.)
- **Why it can win:** students network *terribly* (generic LinkedIn spam). A tool that (a) finds the *right* people — especially alumni & peers — and (b) writes genuinely personal outreach is a real edge. The moat is data + student-specific ranking (see §6).

---

## 2. Tech stack & where things live

- **Next.js 16** App Router (Turbopack), React client + server components, route handlers.
- **Supabase**: Auth (email/password + Google OAuth), Postgres + RLS, service-role admin client. Migrations in `supabase/`.
- **Tailwind CSS v4** (`@import "tailwindcss"`, `@theme inline`, semantic tokens that flip on `.dark`).
- **Anthropic SDK**: `claude-sonnet-4-6` for query parsing & outreach generation; `claude-haiku-4-5-20251001` for the fast relevance gate.
- **People data**: Apollo (live), **Exa (new, live)**, Coresignal (scaffolded, dormant), PDL (scaffolded, dormant), Hunter.io (email verify/find).
- **Gmail API** for automated sending (OAuth, drip 3/day, follow-ups, reply detection).
- **Vercel Cron** for the send/reply jobs.

### Key files
```
src/app/(app)/search/page.tsx        # THE search UI (masked table, reveal, audit view, god-mode badge)
src/app/(app)/outreach/page.tsx      # Campaign activity view
src/app/(app)/crm/page.tsx           # Kanban pipeline (dnd-kit)
src/app/(app)/dashboard/page.tsx     # Stats
src/app/(app)/account/page.tsx       # Name/email/password w/ password step-up
src/components/layout/AppNav.tsx     # Sidebar + account menu (Appearance toggle, Account, Sign out)
src/app/globals.css                  # Brand tokens (light + dark palettes)

src/app/api/contacts/nl-search/route.ts   # ⭐ THE search pipeline (parse → fan-out → relax → AI-gate → audit)
src/app/api/contacts/reveal/route.ts      # Apollo enrichment on reveal (1 credit)
src/app/api/usage/route.ts                # Plan/quota read (powers the badge on load)

src/lib/providers/
  types.ts        # SearchFilters, ProviderPerson, PeopleProvider interface, ProviderName union
  index.ts        # searchAll(): fan-out + dedupe(by linkedin)/merge + fallback sources
  apollo.ts       # Apollo mixed_people search (title/industry/location/size/funding + Lever-1 broadening)
  exa.ts          # ⭐ Exa People Search (semantic, searches filters.raw_query)
  coresignal.ts   # scaffolded, needs a key + ES-DSL query building
  pdl.ts          # scaffolded
  hunter.ts       # email verify/find
src/lib/quota.ts  # PLAN_QUOTAS, isAdmin (god mode), getUsage, consumeReveals
src/lib/gmail.ts  # OAuth + send + reply detection

src/app/api/cron/send-emails/route.ts     # hourly drip send (threads follow-ups)
src/app/api/cron/check-replies/route.ts   # reply detection, stops sequence on reply
vercel.json                               # cron schedules
```

---

## 3. ⭐ The search pipeline (read this carefully — it's the heart)

`POST /api/contacts/nl-search` does this, in order:

1. **Parse** the natural-language query with `claude-sonnet-4-6` → structured `SearchFilters` (titles, locations, industries, company, size, funding stage, history intent, `person_name`, etc.). Also stashes the **raw query** untouched in `filters.raw_query`.
2. **Fan out** via `searchAll()` to the active providers — currently **`['apollo', 'exa']`** (providers auto-skip if their API key is missing).
   - **Apollo** searches structured filters. Full page (`per_page: 100`). Includes two cleverness layers:
     - **Title ranking + backfill:** for title-only searches (no company), rows whose title literally contains all significant words of a requested title rank first; the rest backfill. (Fixes "GTM Engineer" flooding in generic engineers, without hard-dropping.)
     - **Lever 1 — broad-role backfill:** when the page isn't full and an industry is set, re-search on the bare *role word* (researcher/scientist/analyst…) scoped to that industry+location and backfill. Recovers field searches ("cancer researcher" → "Research Scientist @ BC Cancer").
     - **Location fallback:** when a company is named and the location-scoped search returns 0 (Apollo city data is sparse), fall back to company-only — except for intern queries (avoids the old "BCG interns → India" leak).
   - **Exa** ignores the structured filters and semantic-searches `filters.raw_query` over **1B+ full profiles** (headline + full work history + education). Pulls its max 100. Returns **full names + LinkedIn URLs, unmasked, no email**.
3. **Dedupe/merge** by LinkedIn URL (falls back to `firstName|company`). A person found by both Apollo and Exa becomes one row with both sources.
4. **Relaxation:** if the result is empty *and* the query had "soft" filters (startup/early-stage, industry, company size, keywords), drop those and retry on the core intent. (Fixes "startup GTM engineers" returning 0 because the funding-stage filter had no data.)
5. **AI relevance gate (`judgeRelevance`, Haiku):** feed the query + every candidate (`title — company (location)`) to Haiku, which returns `{keep:[indices]}` of genuine matches. **Prunes clear mismatches (wrong location, junk, off-field) and reranks.** Safety net: it may prune but never zero-out the page (a model hiccup falls back to the raw set). Now also returns the **dropped** rows for auditing.
6. **Response:** `{ rows, filters (honest echo of what was applied), vetted:{removed, dropped}, sources, usage, premiumLocked }`.

**Display:** `limit: 50`. The UI shows masked/unmasked rows, a filter-chip echo, an **"AI-vetted · N filtered out"** tag, and a collapsible **"🔍 Audit — N filtered out"** list (added so Ryan can inspect false negatives — currently on for everyone; consider gating to god-mode before real launch).

**Reveal:** clicking Reveal on an Apollo-sourced row spends 1 credit and calls Apollo enrichment for full name + email. **Exa rows already show full name + LinkedIn**, so they don't need a reveal for identity — but they have **no email yet** (see known problems).

### Benchmarks (all measured live this session, all AI-vetted)
| Query | Apollo-only (before) | Apollo + Exa (now) |
|---|---|---|
| investment banking analysts at RBC in Toronto | 13 | **40** |
| cancer researchers in Quebec | 9 | **20** |
| people working on payments at fintech startups | thin | **86** |
| UBC Sauder alumni working in investment banking | — | **62** |
| incoming summer analysts at Goldman Sachs | — | **107** |

---

## 4. The data-source journey & every insight it produced

This is the reasoning trail, so you don't re-derive it.

1. **Apollo is title-indexed.** It only knows a person's *primary current title @ company*. Great for "Product Manager," "Management Consultant," "GTM Engineer." Useless when the thing you want isn't in the title.
2. **Two different "not in title" failures:**
   - **Field/domain** ("cancer researcher"): the field is in the *employer/lab*, not the title ("Research Scientist @ BC Cancer"). Apollo confirms ~9.
   - **Sub-specialty** ("IB analyst" vs "analyst"): many RBC IB analysts are titled just "Analyst"; Apollo can't tell them from risk/data analysts. Confirms ~13.
3. **B2B swaps don't fix this.** PDL, Coresignal, RocketReach, ZoomInfo all share Apollo's title-index weakness. Switching changes *volume/price*, not *the ability to search by field*. **Do not** pay for another B2B DB expecting it to fix field search.
4. **Two real unlocks:**
   - **Semantic search over the whole profile** → **Exa** (1B+ profiles, ~$7/1k searches). Finds people whose specialty lives in their headline/history. **This is what we built.** Business specialties are *especially* recoverable because people brand themselves in their headline ("GTM Engineer | AI, Growth & Revenue"); academics less so.
   - **Academic data** (OpenAlex, PubMed — free, indexed by research field) for the *pure research* niche. We did **not** build this; only relevant if research search becomes core.
5. **Exa proved out:** 13→40 on RBC, plus alumni (62) and incoming-analyst (107) searches that Apollo literally cannot do. Exa is now the **primary discovery engine**; Apollo rides along for masked email-reveal rows.
6. **Freshness is a separate problem.** Exa's per-profile data can be **months stale** — we caught "Nick S." shown as *Analyst* when his live LinkedIn says *Associate* (promoted ~11 months ago; Exa never got it). **Every indexed provider has this** — "weekly refresh" = index growth, not per-profile currency. Only real-time scrapers avoid it.
7. **Fix for freshness = enrich-on-reveal, not replace the engine.** Discovery (find 40) and freshness (verify the 3–5 you contact) are different jobs. Enrich only the people a user acts on:
   - **Bright Data** LinkedIn Scraper API: ~$0.0015–0.05/profile, 5K free/mo, live public scrape, has *won* its scraping lawsuits.
   - **ScrapingDog:** ~$0.009/profile, always fresh.
   - **Crustdata:** ~$0.30–1.50/profile, real-time + structured but 30–150× the scrapers; skip unless you want turnkey.
   - Realistic total to run enrich-on-reveal for 1,000 active students (~10 reveals each): **~$15–90/mo** (Bright Data / ScrapingDog). Crustdata would be ~$3,000/mo — not worth it.
8. **The moat (Phase 3): build our own index.** Cache every touched profile into Postgres + `pgvector` with embeddings; seed target geos with Bright Data slices ($250/100K records, 722M available). Add **student-specific ranking** (same school, alumni paths, intern history, 2nd-degree overlap). This is a semantic people-search engine for student markets that no per-query API bill can undercut. **This is the real defensibility.**

---

## 5. What Exa & Apollo can each search for (feature surface)

**Exa — semantic, works TODAY (raw query passes straight through, zero new code):**
- Alma mater + role ("UBC Sauder alumni in IB") — *the alumni-referral play, core to the product*
- Career stage ("incoming summer analysts at Goldman") — *peers, huge for students*
- Career trajectory ("ex-Shopify engineers now at startups")
- Skills/expertise ("engineers who know Rust", "PMs with fintech experience")
- Affinity ("women in VC", "first-gen founders")
- Interests/writing ("people who write about AI safety")
- Any combination in one sentence.

**Apollo — structured, precise, some NOT yet wired into our parser:**
- **Seniority** (C-suite→VP→manager→entry→intern) — *lets you target recruiters/hiring managers vs peers*
- **Department/function** (engineering, finance, sales…)
- Company size / funding stage / industry (wired)
- Company HQ vs person location
- **Company technologies** (people at companies using Salesforce/Shopify/React…)
- Recent job changers (warm-outreach timing)

**Highest-value next parser addition:** teach the Sonnet parser to emit Apollo `person_seniorities` / `person_departments` so "recruiters at RBC" and "campus hiring managers at Shopify" become precise filters. That's exactly *who a student needs for a referral.*

---

## 6. Branding & design (well integrated — don't regress it)

The brand is fully applied across the app. Source of truth: `src/app/globals.css` + `NetworkBuddy Mascot (standalone).html` brand pack.

- **Fonts:** Bricolage Grotesque (display/headings, `font-display`), Hanken Grotesk (body).
- **Mascot:** rounded speech-bubble with a smiley face; orange `#c14a19` fill, linework in the theme line color (espresso on light, cream on dark). Inline SVG in `AppNav.tsx`.
- **Light palette:** bg cream `#f2ecd6`, surface white, sidebar `#efe8ce`, content/ink espresso `#2a1710`, accent burnt-orange `#c14a19`.
- **Dark palette:** one flat neutral `#212121` for bg/surface/sidebar (deliberately de-orange'd after several iterations — Ryan rejected `#2a1710`/`#232020`/`#26201a` as too orange), content cream `#f2ecd6`, accent `#e0763f`, hairline borders in cream at low opacity. Theme flips on `.dark`; toggle lives in the account menu (Light/Dark/System).
- **Tone:** confident, warm, a little playful. Section eyebrows (tiny uppercase tracked labels + pulsing dot), big Bricolage headlines, rounded-2xl cards, `bg-accent` primary buttons.
- **God mode easter egg:** the search page badge shows "**God** mode" with an animated rainbow gradient on just the word "God" (inline `<style>` in the component because Turbopack wouldn't rebuild `globals.css` reliably), and a "999999 reveals" count. Founder flex; keep it.

Design bar is high — Ryan iterates on visuals and notices detail (he caught a sideways-8 infinity glyph and an off-hue brown). Match the existing components' density and idiom.

---

## 7. What else is built (beyond search)

- **Automated outreach (Lemlist-style):** Gmail OAuth connect; AI generates personalized emails; drip **3/day**; **follow-up sequences** (initial + up to 2 follow-ups at +3/+7 days, threaded as "Re:"); **reply detection** that stops the sequence (auto-responder-safe). Cron jobs: `send-emails` (hourly), `check-replies`. **Gotcha:** `/api/cron` is in the middleware `isPublic` list (cron uses `CRON_SECRET`, not a session) — don't remove it.
- **CRM:** 6-column Kanban (dnd-kit) pipeline.
- **Freemium quota:** `usage` table, server-enforced reveal caps, UI counter + upgrade prompt. God-mode allowlist bypasses it.
- **Account page:** change display name (syncs sidebar via `router.refresh()`), email (with confirmation), password — all behind a **current-password step-up** (no email dependency). "2FA coming soon."
- **Onboarding:** 3-step (info → targets → resume); resume parsed by Claude.
- **A separate Chrome-extension effort** exists (`sonibel-extension`, `/api/extension/*`) from a different demo — largely unrelated to the core app; ignore unless asked.

---

## 8. Known problems / open risks (be honest about these)

1. **Exa data staleness** — per-profile data can be months old (the Nick S. Analyst-vs-Associate case). Titles are "as of last crawl." *Mitigation = enrich-on-reveal (§4.7), not yet built.*
2. **No emails on Exa rows** — Exa gives name + LinkedIn but no email, and Exa rows have no Apollo ID to reveal against. Need a name+company → Hunter/Apollo/Bright-Data enrichment step to get emails for Exa-sourced people. **This is arguably the most important missing piece** for the outreach flow to work on the newly-expanded results.
3. **AI gate false negatives** — the audit view revealed Haiku sometimes drops legit people (e.g., real Quebec cancer researchers at Epitopea/Glycovax, "Adjointe Recherchiste @ Société canadienne du cancer"). It's slightly too strict on location/field edges. Tunable via the judge prompt; use the audit view to measure before/after.
4. **Latency** — searches now run ~4–12s (parse + Apollo + Exa 100 + broad pass + Haiku vetting many rows). Broad queries are the slow end. Options: parallelize, cap candidates into the judge, stream results, or move parsing to Haiku.
5. **Apollo location data is sparse** — city filters often under-return; we fall back to company-only. Exa's location is also fuzzy (broad-pass backfill occasionally drifts out of region — the AI gate catches most).
6. **Audit view ships to everyone right now** — gate it behind god-mode/query-param before real launch.
7. **Cost controls** — Exa/Haiku run on *every* search. Fine now (free Exa credits, cheap Haiku), but add per-user rate limiting before scale, and consider caching identical queries.
8. **Gmail OAuth is in "Testing" mode** — refresh tokens expire every 7 days until the app is published to *production* status in Google Cloud (NOT the same as CASA; CASA is only for >100 users / removing the warning). Publish before real users rely on scheduled sending.
9. **PDL/Coresignal are scaffolded but dormant** (no keys, Coresignal needs ES-DSL query building).

---

## 9. What's next — recommended roadmap

**Immediate / highest leverage:**
1. **Email enrichment for Exa rows** (unblocks outreach on the expanded results). Start with Hunter (name+company→email) or Bright Data. *Do this first — expanded search is useless for outreach without emails.*
2. **Enrich-on-reveal for freshness** (Bright Data/ScrapingDog) — fixes the stale-title problem exactly when it matters (the moment before "send").
3. **Seniority/department parsing** → unlocks "recruiters / hiring managers at [company]" precisely (Apollo `person_seniorities`/`person_departments`).
4. **Gate the audit view** to god-mode; tune the Haiku judge prompt using it (loosen location/field strictness one notch).

**Medium:**
5. **Coresignal** (already scaffolded) for headline/history full-text + the past-interns Pro feature.
6. **Latency work** (stream results, cap judge input, parallelize).
7. **Publish the Google OAuth app** to production.

**The big bet (Phase 3 — months):**
8. **Own index + pgvector + student ranking**, seeded with Bright Data slices. The defensible moat. Add school/alumni/2nd-degree/intern-path ranking that no generic API has.

**Product/positioning worth pushing on:**
- Lean into **alumni + incoming-cohort search** — those are the searches only NetworkBuddy does well and they're *exactly* what students want (referrals from your own school; peers who just got the offer you want).
- Premium "Deep Search" tier: Exa Websets runs async and returns *verified* lists of hundreds with emails — natural paid unlock ("We found 214 matches — upgrade to see them all").

---

## 10. Operational notes / gotchas

- **Founder = Ryan** (`ryanp704@gmail.com`), in `ADMIN_USER_IDS` (god mode). Non-technical-leaning but sharp on product; iterates on UX visuals; wants *expansive, correct* results and will stress-test with hard queries (cancer researchers, IB analysts) to probe true capability. Be honest about limitations — he pushes back on hand-waving and respects measured answers.
- **Dev server:** Ryan runs his own on `localhost:3000`. Env vars load at boot — **restart after any `.env.local` change**. (This session the key was pasted via clipboard so it never hit the chat; do the same for secrets.)
- **Env vars present** (names only): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `HUNTER_API_KEY`, `APOLLO_API_KEY`, `EXA_API_KEY`, `NEXT_PUBLIC_SITE_URL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `CRON_SECRET`, `ADMIN_USER_IDS`, plus extension vars. **Vercel needs the same set** — verify the Exa key + Gmail vars are added there.
- **Branch discipline:** `main` is the source of truth; this session's work is all merged and pushed. Commit messages are descriptive — `git log` is a good narrative of the search evolution.
- **Model IDs:** parsing/outreach `claude-sonnet-4-6`; relevance gate `claude-haiku-4-5-20251001`. (When touching LLM code, prefer the latest Claude models.)
- **lucide-react:** no `Linkedin` icon in the installed version — use `src/components/ui/LinkedInIcon.tsx`.

---

## 11. Your brief (GPT-5.6) — think, don't just execute

Ryan explicitly wants you to *reason about this*, not just take orders. So, having absorbed the above:

- **Interrogate the strategy.** Is "expansive people search + AI outreach for students" the right wedge? Is the alumni/incoming-cohort angle underexploited? What would make a student pay?
- **Pressure-test the data architecture.** Is Exa-primary + enrich-on-reveal + own-index the right sequence? Where would *you* spend the next month? Is the pgvector moat real or a distraction from distribution?
- **Find the gaps I may have missed.** The email-enrichment gap on Exa rows is, in my view, the most urgent unglamorous blocker — do you agree? What breaks the outreach funnel at scale?
- **Sweat the cost/latency envelope.** Every search runs 2 LLM calls + 2 data APIs. Model the unit economics at 1k / 10k users. Where does it stop being cheap?
- **Respect the bar.** The brand is tight and Ryan notices detail. Match it. Verify changes by actually running searches and reading results (the app + the audit view are your instruments), not by assuming.

Start by reading `src/app/api/contacts/nl-search/route.ts` and `src/lib/providers/{index,apollo,exa}.ts` — that's the machine everything else feeds. Then form your own opinion on §9 and tell Ryan where you'd go.

Good luck. The search ceiling is broken; the next frontier is turning expansive discovery into *converted referrals*.
