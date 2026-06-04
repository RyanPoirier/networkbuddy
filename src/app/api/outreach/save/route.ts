import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { OutreachStatus } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, status } = await request.json() as { contactId: string; status: OutreachStatus }

  const { data: existing } = await supabase
    .from('outreach')
    .select('id')
    .eq('user_id', user.id)
    .eq('contact_id', contactId)
    .single()

  if (existing) {
    return NextResponse.json({ id: existing.id, existing: true })
  }

  const followupDue = new Date()
  followupDue.setDate(followupDue.getDate() + 5)

  const { data, error } = await supabase
    .from('outreach')
    .insert({
      user_id: user.id,
      contact_id: contactId,
      status: status ?? 'saved',
      followup_due_at: status === 'contacted' ? followupDue.toISOString() : null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, status, notes } = await request.json()

  const updates: Record<string, unknown> = { status }
  if (notes !== undefined) updates.notes = notes

  if (status === 'contacted') {
    const followupDue = new Date()
    followupDue.setDate(followupDue.getDate() + 5)
    updates.followup_due_at = followupDue.toISOString()
    updates.email_sent_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('outreach')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
