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

// Bulletproof context: grab the whole main profile area's text. Claude reads
// it to infer role/company/school regardless of LinkedIn's exact DOM.
function getProfileText() {
  const main = document.querySelector('main')
  const raw = main ? main.innerText : document.body.innerText
  return clean(raw).slice(0, 2000)
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
    topCardText: getProfileText(),
    profileUrl: location.href.split('?')[0],
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROFILE') {
    sendResponse(scrapeProfile())
  }
  return true
})

// ===========================================================================
// In-page assistant: detect an open message / connection-note box, show a
// floating panel beside it with 3 drafts, and paste the one you click.
// ===========================================================================

const NB_TOP = window.top === window

function nbVisible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 40 && r.height > 15
}

// The top frame holds the profile. It stashes the current profile context in
// extension storage so the (iframed) composer can read it.
function nbStoreProfile() {
  if (!NB_TOP) return
  if (!/\/in\//.test(location.pathname)) return
  const name = getName(getNameEl())
  if (!name) return
  chrome.storage.local.set({ nbProfile: { name, text: getProfileText(), ts: Date.now() } })
}

// Get outreach context: live scrape in the top frame on a profile, otherwise
// read what the top frame stashed.
function nbGetContext(cb) {
  if (NB_TOP && /\/in\//.test(location.pathname)) {
    cb({ name: getName(getNameEl()) || nbRecipientName(), profileText: getProfileText() })
    return
  }
  chrome.storage.local.get(['nbProfile'], (r) => {
    const p = (r && r.nbProfile) || {}
    cb({ name: p.name || nbRecipientName(), profileText: p.text || '' })
  })
}

let nbPanel = null
let nbCurrentBox = null
let nbActiveKey = null
const nbCache = {}

function nbInjectStyles() {
  if (document.getElementById('nb-styles')) return
  const style = document.createElement('style')
  style.id = 'nb-styles'
  style.textContent = `
    #nb-panel { position: fixed; z-index: 2147483647; width: 320px; max-height: 70vh;
      overflow-y: auto; background:#f1ecd5; border:1px solid rgba(42,24,16,0.15);
      border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,0.22);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#2a1810; padding:12px; }
    #nb-panel .nb-head { display:flex; align-items:center; gap:6px; justify-content:space-between; margin-bottom:8px; }
    #nb-panel .nb-title { font-size:13px; font-weight:800; display:flex; align-items:center; gap:6px; }
    #nb-panel .nb-title b { color:#c14a1a; }
    #nb-panel .nb-title img { width:18px; height:18px; }
    #nb-panel .nb-x { cursor:pointer; border:none; background:none; font-size:13px; color:#7a4a20; padding:2px 4px; }
    #nb-panel .nb-draft { background:white; border:1px solid rgba(42,24,16,0.12); border-radius:10px;
      padding:9px; margin-bottom:8px; font-size:12.5px; line-height:1.4; cursor:pointer; transition:border-color .1s; }
    #nb-panel .nb-draft:hover { border-color:#c14a1a; }
    #nb-panel .nb-count { display:block; margin-top:6px; font-size:10px; color:#9a8e74; }
    #nb-panel .nb-status { font-size:12px; color:#7a4a20; padding:6px 2px; }
    #nb-panel .nb-refresh { width:100%; background:#2a1810; color:white; border:none; border-radius:8px;
      padding:7px; font-size:12px; cursor:pointer; }
  `
  document.documentElement.appendChild(style)
}

function nbRemovePanel() {
  if (nbPanel) nbPanel.remove()
  nbPanel = null
}

function nbBuildPanel() {
  if (!document.body) return null
  nbInjectStyles()
  nbRemovePanel()
  const p = document.createElement('div')
  p.id = 'nb-panel'
  p.innerHTML =
    '<div class="nb-head"><div class="nb-title">💼 Network <b>Buddy</b></div>' +
    '<button class="nb-x" title="Close">✕</button></div>' +
    '<div class="nb-body"><div class="nb-status">Drafting…</div></div>'
  document.body.appendChild(p)
  // Force an immediate paint — otherwise LinkedIn's page sometimes doesn't
  // composite the injected panel until the next repaint (e.g. a tab switch).
  void p.offsetHeight
  requestAnimationFrame(() => {
    p.style.transform = 'translateZ(0)'
  })
  p.querySelector('.nb-x').onclick = () => {
    nbActiveKey = null
    nbRemovePanel()
  }
  nbPanel = p
  return p
}

function nbPosition() {
  if (!nbPanel) return
  const W = 340
  // Find the message overlay / modal so we can sit just to its LEFT.
  const overlay = document.querySelector(
    '[class*="msg-overlay-conversation-bubble"], .msg-overlay-container, .artdeco-modal'
  )
  if (overlay) {
    const r = overlay.getBoundingClientRect()
    let left = r.left - W - 12
    if (left < 8) left = 8 // no room on the left: tuck against screen edge
    nbPanel.style.left = left + 'px'
    nbPanel.style.right = 'auto'
    nbPanel.style.bottom = Math.max(12, window.innerHeight - r.bottom) + 'px'
    nbPanel.style.top = 'auto'
    return
  }
  // Fallback: bottom-right corner.
  nbPanel.style.right = '16px'
  nbPanel.style.bottom = '16px'
  nbPanel.style.left = 'auto'
  nbPanel.style.top = 'auto'
}

window.addEventListener('resize', () => nbPanel && nbPosition())

function nbInsert(box, t) {
  box.focus()
  if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
    const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(box, t)
    box.dispatchEvent(new Event('input', { bubbles: true }))
  } else {
    // contenteditable (LinkedIn messaging editor)
    document.execCommand('selectAll', false, null)
    const ok = document.execCommand('insertText', false, t)
    if (!ok) {
      box.textContent = t
      box.dispatchEvent(new InputEvent('input', { bubbles: true }))
    }
  }
}

