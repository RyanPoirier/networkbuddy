// Runs on LinkedIn profile pages. Scrapes the visible profile into a clean object
// when the popup asks for it.

function clean(s) {
  return (s || '').trim().replace(/\s+/g, ' ')
}

function text(selector, root = document) {
  const el = root.querySelector(selector)
  return el ? clean(el.textContent) : ''
}

function meta(prop) {
  const el =
    document.querySelector(`meta[property="${prop}"]`) ||
    document.querySelector(`meta[name="${prop}"]`)
  return el ? clean(el.getAttribute('content')) : ''
}

function getName() {
  // Strategy 1: the main top-card h1 (most reliable, most specific first)
  const h1s = Array.from(document.querySelectorAll('main h1, h1'))
  for (const h of h1s) {
    const t = clean(h.textContent)
    if (t && t.length < 80 && !/linkedin/i.test(t)) return t
  }
  // Strategy 2: og:title meta, usually "Name - Company | LinkedIn"
  const og = meta('og:title')
  if (og) return clean(og.split(/[-|]/)[0])
  // Strategy 3: document.title, e.g. "(3) Name | LinkedIn"
  const dt = clean(document.title.replace(/^\(\d+\)\s*/, '').split('|')[0])
  if (dt && !/linkedin/i.test(dt)) return dt
  return ''
}

function getHeadline(name) {
  // The headline sits right under the name in the top card.
  const candidates = Array.from(
    document.querySelectorAll('.text-body-medium, [data-generated-suggestion-target]')
  )
  for (const el of candidates) {
    const t = clean(el.textContent)
    if (t && t !== name && t.length > 5 && t.length < 220) return t
  }
  // Fallback: og:description often holds "Headline · Location · 500+ connections"
  const desc = meta('og:description')
  if (desc) return clean(desc.split('·')[0])
  return ''
}

function getCompany() {
  // Top-card current-company button
  const btn = document.querySelector('button[aria-label^="Current company"]')
  if (btn) return clean(btn.getAttribute('aria-label').replace(/^Current company:?\s*/i, ''))
  // Experience section: first company link/name
  const exp = document.querySelector('#experience')
  if (exp) {
    const section = exp.closest('section')
    const span = section && section.querySelector('span[aria-hidden="true"]')
    if (span) return clean(span.textContent)
  }
  return ''
}

function getAbout() {
  const anchor = document.querySelector('#about')
  if (anchor) {
    const section = anchor.closest('section')
    if (section) return clean(section.innerText.replace(/^About\s*/i, ''))
  }
  return ''
}

function scrapeProfile() {
  const name = getName()
  return {
    name,
    headline: getHeadline(name),
    company: getCompany(),
    about: getAbout(),
    profileUrl: location.href.split('?')[0],
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROFILE') {
    sendResponse(scrapeProfile())
  }
  return true
})
