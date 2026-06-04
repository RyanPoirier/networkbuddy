import { createClient } from '@/lib/supabase/server'
import { Users, MessageSquare, Coffee, Award, Clock } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: outreach }] = await Promise.all([
    supabase.from('users').select('name, target_companies').eq('id', user!.id).single(),
    supabase
      .from('outreach')
      .select('*, contact:contacts(*)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const records = outreach ?? []
  const total = records.length
  const contacted = records.filter(r => r.status !== 'saved').length
  const responded = records.filter(r => ['responded', 'coffee_chat_booked', 'referral_received'].includes(r.status)).length
  const coffeeChats = records.filter(r => ['coffee_chat_booked', 'referral_received'].includes(r.status)).length
  const referrals = records.filter(r => r.status === 'referral_received').length
  const responseRate = contacted > 0 ? Math.round((responded / contacted) * 100) : 0

  const now = new Date()
  const followupsDue = records.filter(r => {
    if (!r.followup_due_at) return false
    return r.status === 'contacted' && new Date(r.followup_due_at) <= now
  })

  const recent = records.slice(0, 8)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0f1f3d]">Welcome back, {profile?.name?.split(' ')[0]} 👋</h1>
        <p className="text-slate-500 mt-1">Here&apos;s how your networking is going.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Contacts Reached', value: contacted, icon: Users, color: 'bg-blue-50 text-blue-600' },
          { label: 'Response Rate', value: `${responseRate}%`, icon: MessageSquare, color: 'bg-green-50 text-green-600' },
          { label: 'Coffee Chats', value: coffeeChats, icon: Coffee, color: 'bg-orange-50 text-[#f97316]' },
          { label: 'Referrals', value: referrals, icon: Award, color: 'bg-purple-50 text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${s.color}`}>
              <s.icon className="w-5 h-5" />
            </div>
            <div className="text-2xl font-bold text-[#0f1f3d]">{s.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Follow-ups due */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#f97316]" />
            <h2 className="font-semibold text-[#0f1f3d]">Follow-ups Due</h2>
            {followupsDue.length > 0 && (
              <span className="ml-auto bg-[#f97316] text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {followupsDue.length}
              </span>
            )}
          </div>
          {followupsDue.length === 0 ? (
            <p className="text-slate-400 text-sm">No follow-ups due today. Keep it up!</p>
          ) : (
            <div className="space-y-3">
              {followupsDue.map(r => (
                <Link
                  key={r.id}
                  href="/crm"
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[#0f1f3d]">{r.contact?.full_name}</p>
                    <p className="text-xs text-slate-400">{r.contact?.company} · {r.contact?.title}</p>
                  </div>
                  <span className="text-xs text-[#f97316] font-medium">Follow up</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="font-semibold text-[#0f1f3d] mb-4">Recent Activity</h2>
          {recent.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-slate-400 text-sm mb-3">No activity yet.</p>
              <Link href="/search" className="text-[#f97316] text-sm font-medium hover:underline">
                Find your first contacts →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-[#0f1f3d] flex-shrink-0">
                    {r.contact?.full_name?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#0f1f3d] truncate">{r.contact?.full_name}</p>
                    <p className="text-xs text-slate-400 truncate">{r.contact?.company}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <StatusBadge status={r.status} />
                    <p className="text-xs text-slate-300 mt-0.5">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Target companies shortcut */}
      {(profile?.target_companies?.length ?? 0) > 0 && (
        <div className="mt-6 bg-[#0f1f3d] rounded-2xl p-6 text-white">
          <h2 className="font-semibold mb-3">Your Target Companies</h2>
          <div className="flex flex-wrap gap-2">
            {(profile?.target_companies ?? []).map((c: string) => (
              <Link
                key={c}
                href={`/search?company=${encodeURIComponent(c)}`}
                className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm transition-colors"
              >
                {c}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    saved: 'bg-slate-100 text-slate-600',
    contacted: 'bg-blue-100 text-blue-600',
    followed_up: 'bg-yellow-100 text-yellow-700',
    responded: 'bg-green-100 text-green-600',
    coffee_chat_booked: 'bg-orange-100 text-[#f97316]',
    referral_received: 'bg-purple-100 text-purple-600',
  }
  const labels: Record<string, string> = {
    saved: 'Saved',
    contacted: 'Contacted',
    followed_up: 'Followed Up',
    responded: 'Responded',
    coffee_chat_booked: 'Coffee Chat',
    referral_received: 'Referral',
  }
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}
