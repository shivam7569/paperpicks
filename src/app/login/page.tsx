'use client';

/**
 * login/page.tsx — the "/login" route (passwordless magic-link sign in).
 *
 * WHAT IT IS:   Client component ('use client') rendering the owner sign-in form.
 * WHAT IT DOES: Holds email + status state; on submit builds a browser Supabase client
 *               (createClient) and calls supabase.auth.signInWithOtp with
 *               emailRedirectTo = `${window.location.origin}/auth/callback`, emailing a
 *               magic link. Shows a "Sending…" state, a success "check your inbox"
 *               panel, or the Supabase error message on failure.
 * WORK WITH IT: Route "/login". Depends on createClient from supabase-browser and React
 *               useState. The magic link lands back on auth/callback/route.ts, which
 *               exchanges the code for a session.
 * BEHAVIORS:    Client-side only (must run in the browser for window.location + OTP).
 *               status cycles idle → sending → sent | error; the button disables while
 *               sending. Only the owner's email actually grants curation rights.
 * CHANGE IT:    Redirect target → the emailRedirectTo path ('/auth/callback'); copy and
 *               the sent/error UI live in the JSX below.
 */
import { useState } from 'react';
import { createClient } from '@/lib/supabase-browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setStatus('error');
      setMsg(error.message);
    } else {
      setStatus('sent');
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Curating (👍 / 👎) is owner-only. Enter your email and we&apos;ll send a magic link —
        no password.
      </p>

      {status === 'sent' ? (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          Check your inbox — a sign-in link is on its way to <strong>{email}</strong>.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {status === 'sending' ? 'Sending…' : 'Send magic link'}
          </button>
          {status === 'error' && <p className="text-sm text-rose-600">{msg}</p>}
        </form>
      )}
    </div>
  );
}
