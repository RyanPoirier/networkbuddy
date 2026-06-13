import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Coming-soon mode: hide everything except landing + waitlist
  if (process.env.COMING_SOON === 'true') {
    const path = request.nextUrl.pathname
    const allowed = path === '/' || path.startsWith('/api/waitlist') || path.startsWith('/api/extension') || path.startsWith('/_next') || path === '/favicon.ico' || path === '/mascot.gif' || path === '/texture.png' || path.endsWith('.png') || path.endsWith('.ico')
    if (!allowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const isAuthPage = url.pathname.startsWith('/auth')
  const isOnboarding = url.pathname.startsWith('/onboarding')
  const isPublic = url.pathname === '/' || url.pathname.startsWith('/api/waitlist') || url.pathname.startsWith('/api/extension')

  if (!user && !isAuthPage && !isPublic) {
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && isAuthPage) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()

    if (!profile?.onboarding_complete) {
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }

    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  if (user && !isOnboarding && !isPublic) {
    const { data: profile } = await supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', user.id)
      .single()

    if (!profile?.onboarding_complete) {
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
