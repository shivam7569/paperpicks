/**
 * enrich.ts — weekly step 4: backfill real arXiv metadata onto existing papers.
 *
 * WHAT IT IS:   The "enrich" step (runs after watch, before embed). It corrects the
 *               placeholder metadata on rows ingested from HF (and fills gaps on any
 *               row missing categories).
 * WHAT IT DOES: Selects papers, fetches their real arXiv record (fetchByIds) and
 *               updates categories, a category-based primary_field (replacing the
 *               ingest keyword guess), and code_url. When a code repo is found it
 *               also sets replicability_badge='code' (hard evidence overrides the
 *               judge's badge guess).
 * WORK WITH IT: `npm run enrich` enriches only papers where categories IS NULL;
 *               `npm run enrich -- --all` re-enriches EVERY paper.
 * BEHAVIORS:    Reads Supabase creds via getServiceClient. Processes arXiv ids in
 *               batches of BATCH=40 (arXiv id_list size), sleeping 3000ms between
 *               batches for politeness. Updates rows one at a time; a per-row failure
 *               is warned and skipped (does not abort). Counts papers not found on
 *               arXiv. code_url may be cleared to null when arXiv reports no repo.
 * CHANGE IT:    `--all` forces a full re-enrich; BATCH sets the id_list size; the
 *               3000ms sleep tunes politeness. The category→field mapping is
 *               classifyField (src/lib/arxiv.ts).
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
