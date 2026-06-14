import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nb-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-nb-key')
  if (!process.env.EXTENSION_API_KEY || key !== process.env.EXTENSION_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const { name, title = '', company = '', linkedinUrl = '', message = '', channel = 'linkedin' } =
    await request.json()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400, headers: corsHeaders })

  const supabase = createAdminClient()

  // Resolve which account this belongs to (single-user for now, by email).
  const email = process.env.EXTENSION_USER_EMAIL
  const { data: profile } = await supabase.from('users').select('id').eq('email', email).single()
  if (!profile) {
    return NextResponse.json({ error: 'extension user not found' }, { status: 404, headers: corsHeaders })
  }
  const userId = profile.id

  // Find or create the contact (dedupe by LinkedIn URL, else name+company).
  let contactId: string | null = null
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('user_id', userId)
    .or(
      linkedinUrl
        ? `linkedin_url.eq.${linkedinUrl}`
        : `and(full_name.eq.${name},company.eq.${company})`
    )
    .limit(1)
    .maybeSingle()

  if (existing) {
    contactId = existing.id
  } else {
    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert({
        user_id: userId,
        full_name: name,
        title,
        company,
        domain: '',
        linkedin_url: linkedinUrl || null,
      })
      .select('id')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    contactId = inserted.id
  }

  // Upsert the pipeline record for this contact.
  const { data: outreach } = await supabase
    .from('outreach')
    .upsert(
      { user_id: userId, contact_id: contactId, status: 'contacted' },
      { onConflict: 'user_id,contact_id', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  // Log the interaction.
  if (outreach && message) {
    await supabase.from('interactions').insert({
      user_id: userId,
      outreach_id: outreach.id,
      type: channel === 'email' ? 'email_sent' : 'linkedin_message',
      channel,
      content: message,
    })
  }

  return NextResponse.json({ ok: true, contactId }, { headers: corsHeaders })
}
