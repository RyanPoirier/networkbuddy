const els = {
  target: document.getElementById('target'),
  enrich: document.getElementById('enrich'),
  results: document.getElementById('results'),
  error: document.getElementById('error'),
  settingsToggle: document.getElementById('settingsToggle'),
  settings: document.getElementById('settings'),
  apiBase: document.getElementById('apiBase'),
  apiKey: document.getElementById('apiKey'),
  senderName: document.getElementById('senderName'),
  senderTitle: document.getElementById('senderTitle'),
  saveSettings: document.getElementById('saveSettings'),
}

const SETTINGS_KEYS = ['apiBase', 'apiKey', 'senderName', 'senderTitle']
let profile = null

// --- settings ---------------------------------------------------------------
chrome.storage.sync.get(SETTINGS_KEYS, (s) => {
  els.apiBase.value = s.apiBase || 'http://localhost:3000'
  els.apiKey.value = s.apiKey || ''
  els.senderName.value = s.senderName || ''
  els.senderTitle.value = s.senderTitle || ''
})

els.settingsToggle.onclick = () => els.settings.classList.toggle('open')

els.saveSettings.onclick = () => {
  const data = {}
  SETTINGS_KEYS.forEach((k) => (data[k] = els[k].value.trim()))
  chrome.storage.sync.set(data, () => els.settings.classList.remove('open'))
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
    els.enrich.disabled = true
    return
  }
  profile = await askProfile(tab.id)
  if (!profile) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      profile = await askProfile(tab.id)
    } catch {}
  }
  if (profile && profile.name) {
    els.target.innerHTML = `<strong>${profile.name}</strong><br>${profile.headline || ''}`
    els.enrich.disabled = false
  } else {
    els.target.textContent = 'Could not read this profile. Reload the LinkedIn tab and reopen.'
    els.enrich.disabled = true
  }
}
loadProfile()

// --- enrich -----------------------------------------------------------------
els.enrich.onclick = async () => {
  els.error.textContent = ''
  els.results.innerHTML = ''
  if (!profile) return
  const s = await chrome.storage.sync.get(SETTINGS_KEYS)
  if (!s.apiKey) {
    els.error.textContent = 'Set your extension key in Settings first.'
    els.settings.classList.add('open')
    return
  }
  els.enrich.disabled = true
  els.enrich.textContent = 'Looking up…'
  const resp = await chrome.runtime.sendMessage({
    type: 'ENRICH',
    payload: {
      name: profile.name,
      company: profile.company,
      linkedinUrl: profile.linkedinUrl,
      title: profile.headline,
      profileText: profile.profileText,
    },
  })
  els.enrich.disabled = false
  els.enrich.textContent = 'Get contact info'
  if (!resp || resp.error) {
    els.error.textContent =
      resp && resp.error === 'no-key'
        ? 'Set your extension key in Settings.'
        : 'Error: ' + ((resp && resp.error) || 'no response — is the app running?')
    return
  }
  render(resp.data || {})
}

function addRow(k, v, badge) {
  const row = document.createElement('div')
  row.className = 'row'
  const left = document.createElement('div')
  const kk = document.createElement('div')
  kk.className = 'k'
  kk.textContent = badge ? `${k} · ${badge}` : k
  const vv = document.createElement('div')
  vv.className = 'v'
  vv.textContent = v
  left.appendChild(kk)
  left.appendChild(vv)
  const copy = document.createElement('button')
  copy.className = 'copy'
  copy.textContent = 'Copy'
  copy.onclick = () => {
    navigator.clipboard.writeText(v).catch(() => {})
    copy.textContent = 'Copied'
    copy.classList.add('copied')
    setTimeout(() => {
      copy.textContent = 'Copy'
      copy.classList.remove('copied')
    }, 1400)
  }
  row.appendChild(left)
  row.appendChild(copy)
  els.results.appendChild(row)
  return row
}

function addNote(text) {
  const note = document.createElement('div')
  note.className = 'note'
  note.textContent = text
  els.results.appendChild(note)
  return note
}

function render(d) {
  let any = false
  if (d.email) {
    addRow('Email', d.email, d.emailStatus || undefined)
    any = true
  }
  ;(d.personalEmails || []).forEach((e) => {
    if (e && e !== d.email) {
      addRow('Personal', e)
      any = true
    }
  })
  ;(d.phones || []).forEach((ph) => {
    addRow(ph.type === 'company HQ' ? 'Phone (HQ)' : 'Phone', ph.number)
    any = true
  })
  const hasSyncPhone = (d.phones || []).length > 0

  if (!any && !d.phonePending) {
    addNote('No email or phone found for this person.')
  }

  // Async phone reveal — show a placeholder and poll until Apollo's webhook
  // delivers it (or times out).
  if (d.phonePending && d.phoneRequestId && !hasSyncPhone) {
    const placeholder = addRow('Phone', 'Looking up… ⏳')
    pollPhone(d.phoneRequestId, placeholder)
  }

  ;(d.notes || []).forEach((n) => {
    // The placeholder + poll own the phone status while a reveal is in flight.
    if (d.phonePending && /phone/i.test(n)) return
    addNote(n)
  })

  renderWaterfall(d.waterfall)
}

// Collapsible "sources tried" trace.
function renderWaterfall(waterfall) {
  if (!Array.isArray(waterfall) || !waterfall.length) return
  const hits = waterfall.filter((w) => w.status === 'hit').length
  const icons = { hit: '✓', miss: '·', skipped: '–', error: '⚠' }

  const toggle = document.createElement('div')
  toggle.className = 'wf-toggle'
  const label = (open) => `${open ? '▾' : '▸'} Sources tried (${hits}/${waterfall.length} hit)`
  toggle.textContent = label(false)

  const list = document.createElement('div')
  list.className = 'wf'
  list.style.display = 'none'
  waterfall.forEach((w) => {
    const row = document.createElement('div')
    row.className = 'wf-row'
    const ico = document.createElement('div')
    ico.className = 'wf-ico ' + w.status
    ico.textContent = icons[w.status] || '·'
    const main = document.createElement('div')
    main.className = 'wf-main'
    const name = document.createElement('span')
    name.className = 'wf-name'
    name.textContent = w.source + ' '
    const detail = document.createElement('span')
    detail.className = 'wf-detail'
    detail.textContent = w.detail || w.status
    main.appendChild(name)
    main.appendChild(detail)
    const ms = document.createElement('div')
    ms.className = 'wf-ms'
    ms.textContent = (w.ms || 0) + 'ms'
    row.appendChild(ico)
    row.appendChild(main)
    row.appendChild(ms)
    list.appendChild(row)
  })

  let open = false
  toggle.onclick = () => {
    open = !open
    list.style.display = open ? 'block' : 'none'
    toggle.textContent = label(open)
  }
  els.results.appendChild(toggle)
  els.results.appendChild(list)
}

async function pollPhone(id, placeholder) {
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const resp = await chrome.runtime.sendMessage({ type: 'PHONE_STATUS', payload: { id } })
    const data = (resp && resp.data) || {}
    if (data.status === 'done') {
      if (placeholder && placeholder.parentNode) placeholder.remove()
      const phones = data.phones || []
      if (phones.length) {
        phones.forEach((ph) =>
          addRow(ph.type === 'company HQ' ? 'Phone (HQ)' : 'Phone', ph.number)
        )
      } else {
        addNote('No phone on file for this contact.')
      }
      return
    }
  }
  if (placeholder && placeholder.parentNode) placeholder.remove()
  addNote('No phone returned (Apollo has no number for this contact, or it timed out).')
}
