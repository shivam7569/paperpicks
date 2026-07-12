/**
 * auth/signout/route.ts — the "/auth/signout" route (sign out / POST).
 *
 * WHAT IT IS:   A Route Handler exporting POST — the target of the header's "Sign out"
 *               form in layout.tsx.
 * WHAT IT DOES: Builds a server Supabase client, calls auth.signOut() to clear the
 *               session cookie, then redirects to "/" (home).
 * WORK WITH IT: Route "/auth/signout" (POST only). Depends on createClient from
 *               supabase-server and NextResponse from next/server. Invoked by the
 *               <form action="/auth/signout" method="post"> that layout renders for the
 *               owner.
 * BEHAVIORS:    Uses HTTP 303 See Other so the browser follows the redirect as a GET
 *               (POST → GET). After this isOwner() returns false and the header shows
 *               "Sign in" again.
 * CHANGE IT:    Post-signout destination → the redirect URL ('/'); the 303 status is
 *               what turns the POST into a GET redirect.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
