// Background service worker. Makes the API call on behalf of the content script
// so the request isn't subject to LinkedIn's page security policy (CSP).

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      ['apiBase', 'apiKey', 'studentName', 'studentSchool', 'studentProgram'],
      resolve
    )
  })
}

async function generateDrafts(payload) {
  const s = await getSettings()
  if (!s.apiKey) return { error: 'no-key' }
  const base = (s.apiBase || 'http://localhost:3000').replace(/\/$/, '')
  try {
    const res = await fetch(base + '/api/extension/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nb-key': s.apiKey },
      body: JSON.stringify({
        name: payload.name || 'there',
        topCardText: payload.profileText || '',
        studentName: s.studentName || '',
        studentSchool: s.studentSchool || '',
        studentProgram: s.studentProgram || '',
      }),
    })
    const data = await res.json()
    if (!res.ok) return { error: data.error || 'request-failed' }
    return { drafts: data.drafts || [] }
  } catch (e) {
    return { error: e.message || 'fetch-failed' }
  }
}

// Port-based GENERATE — wakes the worker and delivers promptly.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'nb-generate') return
  port.onMessage.addListener(async (msg) => {
    if (msg.type !== 'GENERATE') return
    const result = await generateDrafts(msg.payload || {})
    try {
      port.postMessage(result)
    } catch {}
  })
})

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Relay box-focus / paste between frames of the same tab.
  if (msg.type === 'NB_BOX_FOCUSED' && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'NB_SHOW_PANEL' })
    return
  }
  if (msg.type === 'NB_PASTE' && sender.tab) {
    chrome.tabs.sendMessage(sender.tab.id, { type: 'NB_DO_PASTE', text: msg.text })
    return
  }

  if (msg.type !== 'GENERATE') return

  ;(async () => {
    try {
      const s = await getSettings()
      if (!s.apiKey) return sendResponse({ error: 'no-key' })

      const base = (s.apiBase || 'http://localhost:3000').replace(/\/$/, '')
      const res = await fetch(base + '/api/extension/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-nb-key': s.apiKey },
        body: JSON.stringify({
          name: msg.payload.name || 'there',
          topCardText: msg.payload.profileText || '',
          studentName: s.studentName || '',
          studentSchool: s.studentSchool || '',
          studentProgram: s.studentProgram || '',
        }),
      })
      const data = await res.json()
      if (!res.ok) return sendResponse({ error: data.error || 'request-failed' })
      sendResponse({ drafts: data.drafts || [] })
    } catch (e) {
      sendResponse({ error: e.message || 'fetch-failed' })
    }
  })()

  return true // keep the message channel open for the async response
})
