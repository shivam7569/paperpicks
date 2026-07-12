/**
 * auth/callback/route.ts — the "/auth/callback" route (magic-link landing / GET).
 *
 * WHAT IT IS:   A Route Handler exporting GET — the endpoint Supabase redirects to
 *               after the user clicks the emailed magic link.
 * WHAT IT DOES: Parses `code` and optional `next` (default "/") from the URL. If a code
 *               is present it builds a server Supabase client and calls
 *               exchangeCodeForSession(code) to set the session cookie, then redirects
 *               to `${origin}${next}`. Missing/invalid code → redirects to
 *               "/login?error=auth".
 * WORK WITH IT: Route "/auth/callback". Depends on createClient from supabase-server and
 *               NextResponse from next/server. Reached from the login page's
 *               emailRedirectTo; it establishes the session that isOwner() later reads.
 * BEHAVIORS:    GET-only handler. On success redirects into the app; any error (no code
 *               or exchange failure) falls through to the /login error redirect.
 * CHANGE IT:    Post-login destination → the `next` fallback ('/'); failure destination
 *               → the '/login?error=auth' redirect target.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
