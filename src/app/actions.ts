'use server';

import { getServiceClient } from '@/lib/supabase';
import { createClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

/**
 * Record a 👍 / 👎 (or clear it) on a paper. Runs on the server; revalidates the
 * feeds so a 👎 paper vanishes and the taste vector updates immediately.
 *
 * Owner-only: the public site is read-only for everyone except the signed-in
 * owner (email must match ALLOWED_EMAIL). This protects the taste vector.
 */
export async function setVote(paperId: string, vote: number | null): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('Auth not configured — voting is disabled.');
  }
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  const allowed = process.env.ALLOWED_EMAIL;
  if (!user || (allowed && user.email !== allowed)) {
    throw new Error('Not authorized — sign in as the owner to curate.');
  }

  const v = vote === 1 || vote === -1 ? vote : null;
  const supabase = getServiceClient();

  const { error } = await supabase.from('papers').update({ my_vote: v }).eq('id', paperId);
  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/search');
  revalidatePath('/for-you');
}
