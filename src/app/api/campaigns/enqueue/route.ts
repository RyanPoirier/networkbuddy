import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const SLOT_HOURS_UTC = [16, 19, 22] // ~9am / 12pm / 3pm Pacific — 3 initials/day
// Days after the initial send that each follow-up goes out.
const FOLLOWUP_OFFSET_DAYS = [3, 7]

// The next `count` send slots for INITIAL messages, 3/day, always in the future.
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

function followupBody(step: number, first: string): string {
  const name = first || 'there'
  if (step === 1) {
    return `Hi ${name}, just floating this back up in case it got buried — I'd still really value 15 minutes whenever works for you. Thanks so much!`
  }
  return `Hi ${name}, last note from me on this — I completely understand if the timing isn't right. If a quick chat ever opens up I'd be grateful, either way thanks!`
}

interface DraftMsg {
  contactId?: string
  toEmail: string
  firstName?: string
  subject: string
  body: string
}

// Queue approved messages as sequences: an initial (3/day drip) plus, when
// `followups` > 0, auto-threaded bumps a few days later. Follow-ups stop
// automatically once the contact replies (handled by the reply cron), and are
// threaded onto the initial at send time (send cron detects the prior message).
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json()) as { messages: DraftMsg[]; followups?: number }
  const valid = (body.messages ?? []).filter((m) => m.toEmail && m.subject && m.body)
  if (valid.length === 0) return NextResponse.json({ error: 'no messages' }, { status: 400 })

  // Follow-ups need a contact to thread + stop against; cap at what we template.
  const followups = Math.max(0, Math.min(body.followups ?? 0, FOLLOWUP_OFFSET_DAYS.length))

  const slots = nextSlots(valid.length)
  const rows: Record<string, unknown>[] = []

  valid.forEach((m, i) => {
    const initial = slots[i]
    rows.push({
      user_id: user.id,
      contact_id: m.contactId ?? null,
      to_email: m.toEmail,
      subject: m.subject,
      body: m.body,
      status: 'queued',
      scheduled_for: initial.toISOString(),
    })
    if (followups > 0 && m.contactId) {
      for (let k = 1; k <= followups; k++) {
        const when = new Date(initial)
        when.setUTCDate(when.getUTCDate() + FOLLOWUP_OFFSET_DAYS[k - 1])
        rows.push({
          user_id: user.id,
          contact_id: m.contactId,
          to_email: m.toEmail,
          subject: `Re: ${m.subject}`,
          body: followupBody(k, m.firstName ?? ''),
          status: 'queued',
          scheduled_for: when.toISOString(),
        })
      }
    }
  })

  // Service role: RLS on email_queue is read-only for the owner.
  const admin = createAdminClient()
  const { error } = await admin.from('email_queue').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    contacts: valid.length,
    queued: rows.length,
    followupsPerContact: followups,
    firstSend: slots[0].toISOString(),
  })
}
