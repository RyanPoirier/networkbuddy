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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
