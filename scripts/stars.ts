/**
 * PaperPicks — stars
 * ------------------------------------------------------------------
 * Refreshes github_stars for every paper that has a detected code link. Stars
 * are a proxy for code adoption; the weekly re-score folds them into final_score
 * so widely-used work climbs. Run weekly.
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
