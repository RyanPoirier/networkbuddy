// Background service worker. Content scripts on LinkedIn can't fetch our API
// directly (page CSP blocks it), so every external call is relayed here.
//
// We use a Port (chrome.runtime.connect) rather than one-off sendMessage:
// the MV3 worker goes idle and one-off responses were arriving late (only on a
// tab switch). A Port wakes the worker and delivers the response promptly.

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiBase', 'apiKey', 'senderName', 'senderTitle'], resolve)
  })
}

function apiBase(s) {
  return (s.apiBase || 'http://localhost:3000').replace(/\/$/, '')
}

async function callApi(path, payload) {
  const s = await getSettings()
  if (!s.apiKey) return { error: 'no-key' }
  try {
    const res = await fetch(apiBase(s) + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-nb-key': s.apiKey },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || `request-failed (${res.status})`, data }
    return { data }
  } catch (e) {
    return { error: e.message || 'fetch-failed' }
  }
}

async function callApiGet(path) {
  const s = await getSettings()
  if (!s.apiKey) return { error: 'no-key' }
  try {
    const res = await fetch(apiBase(s) + path, {
      method: 'GET',
      headers: { 'x-nb-key': s.apiKey },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data.error || `request-failed (${res.status})`, data }
    return { data }
  } catch (e) {
    return { error: e.message || 'fetch-failed' }
  }
}

async function enrich(payload) {
  return callApi('/api/extension/enrich', payload)
}

async function phoneStatus(payload) {
  const id = payload && payload.id
  if (!id) return { error: 'no-id' }
  return callApiGet('/api/extension/phone-status?id=' + encodeURIComponent(id))
}

async function outreach(payload) {
  const s = await getSettings()
  return callApi('/api/extension/outreach', {
    ...payload,
    senderName: payload.senderName || s.senderName || '',
    senderTitle: payload.senderTitle || s.senderTitle || 'Go-To-Market',
  })
}

// Port-based requests from the content script.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'sb-api') return
  port.onMessage.addListener(async (msg) => {
    let result
    if (msg.type === 'ENRICH') result = await enrich(msg.payload || {})
    else if (msg.type === 'OUTREACH') result = await outreach(msg.payload || {})
    else if (msg.type === 'PHONE_STATUS') result = await phoneStatus(msg.payload || {})
    else return
    try {
      port.postMessage({ type: msg.type, ...result })
    } catch {}
  })
})

// One-off fallback used by the popup (popups stay alive while open, so a plain
// sendMessage is fine there).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'ENRICH' && msg.type !== 'OUTREACH' && msg.type !== 'PHONE_STATUS') return
  ;(async () => {
    let result
    if (msg.type === 'ENRICH') result = await enrich(msg.payload || {})
    else if (msg.type === 'OUTREACH') result = await outreach(msg.payload || {})
    else result = await phoneStatus(msg.payload || {})
    sendResponse(result)
  })()
  return true // keep the channel open for the async response
})
