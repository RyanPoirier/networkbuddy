import { createClient } from '@/lib/supabase/server'
import CampaignComposer from '@/components/outreach/CampaignComposer'

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
    supabase.from('email_queue').select('status, replied_at').eq('user_id', user!.id),
  ])

  const rows = queue ?? []
  const sent = rows.filter(r => r.status === 'sent').length
  const queued = rows.filter(r => r.status === 'queued').length
  const replied = rows.filter(r => r.replied_at).length
  const replyRate = sent > 0 ? Math.round((replied / sent) * 100) : 0
  const hasActivity = sent + queued > 0

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
          AI writes a tailored message for each person. You review once, then it sends 3/day from your Gmail.
        </p>
      </div>

      {hasActivity && (
        <div className="grid grid-cols-3 gap-3 mb-7">
          {[
            { label: 'Queued', value: queued },
            { label: 'Sent', value: sent },
            { label: 'Reply rate', value: `${replyRate}%`, sub: `${replied}/${sent}` },
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

      <CampaignComposer
        contacts={contacts ?? []}
        gmailEmail={gmail?.email ?? null}
      />
    </div>
  )
}
