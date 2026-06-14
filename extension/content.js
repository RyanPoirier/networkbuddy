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

// Find the top-card h1 element (the person's name). Returns the element so we
// can anchor other fields to the same card.
function getNameEl() {
  const h1s = Array.from(document.querySelectorAll('main h1, h1'))
  for (const h of h1s) {
    const t = clean(h.textContent)
    if (t && t.length < 80 && !/linkedin/i.test(t)) return h
  }
  return null
}

function getName(nameEl) {
  if (nameEl) return clean(nameEl.textContent)
  const og = meta('og:title')
  if (og) return clean(og.split(/[-|]/)[0])
  const dt = clean(document.title.replace(/^\(\d+\)\s*/, '').split('|')[0])
  if (dt && !/linkedin/i.test(dt)) return dt
  return ''
}

// The top-card container that holds name + headline + location.
function getTopCard(nameEl) {
  if (!nameEl) return null
  // Walk up a few levels to the card that also contains the headline.
  let el = nameEl
  for (let i = 0; i < 5 && el.parentElement; i++) {
    el = el.parentElement
    if (el.querySelector('.text-body-medium')) return el
  }
  return nameEl.closest('section') || document
}

function getHeadline(nameEl, name) {
  // 1. Anchored: the headline lives in the same top card as the name.
  const card = getTopCard(nameEl)
  if (card) {
    const el = card.querySelector('.text-body-medium')
    const t = el && clean(el.textContent)
    if (t && t !== name && t.length > 3 && t.length < 220) return t
  }
  // 2. og:description, often "Headline · Location · 500+ connections"
  const desc = meta('og:description')
  if (desc && !/^\d/.test(desc)) {
    const first = clean(desc.split('·')[0])
    if (first.length > 3) return first
  }
  // 3. og:title "Name - Headline/Company | LinkedIn"
  const og = meta('og:title')
  if (og.includes(' - ')) {
    const mid = clean(og.split('|')[0].split(' - ').slice(1).join(' - '))
    if (mid.length > 3) return mid
  }
  return ''
}

function getCompany(headline) {
  // 1. Top-card current-company button
  const btn = document.querySelector('button[aria-label^="Current company"]')
  if (btn) return clean(btn.getAttribute('aria-label').replace(/^Current company:?\s*/i, ''))
  // 2. Parse "... at Company" out of the headline
  const atMatch = headline && headline.match(/\bat\s+([^|·]+)$/i)
  if (atMatch) return clean(atMatch[1])
  // 3. Experience section: first company name
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

// Grab the raw text of the top card as a fallback context blob, so Claude can
// read role/company even if precise field extraction misses.
function getTopCardText(nameEl) {
  const card = getTopCard(nameEl)
  if (card && card.innerText) {
    return clean(card.innerText).slice(0, 600)
  }
  return ''
}

function scrapeProfile() {
  const nameEl = getNameEl()
  const name = getName(nameEl)
  const headline = getHeadline(nameEl, name)
  return {
    name,
    headline,
    company: getCompany(headline),
    about: getAbout(),
    topCardText: getTopCardText(nameEl),
    profileUrl: location.href.split('?')[0],
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROFILE') {
    sendResponse(scrapeProfile())
  }
  return true
})
