/**
 * PaperPicks — ingest:arxiv
 * ------------------------------------------------------------------
 * Broadens the SEARCH CORPUS with recent arXiv papers (cs.CL/cs.CV/cs.LG/cs.AI),
 * each with real categories, a field tag, and any code link.
 *
 * These are corpus papers (source='arxiv', no community upvotes). They are NOT
 * judged by Claude — only high-signal HF candidates are (see scripts/score.ts).
 * Existing papers are left untouched (insert-only) — enrichment handles overlaps.
 *
 * Usage:
 *   npm run ingest:arxiv                  → ~200 most recent
 *   npm run ingest:arxiv -- --max 400     → pull more
 *   npm run ingest:arxiv -- --dry-run     → fetch + parse only, no DB writes
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { fetchRecent, classifyField } from '../src/lib/arxiv';
import type { PaperInsert } from '../src/lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const max = parseInt(argValue('--max') ?? '200', 10);
  const PAGE = 100; // arXiv max_results per request

  console.log(`\n📚 Ingesting up to ${max} recent arXiv papers${dryRun ? ' (dry run)' : ''}...`);

  const rows: PaperInsert[] = [];
  for (let start = 0; start < max; start += PAGE) {
    const batch = await fetchRecent({ maxResults: Math.min(PAGE, max - start), start });
    if (batch.length === 0) break;
    for (const p of batch) {
      rows.push({
        arxiv_id: p.arxiv_id,
        title: p.title,
        abstract: p.abstract || null,
        authors: p.authors,
        url: p.url,
        pdf_url: p.pdf_url,
        code_url: p.code_url,
        categories: p.categories,
        primary_field: classifyField(p.categories, p.title, p.abstract),
        published_at: p.published_at,
        hf_upvotes: 0,
        source: 'arxiv',
        raw: p,
      });
    }
    if (start + PAGE < max) await sleep(3000); // arXiv politeness
  }

  const vision = rows.filter((r) => r.primary_field === 'vision').length;
  console.log(
    `   Fetched ${rows.length} papers · ${rows.length - vision} llm/language · ${vision} vision.`
  );

  if (dryRun) {
    console.log('   ✅ Dry run — no DB writes.');
    return;
  }
  if (rows.length === 0) {
    console.log('   Nothing to ingest.');
    return;
  }

  const supabase = getServiceClient();
  // ignoreDuplicates: insert only NEW papers; never overwrite existing HF papers
  // (which carry upvotes/source we must preserve). Overlaps are handled by enrich.
  const { data, error } = await supabase
    .from('papers')
    .upsert(rows, { onConflict: 'arxiv_id', ignoreDuplicates: true })
    .select('arxiv_id');

  if (error) {
    console.error('   ❌ Upsert failed:', error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`   ✅ Inserted ${data?.length ?? 0} new papers into the corpus.`);
}

main().catch((e) => {
  console.error('ingest:arxiv crashed:', e);
  process.exitCode = 1;
});
