# Sonibel Enrichment — Chrome extension

Pull a prospect's **email + phone** and draft **Sonibel outreach** from any
LinkedIn profile. Built for the Sonibel Instruments GTM internship demo.

It reuses the `networkbuddy` Next.js app for its backend (Apollo + Hunter +
Claude). The two API routes live at:

- `POST /api/extension/enrich` — Apollo People Match (real email/phone) + Hunter fallback
- `POST /api/extension/outreach` — Claude (`claude-sonnet-4-6`) outreach with Sonibel's value prop

Both sit under `/api/extension/*` so the app's Supabase middleware treats them as
public (other paths 307-redirect to login).

## Run the backend

```bash
cd ~/dev/networkbuddy
npm run dev          # http://localhost:3000
```

Keys come from `.env.local`: `APOLLO_API_KEY`, `HUNTER_API_KEY`,
`ANTHROPIC_API_KEY`, `EXTENSION_API_KEY`. Nothing is hardcoded.

## Load the extension

1. Chrome → `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `~/dev/networkbuddy/sonibel-extension`.
3. Click the extension icon → **Settings**:
   - **API base URL**: `http://localhost:3000` (or your Vercel URL)
   - **Extension key**: the value of `EXTENSION_API_KEY` from `.env.local`
   - **Your name / role**: used in the outreach email signature
   - **Save**.

## Demo flow

1. Open any LinkedIn profile (`linkedin.com/in/...`).
2. Click the floating **🔊 Sonibel** button (bottom-right).
3. **Get contact info** → email + phone + source/confidence, each with Copy.
4. **Generate outreach** → cold email + short variant + LinkedIn message, each with Copy.

The popup also has a quick **Get contact info** button as a fallback.

## Notes / gotchas (learned the hard way)

- **Apollo phone reveal is webhook-only.** Passing `reveal_phone_number: true`
  *without* a `webhook_url` makes Apollo **400 the entire request** (you lose the
  email too). The route only requests phones when `APOLLO_PHONE_WEBHOOK_URL` is
  set; otherwise it shows the company HQ line Apollo returns and explains why a
  direct number is absent. To get direct/mobile numbers, stand up a public
  webhook (e.g. an `/api/extension/apollo-phone` receiver) and set that env var.
- **On the Basic plan**, Apollo People Match returns the person, org, LinkedIn
  URL, and HQ phone, but often **not a direct work email** — the **Hunter
  fallback** supplies the email (`source: apollo+hunter`).
- The content script only builds UI in the **top frame**; the manifest keeps the
  `about:blank` / `all_frames` flags so a future paste feature would still work.
- LinkedIn blocks page→localhost fetches, so all API calls go through the
  **background service worker** over a **Port** (not one-off `sendMessage`,
  which the idle MV3 worker delivers late).

## ⚠️ Rotate keys before any public/real use

The Apollo, Hunter, Anthropic keys (and the repo's GitHub token) were shared in
chat. Rotate them before deploying or sharing.
