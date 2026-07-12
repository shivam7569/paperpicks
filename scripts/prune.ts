/**
 * prune.ts — weekly step: housekeeping trim of the broad corpus.
 *
 * WHAT IT IS:   The library's garbage collector. PaperPicks is a rolling radar,
 *               not an archive; this keeps the `papers` table at a steady size,
 *               protecting the free-tier DB storage cap and stopping the weekly
 *               job from scanning an ever-growing table.
 * WHAT IT DOES: DELETEs from `papers` only rows that are ALL of: unjudged
 *               (importance_score IS NULL), unvoted (my_vote IS NULL), AND
 *               published before the cutoff (published_at < now − PRUNE_MAX_AGE_DAYS).
 *               The same three-filter `prunable` predicate is applied identically
 *               to the count and the delete so they can never diverge.
 * WORK WITH IT: `npm run prune` — 6th pipeline step (after embed, before citations).
 *               `npm run prune -- --dry-run` counts prunable rows and exits without
 *               deleting.
 * BEHAVIORS:    Reads PRUNE_MAX_AGE_DAYS (default 1095 ≈ 3yr) and Supabase service
 *               credentials (via getServiceClient). Any judged OR voted paper is
 *               ALWAYS kept regardless of age; papers with NULL published_at are
 *               kept too (the age test can't apply). Throws (exit 1) on any
 *               Supabase error; prints "Nothing to prune" when count is 0.
 * CHANGE IT:    Widen/narrow the retention window via PRUNE_MAX_AGE_DAYS (or the
 *               MAX_AGE_DAYS fallback constant). Edit the `prunable` predicate to
 *               change which rows are considered stale — but keep it one function
 *               so count and delete stay in lockstep.
 *
 * Usage:
 *   npm run prune              → delete stale corpus papers
 *   npm run prune -- --dry-run → count only, no deletes
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';

// ~3 years. Long enough that a paper which takes time to get noticed isn't
// dropped before its citation window; tune via PRUNE_MAX_AGE_DAYS.
const MAX_AGE_DAYS = Number(process.env.PRUNE_MAX_AGE_DAYS) || 1095;

/* eslint-disable @typescript-eslint/no-explicit-any */
// The prune predicate — applied IDENTICALLY to the count and the delete so they
// can never diverge. These three filters are what keep the delete safe.
const prunable = (q: any, cutoff: string) =>
  q.is('importance_score', null).is('my_vote', null).lt('published_at', cutoff);

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const supabase = getServiceClient();
  const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString();

  const { count, error: cErr } = await prunable(
    supabase.from('papers').select('id', { count: 'exact', head: true }),
    cutoff
  );
  if (cErr) throw new Error(cErr.message);

  console.log(
    `\n🧹 ${count ?? 0} prunable papers (unjudged + unvoted + published before ` +
      `${cutoff.slice(0, 10)}; window ${MAX_AGE_DAYS}d ≈ ${(MAX_AGE_DAYS / 365).toFixed(1)}y).`
  );

  if (dryRun) {
    console.log('   ✅ Dry run — no deletes.');
    return;
  }
  if (!count) {
    console.log('   Nothing to prune.');
    return;
  }

  const { data, error } = await prunable(supabase.from('papers').delete(), cutoff).select('id');
  if (error) throw new Error(error.message);
  console.log(`   🧹 Pruned ${data?.length ?? 0} stale corpus papers.`);
}

main().catch((e) => {
  console.error('prune crashed:', e);
  process.exitCode = 1;
});
