'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Browser Supabase client (anon key) — used by the login page for magic links. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
