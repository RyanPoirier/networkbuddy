// In-memory store correlating an Apollo phone-reveal request to the phone number
// Apollo later delivers via webhook. No DB / CRM — this lives entirely in the
// dev server's memory, which is all a local demo needs. globalThis keeps it
// alive across Next.js hot-reloads.

export type PhoneEntry = {
  status: 'pending' | 'done'
  phones: { number: string; type: string }[]
  createdAt: number
}

const store: Map<string, PhoneEntry> =
  (globalThis as { __sbPhoneStore?: Map<string, PhoneEntry> }).__sbPhoneStore ??
  ((globalThis as { __sbPhoneStore?: Map<string, PhoneEntry> }).__sbPhoneStore = new Map())

const TTL_MS = 10 * 60 * 1000 // forget entries after 10 min

function sweep() {
  const now = Date.now()
  for (const [k, v] of store) {
    if (now - v.createdAt > TTL_MS) store.delete(k)
  }
}

export function createPending(id: string) {
  sweep()
  store.set(id, { status: 'pending', phones: [], createdAt: Date.now() })
}

export function resolvePhones(id: string, phones: { number: string; type: string }[]) {
  const entry = store.get(id)
  if (entry) {
    entry.status = 'done'
    entry.phones = phones
  } else {
    // Webhook arrived before/without a pending record — store it anyway.
    store.set(id, { status: 'done', phones, createdAt: Date.now() })
  }
}

export function getEntry(id: string): PhoneEntry | undefined {
  return store.get(id)
}
