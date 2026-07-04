import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

/** Clears the session cookie, then returns home (303 so POST → GET). */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
