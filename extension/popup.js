const els = {
  target: document.getElementById('target'),
  generate: document.getElementById('generate'),
  results: document.getElementById('results'),
  error: document.getElementById('error'),
  settingsToggle: document.getElementById('settingsToggle'),
  settings: document.getElementById('settings'),
  apiBase: document.getElementById('apiBase'),
  apiKey: document.getElementById('apiKey'),
  studentName: document.getElementById('studentName'),
  studentSchool: document.getElementById('studentSchool'),
  studentProgram: document.getElementById('studentProgram'),
  studentBackground: document.getElementById('studentBackground'),
  saveSettings: document.getElementById('saveSettings'),
}

const SETTINGS_KEYS = ['apiBase', 'apiKey', 'studentName', 'studentSchool', 'studentProgram']
let profile = null

// --- settings ---------------------------------------------------------------
chrome.storage.sync.get(SETTINGS_KEYS, (s) => {
  els.apiBase.value = s.apiBase || 'http://localhost:3000'
  els.apiKey.value = s.apiKey || ''
  els.studentName.value = s.studentName || ''
  els.studentSchool.value = s.studentSchool || ''
  els.studentProgram.value = s.studentProgram || ''
})
// Resume/background can be long, so it lives in local storage (larger quota).
chrome.storage.local.get(['studentBackground'], (s) => {
  els.studentBackground.value = s.studentBackground || ''
})

els.settingsToggle.onclick = () => els.settings.classList.toggle('open')

els.saveSettings.onclick = () => {
  const data = {}
  SETTINGS_KEYS.forEach((k) => (data[k] = els[k].value.trim()))
  chrome.storage.sync.set(data)
  chrome.storage.local.set({ studentBackground: els.studentBackground.value.trim() }, () => {
    els.settings.classList.remove('open')
  })
}

// --- scrape current profile -------------------------------------------------
async function askProfile(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'SCRAPE_PROFILE' })
  } catch {
    return null
  }
}

async function loadProfile() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab || !/linkedin\.com\/in\//.test(tab.url || '')) {
    els.target.textContent = 'Open a LinkedIn profile (linkedin.com/in/...) to get started.'
    els.generate.disabled = true
    return
  }

  // First attempt: talk to the content script.
  profile = await askProfile(tab.id)

  // If the tab was open before the extension loaded, inject the scraper now.
  if (!profile) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      profile = await askProfile(tab.id)
    } catch {
      // ignore, handled below
    }
  }

  if (profile && profile.name) {
    els.target.innerHTML = `<strong>${profile.name}</strong><br>${profile.headline || ''}`
    els.generate.disabled = false
  } else {
    els.target.textContent = 'Could not read this profile. Reload the LinkedIn tab and reopen.'
    els.generate.disabled = true
  }
}
loadProfile()

// --- generate ---------------------------------------------------------------
els.generate.onclick = async () => {
  els.error.textContent = ''
  els.results.innerHTML = ''
  if (!profile) return

  const s = await chrome.storage.sync.get(SETTINGS_KEYS)
  const local = await chrome.storage.local.get(['studentBackground'])
  if (!s.apiKey) {
    els.error.textContent = 'Set your extension key in Settings first.'
    els.settings.classList.add('open')
    return
  }

  els.generate.disabled = true
  els.generate.textContent = 'Drafting...'

  try {
    const res = await fetch(`${(s.apiBase || 'http://localhost:3000').replace(/\/$/, '')}/api/extension/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nb-key': s.apiKey },
      body: JSON.stringify({
        name: profile.name,
        headline: profile.headline,
        company: profile.company,
        about: profile.about,
        topCardText: profile.topCardText || '',
        studentName: s.studentName || '',
        studentSchool: s.studentSchool || '',
        studentProgram: s.studentProgram || '',
        studentBackground: local.studentBackground || '',
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Request failed')
    renderDrafts(data.drafts || [])
  } catch (e) {
    els.error.textContent = e.message || 'Something went wrong.'
  } finally {
    els.generate.disabled = false
    els.generate.textContent = 'Draft messages'
  }
}

function renderDrafts(drafts) {
  if (!drafts.length) {
    els.error.textContent = 'No drafts returned.'
    return
  }
  drafts.forEach((d) => {
    const card = document.createElement('div')
    card.className = 'draft'
    const body = document.createElement('div')
    body.textContent = d
    const meta = document.createElement('div')
    meta.className = 'meta'
    const count = document.createElement('span')
    count.className = 'count'
    count.textContent = `${d.length} chars`
    const copy = document.createElement('button')
    copy.className = 'copy'
    copy.textContent = 'Copy'
    copy.onclick = () => {
      navigator.clipboard.writeText(d)
      copy.textContent = 'Copied'
      copy.classList.add('copied')
      setTimeout(() => {
        copy.textContent = 'Copy'
        copy.classList.remove('copied')
      }, 1500)
    }
    meta.appendChild(count)
    meta.appendChild(copy)
    card.appendChild(body)
    card.appendChild(meta)
    els.results.appendChild(card)
  })
}
