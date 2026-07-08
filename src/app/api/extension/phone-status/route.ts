import { NextRequest, NextResponse } from 'next/server'
import { getEntry } from '@/lib/phoneStore'

// The extension polls this after an enrich that started an async phone reveal.
// Auth mirrors the rest of the extension API.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-nb-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  const key = request.headers.get('x-nb-key')
  if (!process.env.EXTENSION_API_KEY || key !== process.env.EXTENSION_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  }
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ status: 'unknown', phones: [] }, { headers: corsHeaders })
  const entry = getEntry(id)
  if (!entry) return NextResponse.json({ status: 'unknown', phones: [] }, { headers: corsHeaders })
  return NextResponse.json({ status: entry.status, phones: entry.phones }, { headers: corsHeaders })
}
