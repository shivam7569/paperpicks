/**
 * PaperPicks — citations
 * ------------------------------------------------------------------
 * Refreshes citation_count / influential_citations for every paper from
 * Semantic Scholar. Run weekly: brand-new papers read 0, but as they age and
 * get cited, this pulls the growing numbers — feeding the weekly re-score so
 * papers that are *becoming* important climb the ranking.
 *
 * Usage:  npm run citations
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { fetchCitations } from '../src/lib/semanticscholar';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const supabase = getServiceClient();
  const { data: papers, error } = await supabase.from('papers').select('id, arxiv_id');
  if (error) throw new Error(error.message);
  if (!papers || papers.length === 0) {
    console.log('No papers to update.');
    return;
  }

  console.log(`\n📈 Fetching citations for ${papers.length} papers from Semantic Scholar...\n`);
  const byArxiv = new Map(papers.map((p) => [p.arxiv_id, p.id]));
  const ids = papers.map((p) => p.arxiv_id);

  const BATCH = 500; // Semantic Scholar batch max — fewer requests, far less 429 risk
  let updated = 0;
  let withCites = 0;
  let skipped = 0;

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    try {
      const cites = await fetchCitations(chunk);
      for (const [arxivId, c] of cites) {
        const rowId = byArxiv.get(arxivId);
        if (!rowId) continue;
        const { error: e } = await supabase
          .from('papers')
          .update({
            citation_count: c.citation_count,
            influential_citations: c.influential_citations,
          })
          .eq('id', rowId);
        if (!e) {
          updated++;
          if (c.citation_count > 0) withCites++;
        }
      }
    } catch (e) {
      // Citations are best-effort enrichment — a rate-limit / outage must never
      // abort the pipeline before scoring. Skip this batch and carry on.
      skipped += chunk.length;
      console.warn(`   ✗ batch skipped (${chunk.length} papers): ${(e as Error).message.slice(0, 120)}`);
    }

    console.log(`   …processed ${Math.min(i + BATCH, ids.length)}/${ids.length}`);
    if (i + BATCH < ids.length) await sleep(1000);
  }

  console.log(`\n📈 Done. Updated ${updated} · ${withCites} cited · ${skipped} skipped.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
