import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, email } = await request.json()
  if (!contactId || !email) return NextResponse.json({ error: 'contactId and email required' }, { status: 400 })

  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  const res = await fetch(
    `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${hunterKey}`
  )

  if (!res.ok) return NextResponse.json({ error: 'Verification failed' }, { status: 500 })

  const data = await res.json()
  const verified = data.data?.result === 'deliverable'

  await supabase
    .from('contacts')
    .update({ email_verified: verified, last_verified_at: new Date().toISOString() })
    .eq('id', contactId)

  return NextResponse.json({ verified, result: data.data?.result })
}
