/**
 * stars.ts — weekly step: refresh GitHub star counts for papers with code.
 *
 * WHAT IT IS:   The code-adoption-signal refresher. Stars proxy for how widely a
 *               paper's code is used; the weekly re-score folds github_stars into
 *               final_score so widely-adopted work climbs.
 * WHAT IT DOES: Selects papers where code_url IS NOT NULL, parses each repo
 *               (parseRepo), fetches its star count (fetchStars, via src/lib/github),
 *               and writes github_stars back per row.
 * WORK WITH IT: `npm run stars` — 8th pipeline step (after citations, before score).
 *               No flags.
 * BEHAVIORS:    Reads STARS_MAX_TRUSTED (default 20000) and Supabase service
 *               credentials (getServiceClient); GitHub auth (if any) lives in
 *               src/lib/github. Sleeps 800ms between repos (gentle even
 *               unauthenticated). A star count above the cap is treated as a
 *               mis-linked framework/library repo (e.g. transformers, langchain)
 *               and recorded as 0 so it can't inflate the score; a warning is
 *               logged. Per-repo fetch errors are caught and skipped (loop
 *               continues); unparseable code_urls are silently skipped.
 * CHANGE IT:    Raise/lower the mis-link cutoff via STARS_MAX_TRUSTED (or the
 *               MAX_TRUSTED fallback constant). Adjust the pacing via the
 *               sleep(800) call. Repo parsing / star fetching live in src/lib/github.
 *
 * Usage:  npm run stars
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { parseRepo, fetchStars } from '../src/lib/github';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A paper's OWN repo essentially never exceeds this. A higher count means code_url
// points at a framework/library the paper merely references (e.g. transformers,
// langchain) — treat it as untrusted so it can't inflate the score or the rationale.
const MAX_TRUSTED = Number(process.env.STARS_MAX_TRUSTED) || 20000;

async function main() {
  const supabase = getServiceClient();
  const { data: papers, error } = await supabase
    .from('papers')
    .select('id, code_url')
    .not('code_url', 'is', null);
  if (error) throw new Error(error.message);
  if (!papers || papers.length === 0) {
    console.log('No papers with code links.');
    return;
  }

  console.log(`\n⭐ Fetching GitHub stars for ${papers.length} papers with code...\n`);
  let updated = 0;

  for (const p of papers) {
    const repo = parseRepo(p.code_url);
    if (!repo) continue;
    try {
      const stars = await fetchStars(repo.owner, repo.repo);
      if (stars != null) {
        const trusted = stars > MAX_TRUSTED ? 0 : stars;
        await supabase.from('papers').update({ github_stars: trusted }).eq('id', p.id);
        updated++;
        if (trusted !== stars) {
          console.log(`   ⚠ ${repo.owner}/${repo.repo} → ${stars}★ looks mis-linked (>${MAX_TRUSTED}); recorded 0`);
        } else {
          console.log(`   ✓ ${repo.owner}/${repo.repo} → ${stars}★`);
        }
      }
    } catch (e) {
      console.warn(`   ✗ ${repo.owner}/${repo.repo} — ${(e as Error).message}`);
    }
    await sleep(800); // gentle even unauthenticated (small corpus)
  }

  console.log(`\n⭐ Done. Updated ${updated} papers.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
