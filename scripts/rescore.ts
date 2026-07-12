/**
 * rescore.ts — weekly step: re-blend every judged paper's final score (no LLM).
 *
 * WHAT IT IS:   The cheap "living scores" recompute — the final pipeline step.
 *               It keeps the expensive judge scores cached and only re-mixes them
 *               with the latest live signals.
 * WHAT IT DOES: Selects every judged paper (importance_score IS NOT NULL), reloads
 *               its stored raw judge scores + live signals (hf_upvotes,
 *               citation_count, github_stars), recomputes final_score via
 *               blendFinal (src/lib/scoring), and writes final_score back per row.
 * WORK WITH IT: `npm run rescore` — 10th and LAST pipeline step (after score). Also
 *               run it on demand after editing the blend weights in scoring.ts. No
 *               flags.
 * BEHAVIORS:    No LLM calls — cheap and fast. Reads only Supabase service
 *               credentials (getServiceClient). Normalizes upvotes to this run's
 *               corpus max (upvoteMax). Per-row update errors are silently skipped
 *               (only successful writes counted); throws (exit 1) on the initial
 *               fetch error; prints "Nothing to re-score" when no judged papers exist.
 * CHANGE IT:    The blend weights live in src/lib/scoring (blendFinal); this script
 *               just applies them — edit scoring.ts, then re-run rescore.
 *
 * Usage:  npm run rescore
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { blendFinal } from '../src/lib/scoring';

async function main() {
  const supabase = getServiceClient();

  // Judged papers carry the raw judge scores we re-blend from.
  const { data: papers, error } = await supabase
    .from('papers')
    .select('id, importance_score, replicability_score, hf_upvotes, citation_count, github_stars')
    .not('importance_score', 'is', null);
  if (error) throw new Error(error.message);
  if (!papers || papers.length === 0) {
    console.log('Nothing to re-score.');
    return;
  }

  const upvoteMax = Math.max(...papers.map((p) => p.hf_upvotes ?? 0), 1);
  console.log(`\n♻️  Re-blending ${papers.length} judged papers (upvoteMax=${upvoteMax})...`);

  let ok = 0;
  for (const p of papers) {
    const final = blendFinal(
      p.importance_score ?? 0,
      p.replicability_score ?? 0,
      p.hf_upvotes ?? 0,
      upvoteMax,
      p.citation_count ?? 0,
      p.github_stars ?? 0
    );
    const { error: e } = await supabase.from('papers').update({ final_score: final }).eq('id', p.id);
    if (!e) ok++;
  }

  console.log(`♻️  Done. Re-scored ${ok} papers.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
