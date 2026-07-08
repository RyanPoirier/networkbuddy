// Sonibel Enrichment — runs on LinkedIn. On a profile it shows a floating
// launcher; clicking it opens a panel that (a) pulls the person's email + phone
// via /api/enrich and (b) drafts Sonibel outreach via /api/sonibel-outreach.
//
// Only the top frame builds UI. The manifest keeps the about:blank/all_frames
// flags so a future paste feature would work, but enrichment just displays
// data, so we never fight LinkedIn's editor here.

const SB_TOP = window.top === window
if (!SB_TOP) {
  // Iframes do nothing — bail early.
} else {
  ;(function () {
    // ---- scraping ---------------------------------------------------------
    function clean(s) {
      return (s || '').trim().replace(/\s+/g, ' ')
    }
    function meta(prop) {
      const el =
        document.querySelector(`meta[property="${prop}"]`) ||
        document.querySelector(`meta[name="${prop}"]`)
      return el ? clean(el.getAttribute('content')) : ''
    }
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
    function getTopCard(nameEl) {
      if (!nameEl) return null
      let el = nameEl
      for (let i = 0; i < 5 && el.parentElement; i++) {
        el = el.parentElement
        if (el.querySelector('.text-body-medium')) return el
      }
      return nameEl.closest('section') || document
    }
    function getHeadline(nameEl, name) {
      const card = getTopCard(nameEl)
      if (card) {
        const el = card.querySelector('.text-body-medium')
        const t = el && clean(el.textContent)
        if (t && t !== name && t.length > 3 && t.length < 220) return t
      }
      const desc = meta('og:description')
      if (desc && !/^\d/.test(desc)) {
        const first = clean(desc.split('·')[0])
        if (first.length > 3) return first
      }
      return ''
    }
    function getCompany(headline) {
      const btn = document.querySelector('button[aria-label^="Current company"]')
      if (btn) return clean(btn.getAttribute('aria-label').replace(/^Current company:?\s*/i, ''))
      const atMatch = headline && headline.match(/\bat\s+([^|·]+)$/i)
      if (atMatch) return clean(atMatch[1])
      const exp = document.querySelector('#experience')
      if (exp) {
        const section = exp.closest('section')
        const span = section && section.querySelector('span[aria-hidden="true"]')
        if (span) return clean(span.textContent)
      }
      return ''
    }
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
        profileText: getProfileText(),
        linkedinUrl: location.href.split('?')[0],
      }
    }

    // Respond to the popup's scrape request too.
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (msg.type === 'SCRAPE_PROFILE') {
        sendResponse(scrapeProfile())
        return true
      }
    })

    function onProfile() {
      return /\/in\//.test(location.pathname)
    }

    // ---- API via background port -----------------------------------------
    function apiCall(type, payload) {
      return new Promise((resolve) => {
        let settled = false
        let port
        try {
          port = chrome.runtime.connect({ name: 'sb-api' })
        } catch {
          resolve({ error: 'extension-reloaded' })
          return
        }
        port.onMessage.addListener((resp) => {
          settled = true
          resolve(resp || {})
          try { port.disconnect() } catch {}
        })
        port.onDisconnect.addListener(() => {
          if (!settled) resolve({ error: 'no-response' })
        })
        port.postMessage({ type, payload })
      })
    }

    // ---- styles -----------------------------------------------------------
    function injectStyles() {
      if (document.getElementById('sb-styles')) return
      const s = document.createElement('style')
      s.id = 'sb-styles'
      s.textContent = `
      #sb-launcher { position: fixed; z-index: 2147483646; right: 20px; bottom: 20px;
        display:flex; align-items:center; gap:8px; background:#0f172a; color:#fff;
        border:none; border-radius:999px; padding:11px 16px; font-size:13px; font-weight:700;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; cursor:pointer;
        box-shadow:0 6px 20px rgba(15,23,42,0.35); }
      #sb-launcher:hover { background:#1e293b; }
      #sb-launcher .sb-dot { width:8px; height:8px; border-radius:50%; background:#2dd4bf; }
      #sb-panel { position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; width: 360px;
        max-height: 80vh; overflow-y:auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px;
        box-shadow:0 12px 40px rgba(15,23,42,0.28);
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#0f172a; }
      #sb-panel .sb-head { display:flex; align-items:center; justify-content:space-between;
        background:#0f172a; color:#fff; padding:12px 14px; border-radius:16px 16px 0 0; position:sticky; top:0; }
      #sb-panel .sb-title { font-size:14px; font-weight:800; display:flex; align-items:center; gap:8px; }
      #sb-panel .sb-title b { color:#2dd4bf; font-weight:800; }
      #sb-panel .sb-x { cursor:pointer; border:none; background:none; color:#cbd5e1; font-size:16px; padding:2px 6px; }
      #sb-panel .sb-x:hover { color:#fff; }
      #sb-panel .sb-body { padding:14px; }
      #sb-panel .sb-who { font-size:13px; line-height:1.4; margin-bottom:12px; }
      #sb-panel .sb-who .sb-name { font-weight:800; font-size:15px; }
      #sb-panel .sb-who .sb-sub { color:#475569; }
      #sb-panel .sb-actions { display:flex; gap:8px; margin-bottom:6px; }
      #sb-panel button.sb-btn { flex:1; border:none; border-radius:10px; padding:10px; font-size:12.5px;
        font-weight:700; cursor:pointer; }
      #sb-panel button.sb-primary { background:#0d9488; color:#fff; }
      #sb-panel button.sb-primary:hover { background:#0f766e; }
      #sb-panel button.sb-secondary { background:#f1f5f9; color:#0f172a; }
      #sb-panel button.sb-secondary:hover { background:#e2e8f0; }
      #sb-panel button:disabled { opacity:.55; cursor:default; }
      #sb-panel .sb-section { margin-top:14px; }
      #sb-panel .sb-sec-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.06em;
        color:#94a3b8; font-weight:800; margin-bottom:6px; }
      #sb-panel .sb-row { display:flex; align-items:center; justify-content:space-between; gap:8px;
        background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:9px 11px; margin-bottom:7px; }
      #sb-panel .sb-row .sb-val { font-size:13px; word-break:break-all; }
      #sb-panel .sb-row .sb-k { font-size:10.5px; color:#94a3b8; font-weight:700; text-transform:uppercase; }
      #sb-panel .sb-copy { border:none; background:#0f172a; color:#fff; border-radius:7px; padding:5px 10px;
        font-size:11px; font-weight:700; cursor:pointer; white-space:nowrap; }
      #sb-panel .sb-copy.copied { background:#16a34a; }
      #sb-panel .sb-badge { display:inline-block; font-size:10px; font-weight:700; padding:2px 7px;
        border-radius:999px; background:#ccfbf1; color:#0f766e; margin-left:6px; }
      #sb-panel .sb-note { font-size:11px; color:#64748b; line-height:1.45; margin-top:6px;
        background:#fef9c3; border:1px solid #fde68a; border-radius:8px; padding:7px 9px; }
      #sb-panel .sb-draft { background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px;
        padding:10px; margin-bottom:9px; }
      #sb-panel .sb-draft .sb-subj { font-weight:700; font-size:12.5px; margin-bottom:4px; }
      #sb-panel .sb-draft .sb-text { font-size:12.5px; line-height:1.45; white-space:pre-wrap; color:#1e293b; }
      #sb-panel .sb-draft .sb-foot { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
      #sb-panel .sb-draft .sb-count { font-size:10.5px; color:#94a3b8; }
      #sb-panel .sb-status { font-size:12.5px; color:#475569; padding:6px 2px; }
      #sb-panel .sb-err { font-size:12.5px; color:#b91c1c; background:#fee2e2; border:1px solid #fecaca;
        border-radius:8px; padding:8px 10px; }
      #sb-panel .sb-wf-toggle { margin-top:12px; font-size:11px; font-weight:700; color:#0d9488;
        cursor:pointer; user-select:none; }
      #sb-panel .sb-wf-toggle:hover { text-decoration:underline; }
      #sb-panel .sb-wf { margin-top:8px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
      #sb-panel .sb-wf-row { display:flex; align-items:flex-start; gap:8px; padding:7px 10px; font-size:11.5px;
        border-bottom:1px solid #f1f5f9; }
      #sb-panel .sb-wf-row:last-child { border-bottom:none; }
      #sb-panel .sb-wf-ico { font-weight:800; width:14px; text-align:center; flex:none; }
      #sb-panel .sb-wf-ico.hit { color:#16a34a; }
      #sb-panel .sb-wf-ico.miss, #sb-panel .sb-wf-ico.skipped { color:#94a3b8; }
      #sb-panel .sb-wf-ico.error { color:#b91c1c; }
      #sb-panel .sb-wf-main { flex:1; }
      #sb-panel .sb-wf-name { font-weight:700; color:#0f172a; }
      #sb-panel .sb-wf-detail { color:#64748b; }
      #sb-panel .sb-wf-ms { color:#cbd5e1; font-size:10px; flex:none; }
      `
      document.documentElement.appendChild(s)
    }

    // ---- panel state ------------------------------------------------------
    let panel = null
    let launcher = null
    let lastEnrich = null

    function removePanel() {
      if (panel) panel.remove()
      panel = null
    }
    function showLauncher() {
      if (launcher || !onProfile() || !document.body) return
      injectStyles()
      const b = document.createElement('button')
      b.id = 'sb-launcher'
      b.innerHTML = '<span class="sb-dot"></span> Sonibel'
      b.title = 'Get contact info & draft outreach'
      b.onclick = openPanel
      document.body.appendChild(b)
      launcher = b
    }
    function removeLauncher() {
      if (launcher) launcher.remove()
      launcher = null
    }

    function el(tag, cls, txt) {
      const e = document.createElement(tag)
      if (cls) e.className = cls
      if (txt != null) e.textContent = txt
      return e
    }

    function copyBtn(text) {
      const b = el('button', 'sb-copy', 'Copy')
      b.onclick = () => {
        navigator.clipboard.writeText(text).catch(() => {})
        b.textContent = 'Copied'
        b.classList.add('copied')
        setTimeout(() => {
          b.textContent = 'Copy'
          b.classList.remove('copied')
        }, 1400)
      }
      return b
    }

    function openPanel() {
      injectStyles()
      removeLauncher()
      removePanel()
      const profile = scrapeProfile()

      const p = el('div')
      p.id = 'sb-panel'

      const head = el('div', 'sb-head')
      const title = el('div', 'sb-title')
      title.innerHTML = '🔊 Sonibel <b>Enrich</b>'
      const x = el('button', 'sb-x', '✕')
      x.onclick = () => {
        removePanel()
        showLauncher()
      }
      head.appendChild(title)
      head.appendChild(x)

      const body = el('div', 'sb-body')

      const who = el('div', 'sb-who')
      who.appendChild(el('div', 'sb-name', profile.name || 'Unknown profile'))
      if (profile.headline) who.appendChild(el('div', 'sb-sub', profile.headline))
      body.appendChild(who)

      const actions = el('div', 'sb-actions')
      const enrichBtn = el('button', 'sb-btn sb-primary', 'Get contact info')
      const outreachBtn = el('button', 'sb-btn sb-secondary', 'Generate outreach')
      actions.appendChild(enrichBtn)
      actions.appendChild(outreachBtn)
      body.appendChild(actions)

      const results = el('div')
      results.id = 'sb-results'
      body.appendChild(results)

      enrichBtn.onclick = () => runEnrich(profile, results, enrichBtn)
      outreachBtn.onclick = () => runOutreach(profile, results, outreachBtn)

      p.appendChild(head)
      p.appendChild(body)
      document.body.appendChild(p)
      void p.offsetHeight
      panel = p
    }

    function setStatus(container, msg, isErr) {
      container.innerHTML = ''
      container.appendChild(el('div', isErr ? 'sb-err' : 'sb-status', msg))
    }

    function errText(resp) {
      if (resp.error === 'no-key') return 'Open the extension popup → Settings and paste your extension key.'
      if (resp.error === 'no-response') return 'No response. Is the app running (npm run dev) and the API base correct?'
      if (resp.error === 'extension-reloaded') return 'Extension reloaded — refresh this LinkedIn tab.'
      return 'Error: ' + (resp.error || 'unknown')
    }

    // ---- enrich -----------------------------------------------------------
    async function runEnrich(profile, container, btn) {
      btn.disabled = true
      const label = btn.textContent
      btn.textContent = 'Looking up…'
      setStatus(container, 'Pulling contact details…')
      const resp = await apiCall('ENRICH', {
        name: profile.name,
        company: profile.company,
        linkedinUrl: profile.linkedinUrl,
        title: profile.headline,
        profileText: profile.profileText,
      })
      btn.disabled = false
      btn.textContent = label
      if (resp.error) return setStatus(container, errText(resp), true)
      lastEnrich = resp.data || {}
      renderEnrich(lastEnrich, container)
    }

    function renderEnrich(d, container) {
      container.innerHTML = ''
      const sec = el('div', 'sb-section')
      const lab = el('div', 'sb-sec-label')
      lab.textContent = 'Contact'
      if (d.source && d.source !== 'none') {
        const badge = el('span', 'sb-badge', d.source)
        lab.appendChild(badge)
      }
      sec.appendChild(lab)

      const addRow = (k, v, sub) => {
        const row = el('div', 'sb-row')
        const left = el('div')
        left.appendChild(el('div', 'sb-k', k))
        const val = el('div', 'sb-val', v)
        if (sub) {
          const s = el('span', 'sb-badge', sub)
          val.appendChild(s)
        }
        left.appendChild(val)
        row.appendChild(left)
        row.appendChild(copyBtn(v))
        sec.appendChild(row)
        return row
      }

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
        sec.appendChild(el('div', 'sb-status', 'No email or phone found for this person.'))
      }

      // Phone arrives asynchronously from Apollo's webhook — show a live
      // placeholder and poll until it lands (or times out).
      let noteHost = sec
      if (d.phonePending && d.phoneRequestId && !hasSyncPhone) {
        const pending = el('div', 'sb-row')
        const left = el('div')
        left.appendChild(el('div', 'sb-k', 'Phone'))
        left.appendChild(el('div', 'sb-val', 'Looking up… ⏳'))
        pending.appendChild(left)
        sec.appendChild(pending)
        pollPhone(d.phoneRequestId, sec, pending, addRow)
        noteHost = sec
      }
      ;(d.notes || []).forEach((n) => {
        // While a phone reveal is in flight, the ⏳ row + the poll's final
        // result own the phone status — don't also show the server's phone note
        // (it would contradict the poll's conclusion).
        if (d.phonePending && /phone/i.test(n)) return
        noteHost.appendChild(el('div', 'sb-note', n))
      })

      // Waterfall trace: collapsible "sources tried" list.
      if (Array.isArray(d.waterfall) && d.waterfall.length) {
        const hits = d.waterfall.filter((w) => w.status === 'hit').length
        const toggle = el('div', 'sb-wf-toggle', `▸ Sources tried (${hits}/${d.waterfall.length} hit)`)
        const list = el('div', 'sb-wf')
        list.style.display = 'none'
        const icons = { hit: '✓', miss: '·', skipped: '–', error: '⚠' }
        d.waterfall.forEach((w) => {
          const row = el('div', 'sb-wf-row')
          row.appendChild(el('div', 'sb-wf-ico ' + w.status, icons[w.status] || '·'))
          const main = el('div', 'sb-wf-main')
          main.appendChild(el('span', 'sb-wf-name', w.source + ' '))
          main.appendChild(el('span', 'sb-wf-detail', w.detail || w.status))
          row.appendChild(main)
          row.appendChild(el('div', 'sb-wf-ms', (w.ms || 0) + 'ms'))
          list.appendChild(row)
        })
        let open = false
        toggle.onclick = () => {
          open = !open
          list.style.display = open ? 'block' : 'none'
          toggle.textContent = `${open ? '▾' : '▸'} Sources tried (${hits}/${d.waterfall.length} hit)`
        }
        sec.appendChild(toggle)
        sec.appendChild(list)
      }

      container.appendChild(sec)
    }

    // Poll the phone-status endpoint until Apollo's webhook delivers the number.
    async function pollPhone(id, sec, placeholderRow, addRow) {
      const maxAttempts = 12 // ~24s at 2s intervals
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 2000))
        if (!document.body.contains(sec)) return // panel closed/navigated away
        const resp = await apiCall('PHONE_STATUS', { id })
        const data = (resp && resp.data) || {}
        if (data.status === 'done') {
          if (placeholderRow.parentNode) placeholderRow.remove()
          const phones = data.phones || []
          if (phones.length) {
            phones.forEach((ph) =>
              addRow(ph.type === 'company HQ' ? 'Phone (HQ)' : 'Phone', ph.number)
            )
          } else {
            sec.appendChild(el('div', 'sb-note', 'No phone on file for this contact.'))
          }
          return
        }
      }
      // Timed out — Apollo never called back in time.
      if (placeholderRow.parentNode) placeholderRow.remove()
      sec.appendChild(
        el('div', 'sb-note', 'No phone returned (Apollo has no number for this contact, or it timed out).')
      )
    }

    // ---- outreach ---------------------------------------------------------
    async function runOutreach(profile, container, btn) {
      btn.disabled = true
      const label = btn.textContent
      btn.textContent = 'Drafting…'
      setStatus(container, 'Drafting Sonibel outreach…')
      const resp = await apiCall('OUTREACH', {
        name: profile.name,
        title: profile.headline,
        company: profile.company,
        profileText: profile.profileText,
        email: lastEnrich && lastEnrich.email ? lastEnrich.email : '',
      })
      btn.disabled = false
      btn.textContent = label
      if (resp.error) return setStatus(container, errText(resp), true)
      renderOutreach(resp.data || {}, container)
    }

    function renderOutreach(d, container) {
      container.innerHTML = ''
      const sec = el('div', 'sb-section')
      sec.appendChild(Object.assign(el('div', 'sb-sec-label'), { textContent: 'Outreach drafts' }))

      const addDraft = (heading, subject, text, copyText) => {
        const card = el('div', 'sb-draft')
        if (heading) {
          const h = el('div', 'sb-k')
          h.textContent = heading
          card.appendChild(h)
        }
        if (subject) card.appendChild(el('div', 'sb-subj', 'Subject: ' + subject))
        card.appendChild(el('div', 'sb-text', text))
        const foot = el('div', 'sb-foot')
        foot.appendChild(el('span', 'sb-count', text.length + ' chars'))
        foot.appendChild(copyBtn(copyText))
        card.appendChild(foot)
        sec.appendChild(card)
      }

      if (d.email && (d.email.body || d.email.subject)) {
        addDraft(
          'Email',
          d.email.subject || '',
          d.email.body || '',
          (d.email.subject ? d.email.subject + '\n\n' : '') + (d.email.body || '')
        )
      }
      if (d.emailShort && (d.emailShort.body || d.emailShort.subject)) {
        addDraft(
          'Short email',
          d.emailShort.subject || '',
          d.emailShort.body || '',
          (d.emailShort.subject ? d.emailShort.subject + '\n\n' : '') + (d.emailShort.body || '')
        )
      }
      if (d.linkedin) {
        addDraft('LinkedIn message', '', d.linkedin, d.linkedin)
      }
      if (!sec.querySelector('.sb-draft')) {
        sec.appendChild(el('div', 'sb-status', 'No drafts returned.'))
      }
      container.appendChild(sec)
    }

    // ---- lifecycle: show launcher on profiles, reset on navigation --------
    function refreshForLocation() {
      if (onProfile()) {
        if (!panel && !launcher) showLauncher()
      } else {
        removePanel()
        removeLauncher()
      }
    }

    let lastPath = location.pathname
    setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname
        lastEnrich = null
        removePanel()
        removeLauncher()
        setTimeout(refreshForLocation, 600)
      }
    }, 800)

    if (document.body) {
      setTimeout(refreshForLocation, 800)
    } else {
      window.addEventListener('DOMContentLoaded', () => setTimeout(refreshForLocation, 800))
    }
  })()
}
