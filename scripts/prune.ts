/**
 * PaperPicks — prune (housekeeping)
 * ------------------------------------------------------------------
 * PaperPicks is a rolling radar, not an archive. This trims the BROAD CORPUS so
 * the library holds at a steady size — protecting the (free-tier) DB storage cap
 * and keeping the weekly job from scanning an ever-growing table.
 *
 * DELETES only papers that are ALL of:
 *   • unjudged     (importance_score IS NULL — never scored by the LLM)
 *   • unvoted      (my_vote IS NULL — never 👍/👎'd)
 *   • past the window (published_at older than PRUNE_MAX_AGE_DAYS)
 *
 * Your curated picks (anything judged) and anything you voted on are ALWAYS kept,
 * no matter how old — so a slow-burn paper stays available for the whole window,
 * and once it's been judged or liked it's never pruned at all. Papers with no
 * published_at are also kept (the age test can't apply).
 *
 * Window defaults to ~3 years; override with PRUNE_MAX_AGE_DAYS.
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
