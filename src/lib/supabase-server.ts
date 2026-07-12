/**
 * supabase-server.ts — cookie-aware SSR Supabase client + owner auth gate.
 *
 * WHAT IT IS:   The server-side Supabase client bound to the request's auth
 *               cookies, using the public ANON key (never the service key), plus
 *               the ownership check used across the app.
 * WHAT IT DOES: createClient() → async createServerClient wired to Next's
 *               cookies() store (getAll/setAll) so server components, server
 *               actions, and route handlers can read the logged-in user.
 *               isOwner() → boolean: true only when a user is signed in AND
 *               (if ALLOWED_EMAIL is set) their email matches it.
 * WORK WITH IT: import { createClient, isOwner } from '@/lib/supabase-server';
 *               isOwner() gates the vote/curate UI; createClient() backs
 *               requireOwner() in src/app/actions.ts.
 * BEHAVIORS:    setAll() swallows errors when called from a Server Component
 *               (cookies are read-only there — the proxy refreshes them each
 *               request). isOwner() NEVER throws (it runs in the root layout):
 *               if the anon key/URL are unset it returns false → public
 *               read-only. If ALLOWED_EMAIL is unset, ANY signed-in user counts
 *               as owner.
 * CHANGE IT:    Restrict ownership → set the ALLOWED_EMAIL env var. Allow
 *               multiple owners → change the email equality check in isOwner()
 *               (line ~48).
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cookie-aware Supabase client for reading the logged-in user in server
 * components, server actions, and route handlers. Uses the ANON key + the
 * user's session cookie (NOT the service key).
 */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — the middleware refreshes cookies.
          }
        },
      },
    }
  );
}

/**
 * Is the current visitor the OWNER? True only when logged in AND (if
 * ALLOWED_EMAIL is set) their email matches it. Gates the vote UI + action.
 */
export async function isOwner(): Promise<boolean> {
  // Auth not configured (no anon key) → public read-only. Never throw here:
  // this runs in the root layout, so a throw would break every page.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return false;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed = process.env.ALLOWED_EMAIL;
  return !!user && (!allowed || user.email === allowed);
}
