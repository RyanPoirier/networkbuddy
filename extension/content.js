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

const NB_BOX_SELECTORS = [
  '.msg-form__contenteditable',            // messaging compose box
  'div[role="textbox"][contenteditable="true"]', // overlay / InMail compose
  '[aria-label^="Write a message"]',       // message placeholder box
  '[aria-label^="Write a reply"]',
  'textarea[name="message"]',              // connection note (current)
  '#custom-message',                       // connection note (legacy id)
  '.connect-button-send-invite__custom-message textarea',
]

function nbVisible(el) {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 40 && r.height > 15
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
  nbInjectStyles()
  nbRemovePanel()
  const p = document.createElement('div')
  p.id = 'nb-panel'
  p.innerHTML =
    '<div class="nb-head"><div class="nb-title">💼 Network <b>Buddy</b></div>' +
    '<button class="nb-x" title="Close">✕</button></div>' +
    '<div class="nb-body"><div class="nb-status">Drafting…</div></div>'
  document.body.appendChild(p)
  p.querySelector('.nb-x').onclick = () => {
    nbActiveKey = '__dismissed__'
    nbRemovePanel()
  }
  nbPanel = p
  return p
}

function nbPosition(box) {
  if (!nbPanel || !box) return
  const r = box.getBoundingClientRect()
  const w = 320
  let left = r.left
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8
  if (left < 8) left = 8
  let top = r.top - nbPanel.offsetHeight - 10
  if (top < 8) top = r.bottom + 10 // not enough room above -> place below
  nbPanel.style.left = Math.round(left) + 'px'
  nbPanel.style.top = Math.round(top) + 'px'
}

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

function nbRender(drafts, box) {
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
      nbInsert(box, d)
      el.style.borderColor = '#2e7d32'
      meta.textContent = 'Pasted ✓'
    }
    body.appendChild(el)
  })
  const refresh = document.createElement('button')
  refresh.className = 'nb-refresh'
  refresh.textContent = 'Regenerate'
  refresh.onclick = () => nbGenerate(box, true)
  body.appendChild(refresh)
  nbPosition(box)
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

function nbGenerate(box, force) {
  const name = getName(getNameEl()) || nbRecipientName()
  const profileText = getProfileText()
  const key = name || location.pathname

  nbBuildPanel()
  nbPosition(box)

  if (!force && nbCache[key]) {
    nbRender(nbCache[key], box)
    return
  }
  nbStatus('Drafting…')
  chrome.runtime.sendMessage({ type: 'GENERATE', payload: { name, profileText } }, (resp) => {
    if (chrome.runtime.lastError || !resp) return nbStatus('No response — is the app running?')
    if (resp.error === 'no-key') return nbStatus('Open the extension and add your key in Settings.')
    if (resp.error) return nbStatus('Error: ' + resp.error)
    nbCache[key] = resp.drafts
    nbRender(resp.drafts, box)
  })
}

function nbFindBox() {
  for (const s of NB_BOX_SELECTORS) {
    const els = document.querySelectorAll(s)
    for (const el of els) {
      if (nbVisible(el)) return el
    }
  }
  return null
}

let nbTimer = null
function nbWatch() {
  clearTimeout(nbTimer)
  nbTimer = setTimeout(() => {
    const box = nbFindBox()
    if (!box) {
      // Box gone: reset everything (also clears a prior dismissal).
      if (nbCurrentBox || nbActiveKey) {
        nbCurrentBox = null
        nbActiveKey = null
        nbRemovePanel()
      }
      return
    }
    const key = nbRecipientName() || getName(getNameEl()) || location.pathname
    if (nbActiveKey === '__dismissed__') return // user closed it; leave closed until box disappears
    if (key !== nbActiveKey || !nbPanel) {
      // New recipient (or panel missing): generate once.
      nbCurrentBox = box
      nbActiveKey = key
      nbGenerate(box, false)
    } else {
      // Same recipient, panel already up: just keep it positioned.
      nbCurrentBox = box
      nbPosition(box)
    }
  }, 300)
}

new MutationObserver(nbWatch).observe(document.body, { childList: true, subtree: true })
window.addEventListener('scroll', () => nbCurrentBox && nbPosition(nbCurrentBox), true)
window.addEventListener('resize', () => nbCurrentBox && nbPosition(nbCurrentBox))
nbWatch()
