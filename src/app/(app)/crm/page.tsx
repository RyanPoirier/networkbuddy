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
        <h1 className="text-2xl font-bold text-[#0f1f3d]">My Pipeline</h1>
        <p className="text-slate-500 mt-1">Track every contact from saved to referral received.</p>
      </div>
      <KanbanBoard initialGrouped={grouped} />
    </div>
  )
}
