/**
 * proxy.ts — Next.js 16 "proxy" (formerly middleware) that keeps the Supabase
 * auth session cookie fresh on every request.
 *
 * WHAT IT IS:   The app's per-request proxy. Next 16 renamed Middleware → Proxy
 *               (same mechanism); this is the standard Supabase SSR wiring.
 * WHAT IT DOES: proxy(request) builds a request-bound createServerClient and
 *               calls supabase.auth.getUser(), which refreshes the session and
 *               writes any updated auth cookies onto the NextResponse it returns
 *               — so server components always observe a current session. Also
 *               exports `config.matcher` to scope which routes it runs on.
 * WORK WITH IT: Next auto-invokes the exported proxy() for each matched request;
 *               you never call it directly. Runs on all routes except
 *               _next/static, _next/image, and favicon.ico.
 * BEHAVIORS:    Reads NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY;
 *               if either is unset it passes the request through untouched (site
 *               stays read-only). setAll rebuilds `response` so refreshed cookies
 *               survive on the outgoing response.
 * CHANGE IT:    Change which paths trigger it → edit config.matcher (line ~42).
 *               Add auth-based redirects/gating → act on the getUser() result
 *               before returning `response`.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 renamed Middleware → Proxy (same mechanism). This refreshes the
 * Supabase auth session cookie on every request so server components always
 * see a current session. Standard Supabase SSR setup.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Auth not configured → pass through untouched (site stays read-only).
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Run on all routes except static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
