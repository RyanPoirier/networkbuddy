import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PER_DAY = 3
const SLOT_HOURS_UTC = [16, 19, 22] // ~9am / 12pm / 3pm Pacific

// The next `count` send slots, 3 per day, always in the future.
function nextSlots(count: number): Date[] {
  const slots: Date[] = []
  const now = Date.now()
  for (let day = 0; slots.length < count; day++) {
    const base = new Date()
    base.setUTCHours(0, 0, 0, 0)
    base.setUTCDate(base.getUTCDate() + day)
    for (const h of SLOT_HOURS_UTC) {
      const t = new Date(base)
      t.setUTCHours(h)
      if (t.getTime() > now) slots.push(t)
      if (slots.length >= count) break
    }
  }
  return slots
}

interface DraftMsg {
  contactId?: string
  toEmail: string
  subject: string
  body: string
}

// Queue a batch of student-APPROVED messages for drip sending (3/day).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages } = (await request.json()) as { messages: DraftMsg[] }
  const valid = (messages ?? []).filter((m) => m.toEmail && m.subject && m.body)
  if (valid.length === 0) return NextResponse.json({ error: 'no messages' }, { status: 400 })

  const slots = nextSlots(valid.length)
  const rows = valid.map((m, i) => ({
    user_id: user.id,
    contact_id: m.contactId ?? null,
    to_email: m.toEmail,
    subject: m.subject,
    body: m.body,
    status: 'queued',
    scheduled_for: slots[i].toISOString(),
  }))

  // Service role: RLS on email_queue is read-only for the owner.
  const admin = createAdminClient()
  const { error } = await admin.from('email_queue').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    queued: rows.length,
    firstSend: slots[0].toISOString(),
    lastSend: slots[slots.length - 1].toISOString(),
    perDay: PER_DAY,
  })
}
