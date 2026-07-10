import { createAdminClient } from '@/lib/supabase/admin'

// Monthly reveal quota per plan. Tune these as your Apollo budget dictates.
export const PLAN_QUOTAS: Record<string, number> = {
  free: 25,
  pro: 500,
  unlimited: 999999,
}

// Founder / admin allowlist — user IDs in ADMIN_USER_IDS get "god mode":
// unlimited reveals + every Pro feature, bypassing the usage table entirely.
const ADMIN_IDS = new Set(
  (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
)
export function isAdmin(userId: string): boolean {
  return ADMIN_IDS.has(userId)
}
// Pro OR unlimited unlock premium features (history / internship search).
export function isPremium(plan: string): boolean {
  return plan !== 'free'
}

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface UsageState {
  plan: string
  quota: number
  used: number
  remaining: number
}

// Read the user's usage, creating the row and resetting the count when a new
// month starts.
export async function getUsage(userId: string): Promise<UsageState> {
  // God mode: admins never touch the quota table.
  if (isAdmin(userId)) {
    return { plan: 'unlimited', quota: PLAN_QUOTAS.unlimited, used: 0, remaining: PLAN_QUOTAS.unlimited }
  }

  const admin = createAdminClient()
  const period = currentPeriod()

  const { data: existing } = await admin
    .from('usage')
    .select('plan, reveals_used, period')
    .eq('user_id', userId)
    .maybeSingle()

  let plan = existing?.plan ?? 'free'
  let used = existing?.reveals_used ?? 0

  if (!existing) {
    await admin.from('usage').insert({ user_id: userId, plan: 'free', reveals_used: 0, period })
    used = 0
    plan = 'free'
  } else if (existing.period !== period) {
    await admin
      .from('usage')
      .update({ reveals_used: 0, period, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    used = 0
  }

  const quota = PLAN_QUOTAS[plan] ?? PLAN_QUOTAS.free
  return { plan, quota, used, remaining: Math.max(0, quota - used) }
}

// Record that `count` reveals were spent this period.
export async function consumeReveals(userId: string, count: number): Promise<void> {
  if (count <= 0 || isAdmin(userId)) return // admins spend nothing
  const admin = createAdminClient()
  const period = currentPeriod()
  const { data } = await admin
    .from('usage')
    .select('reveals_used, period')
    .eq('user_id', userId)
    .maybeSingle()
  const base = data && data.period === period ? data.reveals_used ?? 0 : 0
  await admin
    .from('usage')
    .update({ reveals_used: base + count, period, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
}
