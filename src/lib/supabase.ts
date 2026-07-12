/**
 * supabase.ts — service-role (admin) Supabase client for trusted server code.
 *
 * WHAT IT IS:   The privileged, server-only Supabase client. It uses the SECRET
 *               service_role key, which BYPASSES all Row Level Security.
 * WHAT IT DOES: getServiceClient() → SupabaseClient built from
 *               NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, with
 *               session persistence and token auto-refresh both disabled.
 * WORK WITH IT: import { getServiceClient } from '@/lib/supabase'; called by the
 *               server actions (src/app/actions.ts) and the ingest scripts to
 *               read/write the papers/saved_search tables unrestricted. NEVER
 *               import it into a client ('use client') component — that would
 *               ship the secret key to the browser.
 * BEHAVIORS:    Env vars are read lazily INSIDE the function (not at import time)
 *               so scripts can load .env.local first without import-order issues.
 *               Throws a clear Error if either env var is missing.
 * CHANGE IT:    Different auth behavior → edit the options object passed to
 *               createClient (line ~25). Target another project → change which
 *               env vars are read.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Admin / server-side Supabase client, authenticated with the SECRET
 * `service_role` key.
 *
 * ⚠️  The service_role key bypasses ALL Row Level Security. Only ever use this
 *     from trusted server-side code — scripts (like ingest) and backend route
 *     handlers. NEVER import it into a browser/client component.
 *
 * Env vars are read lazily (inside the function, not at import time) so that
 * scripts can load `.env.local` first without import-ordering headaches.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and ' +
        'SUPABASE_SERVICE_ROLE_KEY in .env.local (see .env.example).'
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
