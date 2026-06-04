import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contactId, fullName, domain } = await request.json()
  if (!fullName || !domain) return NextResponse.json({ error: 'fullName and domain required' }, { status: 400 })

  const hunterKey = process.env.HUNTER_API_KEY
  if (!hunterKey) return NextResponse.json({ error: 'no hunter key' }, { status: 500 })

  const [firstName, ...rest] = fullName.trim().split(' ')
  const lastName = rest.join(' ')

  const res = await fetch(
    `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${hunterKey}`
  )

  if (!res.ok) return NextResponse.json({ email: null })

  const data = await res.json()
  const email = data.data?.email ?? null

  // Update contact in Supabase if we found an email
  if (email && contactId) {
    await supabase
      .from('contacts')
      .update({ email, email_verified: (data.data?.score ?? 0) >= 90 })
      .eq('id', contactId)
  }

  return NextResponse.json({ email, score: data.data?.score ?? 0 })
}