function nbRender(drafts) {
  if (!nbPanel) return
  const body = nbPanel.querySelector('.nb-body')
  body.innerHTML = ''
  drafts.forEach((d) => {
    const el = document.createElement('div')
    el.className = 'nb-draft'
    const txt = document.createElement('div')
    txt.textContent = d
    const meta = document.createElement('span')
    meta.className = 'nb-count'
    meta.textContent = d.length + ' chars · click to paste'
    el.appendChild(txt)
    el.appendChild(meta)
    el.onclick = () => {
      // Paste is relayed to whichever frame holds the focused message box.
      chrome.runtime.sendMessage({ type: 'NB_PASTE', text: d })
      el.style.borderColor = '#2e7d32'
      meta.textContent = 'Pasted ✓'
    }
    body.appendChild(el)
  })
  const refresh = document.createElement('button')
  refresh.className = 'nb-refresh'
  refresh.textContent = 'Regenerate'
  refresh.onclick = () => nbGenerate(true)
  body.appendChild(refresh)
  nbPosition()
}

function nbStatus(msg) {
  if (nbPanel) nbPanel.querySelector('.nb-body').innerHTML = '<div class="nb-status">' + msg + '</div>'
}

function nbRecipientName() {
  const sel = [
    '.msg-overlay-bubble-header__title',
    '.msg-entity-lockup__entity-title',
    'h2.msg-overlay-bubble-header__title span',
    '.artdeco-modal__header h2',
  ]
  for (const s of sel) {
    const el = document.querySelector(s)
    if (el && clean(el.textContent)) return clean(el.textContent)
  }
  return ''
}

// Only the top frame renders the panel (single panel, always visible).
function nbGenerate(force) {
  if (!NB_TOP) return
  nbBuildPanel()
  if (!nbPanel) return
  nbPosition()
  nbStatus('Drafting…')

  nbGetContext((ctx) => {
    const key = ctx.name || location.pathname
    nbActiveKey = key
    if (!force && nbCache[key]) {
      nbRender(nbCache[key])
      return
    }
    // Fetch drafts directly from the content script — no background service
    // worker, which goes idle and only delivers on tab switch.
    chrome.storage.sync.get(
      ['apiBase', 'apiKey', 'studentName', 'studentSchool', 'studentProgram'],
      (s) => {
        if (!s.apiKey) return nbStatus('Open the extension and add your key in Settings.')
        const base = (s.apiBase || 'http://localhost:3000').replace(/\/$/, '')
        fetch(base + '/api/extension/draft', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-nb-key': s.apiKey },
          body: JSON.stringify({
            name: ctx.name,
            topCardText: ctx.profileText,
            studentName: s.studentName || '',
            studentSchool: s.studentSchool || '',
            studentProgram: s.studentProgram || '',
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.error) return nbStatus('Error: ' + data.error)
            nbCache[key] = data.drafts || []
            nbRender(data.drafts || [])
          })
          .catch(() => nbStatus('No response — is the app running?'))
      }
    )
  })
}

// An element counts as a message box if it's a textarea or a contenteditable.
function nbIsEditable(el) {
  if (!el || !el.tagName) return false
  if (el.tagName === 'TEXTAREA') return true
  if (el.isContentEditable) return true
  return false
}

// Top frame keeps the stored profile fresh as the user navigates.
if (NB_TOP && document.body) {
  nbStoreProfile()
  let nbStoreTimer = null
  new MutationObserver(() => {
    clearTimeout(nbStoreTimer)
    nbStoreTimer = setTimeout(nbStoreProfile, 800)
  }).observe(document.body, { childList: true, subtree: true })
}

// Each frame watches for an editable being focused. The frame that owns the
// box remembers it (for paste) and asks the top frame to show the panel.
let nbLastNotified = null

document.addEventListener(
  'focusin',
  (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : []
    const el = path[0] || e.target
    if (el && el.closest && el.closest('#nb-panel')) return
    if (!nbIsEditable(el) || !nbVisible(el)) return
    nbCurrentBox = el
    // Only (re)trigger the panel when a *different* box gets focus, so clicking
    // within the same box doesn't thrash, but a new message box always shows it.
    if (el === nbLastNotified) return
    nbLastNotified = el
    // Top frame: show the panel directly (no background round-trip, which can be
    // delayed by an idle service worker — the cause of "only after tab switch").
    if (NB_TOP) {
      nbGenerate(false)
    } else {
      chrome.runtime.sendMessage({ type: 'NB_BOX_FOCUSED' })
    }
  },
  true
)

// If the focused box goes away, clear the dedupe so the next box re-triggers.
new MutationObserver(() => {
  if (nbLastNotified && !nbVisible(nbLastNotified)) nbLastNotified = null
}).observe(document.body || document.documentElement, { childList: true, subtree: true })

// Each frame: drop its box reference when it disappears.
new MutationObserver(() => {
  if (nbCurrentBox && !nbVisible(nbCurrentBox)) {
    nbCurrentBox = null
    if (NB_TOP) {
      nbActiveKey = null
      nbRemovePanel()
    }
  }
}).observe(document.body || document.documentElement, { childList: true, subtree: true })

// Messages relayed via the background worker.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'NB_SHOW_PANEL' && NB_TOP) {
    // A box was (re)focused — always (re)build the panel. nbCache avoids
    // re-calling the API for a recipient we've already drafted.
    nbGenerate(false)
  }
  if (msg.type === 'NB_DO_PASTE') {
    if (nbCurrentBox && nbVisible(nbCurrentBox)) nbInsert(nbCurrentBox, msg.text)
  }
})
