import { createClient } from '@/lib/supabase/server'
import { Users, MessageSquare, Coffee, Award, Clock, ArrowRight } from 'lucide-react'
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
        <div className="inline-flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.2em] text-content/50 font-semibold">Dashboard</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-[-0.03em] text-content leading-[0.98]">
          Welcome back, {profile?.name?.split(' ')[0]} <span className="align-middle">👋</span>
        </h1>
        <p className="text-content/65 mt-2.5">Here&apos;s how your networking is going.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contacts Reached', value: contacted, icon: Users },
          { label: 'Response Rate', value: `${responseRate}%`, icon: MessageSquare },
          { label: 'Coffee Chats', value: coffeeChats, icon: Coffee },
          { label: 'Referrals', value: referrals, icon: Award },
        ].map(s => (
          <div key={s.label} className="bg-surface rounded-2xl p-5 border border-line/10 shadow-sm theme-transition">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-accent/10 text-accent">
              <s.icon className="w-5 h-5" />
            </div>
            <div className="font-display text-3xl font-extrabold text-content">{s.value}</div>
            <div className="text-sm text-content/55 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Follow-ups due */}
        <div className="bg-surface rounded-2xl p-6 border border-line/10 shadow-sm theme-transition">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-accent" />
            <h2 className="font-display font-bold text-content">Follow-ups Due</h2>
            {followupsDue.length > 0 && (
              <span className="ml-auto bg-accent text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {followupsDue.length}
              </span>
            )}
          </div>
          {followupsDue.length === 0 ? (
            <p className="text-content/45 text-sm">No follow-ups due today. Keep it up!</p>
          ) : (
            <div className="space-y-1">
              {followupsDue.map(r => (
                <Link
                  key={r.id}
                  href="/crm"
                  className="flex items-center justify-between p-3 rounded-xl hover:bg-content/5 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-content">{r.contact?.full_name}</p>
                    <p className="text-xs text-content/45">{r.contact?.company} · {r.contact?.title}</p>
                  </div>
                  <span className="text-xs text-accent font-semibold">Follow up</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-surface rounded-2xl p-6 border border-line/10 shadow-sm theme-transition">
          <h2 className="font-display font-bold text-content mb-4">Recent Activity</h2>
          {recent.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-content/45 text-sm mb-3">No activity yet.</p>
              <Link href="/search" className="inline-flex items-center gap-1.5 text-accent text-sm font-semibold hover:gap-2.5 transition-all">
                Find your first contacts <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recent.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent/15 rounded-full flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                    {r.contact?.full_name?.[0] ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-content truncate">{r.contact?.full_name}</p>
                    <p className="text-xs text-content/45 truncate">{r.contact?.company}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <StatusBadge status={r.status} />
                    <p className="text-xs text-content/35 mt-0.5">
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
        <div className="mt-6 bg-accent/10 border border-accent/20 rounded-2xl p-6 theme-transition">
          <h2 className="font-display font-bold text-content mb-3">Your Target Companies</h2>
          <div className="flex flex-wrap gap-2">
            {(profile?.target_companies ?? []).map((c: string) => (
              <Link
                key={c}
                href={`/search?company=${encodeURIComponent(c)}`}
                className="bg-surface border border-line/10 text-content hover:border-accent/40 hover:text-accent px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
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
  // Tints use /15 backgrounds + 500-level text so they read on both light and
  // dark surfaces. Orange states use the brand accent.
  const styles: Record<string, string> = {
    saved: 'bg-content/10 text-content/60',
    contacted: 'bg-blue-500/15 text-blue-500',
    followed_up: 'bg-amber-500/15 text-amber-500',
    responded: 'bg-emerald-500/15 text-emerald-500',
    coffee_chat_booked: 'bg-accent/15 text-accent',
    referral_received: 'bg-violet-500/15 text-violet-500',
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
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? 'bg-content/10 text-content/60'}`}>
      {labels[status] ?? status}
    </span>
  )
}
