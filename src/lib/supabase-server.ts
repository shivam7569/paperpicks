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
