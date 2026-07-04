/**
 * PaperPicks — rescore
 * ------------------------------------------------------------------
 * Re-blends final_score for every already-judged paper using the LATEST signals
 * (citations + upvotes) — WITHOUT re-calling the LLM. This is what makes scores
 * "living": run it weekly (after citations refresh) and papers that are gaining
 * citations climb, while the expensive judge score stays cached.
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
    .select('id, importance_score, replicability_score, hf_upvotes, citation_count')
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
      p.citation_count ?? 0
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
