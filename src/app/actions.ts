'use server';

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
