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
        await supabase.from('papers').update({ github_stars: stars }).eq('id', p.id);
        updated++;
        console.log(`   ✓ ${repo.owner}/${repo.repo} → ${stars}★`);
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
