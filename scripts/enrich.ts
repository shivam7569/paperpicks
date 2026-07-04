/**
 * PaperPicks — enrich
 * ------------------------------------------------------------------
 * Backfills REAL arXiv data onto papers we already have: accurate categories,
 * a category-based field tag (replacing the keyword guess), and a code link
 * when the authors mention one (which upgrades the replicability badge to "code").
 *
 * Usage:
 *   npm run enrich            → enrich papers still missing categories
 *   npm run enrich -- --all   → re-enrich every paper
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { fetchByIds, classifyField } from '../src/lib/arxiv';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const all = process.argv.includes('--all');
  const supabase = getServiceClient();

  let query = supabase.from('papers').select('id, arxiv_id, title, abstract');
  if (!all) query = query.is('categories', null);

  const { data: papers, error } = await query;
  if (error) throw new Error(error.message);
  if (!papers || papers.length === 0) {
    console.log('✅ Nothing to enrich.');
    return;
  }

  console.log(`\n🔎 Enriching ${papers.length} papers from arXiv...\n`);
  const byArxiv = new Map(papers.map((p) => [p.arxiv_id, p]));
  const ids = papers.map((p) => p.arxiv_id);

  const BATCH = 40; // arXiv id_list size per request
  let updated = 0;
  let missing = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const results = await fetchByIds(chunk);
    const found = new Set(results.map((r) => r.arxiv_id));

    for (const r of results) {
      const row = byArxiv.get(r.arxiv_id);
      if (!row) continue;

      const field = classifyField(r.categories, r.title, r.abstract);
      const update: Record<string, unknown> = {
        categories: r.categories,
        primary_field: field,
        code_url: r.code_url,
      };
      // Hard evidence of a repo overrides the judge's badge guess.
      if (r.code_url) update.replicability_badge = 'code';

      const { error: upErr } = await supabase.from('papers').update(update).eq('id', row.id);
      if (upErr) {
        console.warn(`   ✗ ${r.arxiv_id} — ${upErr.message}`);
      } else {
        updated++;
        console.log(
          `   ✓ ${r.arxiv_id}  ${field}${r.code_url ? '  [code]' : ''}  (${r.categories.join(', ')})`
        );
      }
    }

    for (const id of chunk) if (!found.has(id)) missing++;
    if (i + BATCH < ids.length) await sleep(3000); // be polite to arXiv
  }

  console.log(`\n🔎 Done. Enriched ${updated}, not found on arXiv: ${missing}.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
