import { createClient } from '@/lib/supabase/server'
import CampaignComposer from '@/components/outreach/CampaignComposer'

interface QRow {
  to_email: string
  contact_id: string | null
  status: string
  scheduled_for: string | null
  sent_at: string | null
  replied_at: string | null
  contact: { full_name: string } | null
}

const fmt = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default async function OutreachPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: contacts }, { data: gmail }, { data: queue }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, full_name, title, company, email')
      .eq('user_id', user!.id)
      .not('email', 'is', null)
      .order('created_at', { ascending: false }),
    supabase.from('gmail_accounts').select('email').eq('user_id', user!.id).maybeSingle(),
    supabase
      .from('email_queue')
      .select('to_email, contact_id, status, scheduled_for, sent_at, replied_at, contact:contacts(full_name)')
      .eq('user_id', user!.id),
  ])

  const rows = (queue ?? []) as unknown as QRow[]
  const key = (r: QRow) => r.contact_id ?? r.to_email

  // Contact-based stats (a sequence is several rows per person).
  const sentContacts = new Set(rows.filter(r => r.status === 'sent').map(key))
  const repliedContacts = new Set(rows.filter(r => r.replied_at).map(key))
  const queuedContacts = new Set(rows.filter(r => r.status === 'queued').map(key))
  const replyRate = sentContacts.size ? Math.round((repliedContacts.size / sentContacts.size) * 100) : 0
  const hasActivity = rows.length > 0

  // Aggregate into one row per contact for the activity list.
  const groups = new Map<string, QRow[]>()
  for (const r of rows) {
    const k = key(r)
    ;(groups.get(k) ?? groups.set(k, []).get(k)!).push(r)
  }
  const RANK: Record<string, number> = { Replied: 0, 'Following up': 1, Scheduled: 2, Sent: 3, Stopped: 4, Failed: 5 }
  const activity = [...groups.values()].map(g => {
    const name = g[0].contact?.full_name ?? g[0].to_email
    const sentSteps = g.filter(r => r.status === 'sent').length
    const queuedSteps = g.filter(r => r.status === 'queued').length
    let label = 'Scheduled'
    let tone = 'text-content/55 bg-content/8'
    if (g.some(r => r.replied_at)) { label = 'Replied'; tone = 'text-emerald-500 bg-emerald-500/12' }
    else if (sentSteps > 0 && queuedSteps > 0) { label = 'Following up'; tone = 'text-accent bg-accent/12' }
    else if (sentSteps > 0) { label = 'Sent'; tone = 'text-content/60 bg-content/8' }
    else if (queuedSteps > 0) { label = 'Scheduled'; tone = 'text-content/55 bg-content/8' }
    else if (g.some(r => r.status === 'stopped')) { label = 'Stopped'; tone = 'text-content/45 bg-content/8' }
    else if (g.some(r => r.status === 'failed')) { label = 'Failed'; tone = 'text-red-500 bg-red-500/12' }
    const nextQueued = g.filter(r => r.status === 'queued').map(r => r.scheduled_for!).sort()[0]
    const lastSent = g.filter(r => r.sent_at).map(r => r.sent_at!).sort().reverse()[0]
    const when = nextQueued ? `next ${fmt(nextQueued)}` : lastSent ? `sent ${fmt(lastSent)}` : ''
    return { name, label, tone, sentSteps, total: g.length, when }
  }).sort((a, b) => (RANK[a.label] ?? 9) - (RANK[b.label] ?? 9))

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Outreach</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">
          Personalized outreach
        </h1>
        <p className="text-content/65 mt-2.5">
          AI writes a tailored message for each person. You review once — then it sends 3/day from your Gmail, with follow-ups that stop the moment they reply.
        </p>
      </div>

      {hasActivity && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Scheduled', value: queuedContacts.size },
            { label: 'Contacted', value: sentContacts.size },
            { label: 'Reply rate', value: `${replyRate}%`, sub: `${repliedContacts.size}/${sentContacts.size}` },
          ].map(s => (
            <div key={s.label} className="bg-surface border border-line/10 rounded-2xl px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.15em] text-content/50 font-semibold">{s.label}</div>
              <div className="font-display text-2xl font-extrabold text-content mt-0.5">
                {s.value}
                {s.sub && <span className="text-xs font-medium text-content/45 ml-1.5">{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {activity.length > 0 && (
        <div className="mb-7 rounded-2xl border border-line/10 bg-surface overflow-hidden">
          <div className="px-4 py-2.5 text-[10px] uppercase tracking-[0.12em] text-content/45 font-semibold border-b border-line/10 bg-bg/50">
            Activity
          </div>
          <div className="divide-y divide-line/5 max-h-80 overflow-y-auto">
            {activity.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 text-sm font-medium text-content truncate">{a.name}</span>
                <span className="text-xs text-content/45 tabular-nums">{a.sentSteps}/{a.total} sent</span>
                <span className="text-xs text-content/45 w-24 text-right hidden sm:block">{a.when}</span>
                <span className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${a.tone}`}>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <CampaignComposer
        contacts={contacts ?? []}
        gmailEmail={gmail?.email ?? null}
      />
    </div>
  )
}
