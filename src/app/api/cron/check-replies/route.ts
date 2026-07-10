import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getValidAccessToken, threadHasReply } from '@/lib/gmail'

// Cron: detect replies on sent messages. On a reply we (a) record replied_at so
// response rate populates, and (b) stop any still-queued sends to that contact.
// Runs hourly via vercel.json. Protected by CRON_SECRET.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Sent, not-yet-replied messages from the last 30 days that have a thread.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: sent } = await admin
    .from('email_queue')
    .select('id, user_id, contact_id, gmail_thread_id')
    .eq('status', 'sent')
    .is('replied_at', null)
    .not('gmail_thread_id', 'is', null)
    .gte('sent_at', cutoff)
    .limit(500)

  if (!sent || sent.length === 0) return NextResponse.json({ checked: 0, replies: 0 })

  const tokenCache = new Map<string, { accessToken: string; email: string } | null>()
  let replies = 0

  for (const msg of sent) {
    if (!tokenCache.has(msg.user_id)) {
      tokenCache.set(msg.user_id, await getValidAccessToken(msg.user_id))
    }
    const auth = tokenCache.get(msg.user_id)
    if (!auth) continue

    const replied = await threadHasReply(auth.accessToken, msg.gmail_thread_id!, auth.email)
    if (!replied) continue

    const now = new Date().toISOString()
    await admin.from('email_queue').update({ replied_at: now }).eq('id', msg.id)
    // Stop any pending sends to the same contact (future follow-up steps).
    if (msg.contact_id) {
      await admin
        .from('email_queue')
        .update({ status: 'stopped' })
        .eq('user_id', msg.user_id)
        .eq('contact_id', msg.contact_id)
        .eq('status', 'queued')
    }
    replies++
  }

  return NextResponse.json({ checked: sent.length, replies })
}
