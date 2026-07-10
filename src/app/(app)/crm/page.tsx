import { createClient } from '@/lib/supabase/server'
import KanbanBoard from '@/components/crm/KanbanBoard'
import { OutreachRecord, OUTREACH_COLUMNS } from '@/types'

export default async function CRMPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: records } = await supabase
    .from('outreach')
    .select('*, contact:contacts(*)')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  const grouped = OUTREACH_COLUMNS.reduce((acc, col) => {
    acc[col.key] = (records ?? []).filter(r => r.status === col.key)
    return acc
  }, {} as Record<string, OutreachRecord[]>)

  return (
    <div>
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Pipeline</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">My Pipeline</h1>
        <p className="text-content/65 mt-2.5">Track every contact from saved to referral received.</p>
      </div>
      <KanbanBoard initialGrouped={grouped} />
    </div>
  )
}
