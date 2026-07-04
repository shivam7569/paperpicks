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
