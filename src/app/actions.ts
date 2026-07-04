'use server';

import { getServiceClient } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

/**
 * Record a 👍 / 👎 (or clear it) on a paper. Runs on the server; revalidates the
 * feeds so a 👎 paper vanishes and the taste vector updates immediately.
 */
export async function setVote(paperId: string, vote: number | null): Promise<void> {
  const v = vote === 1 || vote === -1 ? vote : null;
  const supabase = getServiceClient();

  const { error } = await supabase.from('papers').update({ my_vote: v }).eq('id', paperId);
  if (error) throw new Error(error.message);

  revalidatePath('/');
  revalidatePath('/search');
  revalidatePath('/for-you');
}
