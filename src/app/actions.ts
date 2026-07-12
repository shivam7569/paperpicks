'use server';

/**
 * actions.ts — owner-gated Server Actions that mutate the paper feed.
 *
 * WHAT IT IS:   A 'use server' module of write actions invoked directly from
 *               client components; every exported action is owner-gated.
 * WHAT IT DOES: requireOwner() (internal) resolves and authorizes the signed-in
 *               owner. setVote(paperId, vote) writes papers.my_vote (1/-1/null)
 *               and revalidates /, /search, /for-you. setWatch(query) embeds the
 *               lens text via embedText() and upserts the user's saved_search row
 *               (query + embedding). clearWatch() deletes that row. runWatchNow()
 *               POSTs a workflow_dispatch to the watch-now.yml GitHub Actions
 *               workflow so the current lens is ingested/judged/ranked on demand.
 * WORK WITH IT: import { setVote, setWatch, clearWatch, runWatchNow } from
 *               '@/app/actions' into client components (vote buttons, watch form)
 *               and call them. Writes use the service-role client
 *               (getServiceClient); auth checks use the SSR client (createClient
 *               from supabase-server).
 * BEHAVIORS:    requireOwner throws if NEXT_PUBLIC_SUPABASE_ANON_KEY is unset or
 *               the user's email ≠ ALLOWED_EMAIL. runWatchNow fails CLOSED unless
 *               ALLOWED_EMAIL is set (so no anonymous signed-in user can trigger
 *               paid CI/Claude runs), requires GH_DISPATCH_TOKEN (a token with
 *               actions:write), and uses GH_REPO (default 'shivam7569/paperpicks')
 *               dispatching ref 'main'; it surfaces 404 (workflow not on the
 *               default branch) and other non-2xx GitHub errors.
 * CHANGE IT:    New mutation → gate it with `await requireOwner()` first. Change
 *               which pages refresh → edit the revalidatePath() calls. Retarget
 *               run-now → set GH_REPO or change the `ref` in the dispatch body
 *               (line ~114).
 */

import { getServiceClient } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import { embedText } from '@/lib/gemini';
import { revalidatePath } from 'next/cache';

/**
 * Owner gate shared by every write action. The public site is read-only for
 * everyone except the signed-in owner (email must match ALLOWED_EMAIL).
 * Returns the signed-in owner user.
 */
async function requireOwner() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Auth not configured — writes are disabled.');
  }
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const allowed = process.env.ALLOWED_EMAIL;
  if (!user || (allowed && user.email !== allowed)) {
    throw new Error('Not authorized — sign in as the owner to curate.');
  }
  return user;
}

/**
 * Record a 👍 / 👎 (or clear it) on a paper. Owner-only. Revalidates the feeds so
 * a 👎 paper vanishes and the taste vector updates immediately.
 */
export async function setVote(paperId: string, vote: number | null): Promise<void> {
  await requireOwner();

  const v = vote === 1 || vote === -1 ? vote : null;
  const supabase = getServiceClient();

  const { error } = await supabase.from('papers').update({ my_vote: v }).eq('id', paperId);
  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/search');
  revalidatePath('/for-you');
}

/**
 * Set your standing WATCH lens — a topic the weekly job keeps pulling NEW papers
 * on (until you change or reset it). Owner-only. We store the lens text + its
 * embedding so the job can semantically filter arXiv candidates.
 */
export async function setWatch(query: string): Promise<void> {
  const user = await requireOwner();
  const q = query.trim();
  if (!q) return;

  const embedding = JSON.stringify(await embedText(q, 'RETRIEVAL_QUERY'));
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('saved_search')
    .upsert(
      { user_id: user.id, query: q, embedding, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  if (error) throw new Error(error.message);

  revalidatePath('/search');
}

/** Clear your watch lens (stop pulling that topic in). Owner-only. */
export async function clearWatch(): Promise<void> {
  const user = await requireOwner();
  const supabase = getServiceClient();
  const { error } = await supabase.from('saved_search').delete().eq('user_id', user.id);
  if (error) throw new Error(error.message);

  revalidatePath('/search');
}

/**
 * Trigger the on-demand "Watch now" GitHub Actions run so the current lens is
 * ingested + judged + ranked immediately, instead of waiting for the weekly
 * cron. Owner-only. Needs GH_DISPATCH_TOKEN (a token with `actions: write` on
 * the repo); GH_REPO defaults to this project's repo.
 *
 * The heavy work (arXiv fetch, embeddings, Claude judging) runs on the Actions
 * runner — NOT here — because it far exceeds a serverless request's timeout.
 */
export async function runWatchNow(): Promise<void> {
  await requireOwner();

  // Privileged, billable action (CI minutes + Claude credits). Unlike the cheap
  // voting actions, refuse to run unless an owner identity is pinned — otherwise,
  // with ALLOWED_EMAIL unset, ANY signed-in user could trigger paid runs.
  if (!process.env.ALLOWED_EMAIL) {
    throw new Error('Run-now requires ALLOWED_EMAIL to be set (owner identity).');
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_REPO || 'shivam7569/paperpicks';
  if (!token) {
    throw new Error('Run-now isn’t configured — set GH_DISPATCH_TOKEN in the environment.');
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/watch-now.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  // 204 No Content = accepted (queued). Anything else is an error we surface.
  if (!res.ok) {
    const body = await res.text();
    // The most common failure: the workflow isn't on the default branch yet.
    if (res.status === 404) {
      throw new Error(
        'Run-now failed (404): watch-now.yml isn’t on the repo’s default branch (main) yet, ' +
          'or GH_REPO / GH_DISPATCH_TOKEN is wrong.'
      );
    }
    throw new Error(`GitHub dispatch failed (${res.status}): ${body.slice(0, 200)}`);
  }
}
