'use client';

/**
 * supabase-browser.ts — browser Supabase client for the login page.
 *
 * WHAT IT IS:   The client-side ('use client') Supabase client, safe to run in
 *               the browser because it references only the public ANON key.
 * WHAT IT DOES: createClient() → createBrowserClient(url, anonKey) built from
 *               NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.
 * WORK WITH IT: import { createClient } from '@/lib/supabase-browser'; used by
 *               the login page to trigger magic-link / OTP sign-in from the
 *               browser (server code uses supabase-server / supabase instead).
 * BEHAVIORS:    Reads the two NEXT_PUBLIC_* env vars, which are inlined into the
 *               client bundle at build time. No service key is ever referenced.
 * CHANGE IT:    Need auth options (e.g. PKCE flow, custom storage) → pass a
 *               third options argument to createBrowserClient.
 */

import { createBrowserClient } from '@supabase/ssr';

/** Browser Supabase client (anon key) — used by the login page for magic links. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
