import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, sendGmail } from '@/lib/gmail'

// Cron worker: sends due queued emails from each student's own mailbox.
// Wire it in vercel.json (runs hourly). Vercel adds `Authorization: Bearer
// $CRON_SECRET`; we reject anything else so it can't be triggered publicly.
const MAX_PER_USER_PER_RUN = 3

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  // Everything due, oldest first.
  const { data: due } = await admin
    .from('email_queue')
    .select('id, user_id, contact_id, to_email, subject, body, gmail_thread_id')
    .eq('status', 'queued')
    .lte('scheduled_for', nowIso)
    .order('scheduled_for', { ascending: true })
    .limit(200)

  if (!due || due.length === 0) return NextResponse.json({ sent: 0 })

  const perUser = new Map<string, number>()
  const tokenCache = new Map<string, { accessToken: string; email: string } | null>()
  let sent = 0
  let failed = 0
  let waiting = 0

  for (const msg of due) {
    if ((perUser.get(msg.user_id) ?? 0) >= MAX_PER_USER_PER_RUN) continue

    if (!tokenCache.has(msg.user_id)) {
      tokenCache.set(msg.user_id, await getValidAccessToken(msg.user_id))
    }
    const auth = tokenCache.get(msg.user_id)
    if (!auth) continue // Gmail not connected / token dead — leave queued.

    // Thread follow-ups onto the initial: if we've already sent a message to
    // this contact, reuse its thread so the follow-up lands as a reply-bump.
    let threadId = msg.gmail_thread_id ?? undefined
    const isFollowup = /^re:/i.test(msg.subject)
    if (msg.contact_id && !threadId) {
      const { data: prior } = await admin
        .from('email_queue')
        .select('gmail_thread_id')
        .eq('user_id', msg.user_id)
        .eq('contact_id', msg.contact_id)
        .eq('status', 'sent')
        .not('gmail_thread_id', 'is', null)
        .order('sent_at', { ascending: true })
        .limit(1)
      const priorThread = prior?.[0]?.gmail_thread_id
      if (priorThread) threadId = priorThread
      else if (isFollowup) {
        // Initial hasn't gone out yet — hold this follow-up for a later run.
        waiting++
        continue
      }
    }

    const result = await sendGmail(auth.accessToken, {
      to: msg.to_email,
      subject: msg.subject,
      body: msg.body,
      threadId,
    })

    if ('error' in result) {
      await admin.from('email_queue').update({ status: 'failed', error: result.error }).eq('id', msg.id)
      failed++
    } else {
      await admin
        .from('email_queue')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          gmail_message_id: result.id,
          gmail_thread_id: result.threadId,
        })
        .eq('id', msg.id)
      sent++
    }
    perUser.set(msg.user_id, (perUser.get(msg.user_id) ?? 0) + 1)
  }

  return NextResponse.json({ sent, failed, waiting })
}
