// Runs on LinkedIn profile pages. Scrapes the visible profile into a clean object
// when the popup asks for it.

function text(selector) {
  const el = document.querySelector(selector)
  return el ? el.textContent.trim().replace(/\s+/g, ' ') : ''
}

function scrapeProfile() {
  // LinkedIn's DOM changes often, so we try a few selectors per field and
  // fall back gracefully.
  const name =
    text('h1.text-heading-xlarge') ||
    text('main h1') ||
    text('h1')

  const headline =
    text('.text-body-medium.break-words') ||
    text('[data-generated-suggestion-target] .text-body-medium') ||
    text('main .text-body-medium')

  // Current company: try the experience/top-card company button
  const company =
    text('button[aria-label^="Current company"]') ||
    text('.pv-text-details__right-panel .inline-show-more-text') ||
    ''

  // About section
  let about = ''
  const aboutAnchor = document.querySelector('#about')
  if (aboutAnchor) {
    const section = aboutAnchor.closest('section')
    if (section) {
      about = section.innerText.replace(/^About\s*/i, '').trim().replace(/\s+/g, ' ')
    }
  }

  return {
    name,
    headline,
    company,
    about,
    profileUrl: location.href.split('?')[0],
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCRAPE_PROFILE') {
    sendResponse(scrapeProfile())
  }
  return true
})
