/**
 * PaperPicks — watch (ingestion lens)
 * ------------------------------------------------------------------
 * Your search bar is a lookup over what you HAVE. Your watch lens is a standing
 * order to keep pulling in NEW papers on a topic from the outside world.
 *
 * For each saved lens (saved_search):
 *   1. Turn the lens text into an arXiv keyword query (wide reach, any category).
 *   2. Fetch recent candidates, embed each, keep those semantically closest to
 *      the lens (precision) — up to WATCH_MAX, above a WATCH_MIN_SIM floor.
 *   3. Insert survivors as source='watch'. They're later embedded (embed.ts) and
 *      JUDGED + ranked (score.ts) like HF candidates.
 *
 * Usage:
 *   npm run watch              → fetch + filter + insert
 *   npm run watch -- --dry-run → fetch + filter only; print matches, no DB writes
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { fetchByQuery, lensToArxivQuery, classifyField } from '../src/lib/arxiv';
import { embedText } from '../src/lib/gemini';
import type { PaperInsert } from '../src/lib/types';

const CAP = Number(process.env.WATCH_MAX) || 15; // most papers to keep per lens/run
const FLOOR = Number(process.env.WATCH_MIN_SIM) || 0.5; // min cosine to the lens
const POOL = Number(process.env.WATCH_POOL) || 80; // arXiv candidates to consider

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function parseEmbedding(e: unknown): number[] | null {
  if (Array.isArray(e)) return e as number[];
  if (typeof e === 'string') {
    try {
      return JSON.parse(e) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const override = argValue('--query'); // ad-hoc lens for testing (skips saved_search)
  const supabase = getServiceClient();

  let lenses: { query: string | null; embedding?: unknown }[];
  if (override) {
    lenses = [{ query: override, embedding: null }];
  } else {
    const { data, error } = await supabase
      .from('saved_search')
      .select('query, embedding')
      .not('query', 'is', null);
    if (error) throw new Error(`Read lens failed: ${error.message}`);
    lenses = data ?? [];
  }
  if (lenses.length === 0) {
    console.log('🔭 No active watch lens. Skipping.');
    return;
  }

  for (const lens of lenses) {
    const q = ((lens.query as string) ?? '').trim();
    if (!q) continue;
    console.log(`\n🔭 Watch lens: "${q}"${dryRun ? '  (dry run)' : ''}`);

    // Prefer the stored lens embedding; fall back to embedding it now.
    let lensVec = parseEmbedding((lens as { embedding: unknown }).embedding);
    if (!lensVec) lensVec = await embedText(q, 'RETRIEVAL_QUERY');

    const arxivQuery = lensToArxivQuery(q);
    const candidates = await fetchByQuery(arxivQuery, POOL);
    console.log(`   arXiv ${arxivQuery} → ${candidates.length} candidates`);
    if (candidates.length === 0) continue;

    // Embed each candidate and score by closeness to the lens.
    const scored: { p: (typeof candidates)[number]; sim: number }[] = [];
    for (const p of candidates) {
      const vec = await embedText(`${p.title}\n\n${p.abstract}`, 'RETRIEVAL_DOCUMENT');
      scored.push({ p, sim: cosine(lensVec, vec) });
      await sleep(120); // gentle on the embeddings quota
    }
    // The pool is already relevance-retrieved (domain-matched by arXiv), so it no
    // longer over-favors generic LLM papers. Sort by embedding similarity to pick
    // the most on-topic ones, gate by a floor, and cap.
    scored.sort((a, b) => b.sim - a.sim);
    const keep = scored.filter((s) => s.sim >= FLOOR).slice(0, CAP);
    console.log(
      `   Keeping ${keep.length} (sim ≥ ${FLOOR}, cap ${CAP}); ` +
        `best ${scored[0]?.sim.toFixed(3) ?? 'n/a'}, cutoff ${keep[keep.length - 1]?.sim.toFixed(3) ?? 'n/a'}`
    );

    if (dryRun) {
      scored.slice(0, Math.max(CAP + 5, 20)).forEach((s) => {
        console.log(`   ${keep.includes(s) ? '✓' : '·'} ${s.sim.toFixed(3)}  ${s.p.title.slice(0, 72)}`);
      });
      continue;
    }
    if (keep.length === 0) continue;

    const rows: PaperInsert[] = keep.map(({ p }) => ({
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
      source: 'watch',
      raw: p,
    }));

    // Insert-only: never clobber an existing paper (HF upvotes, prior scores).
    // embed.ts fills embeddings; score.ts judges source='watch' papers next.
    const { data, error: upErr } = await supabase
      .from('papers')
      .upsert(rows, { onConflict: 'arxiv_id', ignoreDuplicates: true })
      .select('arxiv_id');
    if (upErr) throw new Error(`Insert failed: ${upErr.message}`);
    console.log(`   ✅ Added ${data?.length ?? 0} watched papers to the library.`);
  }
}

main().catch((e) => {
  console.error('watch crashed:', e);
  process.exitCode = 1;
});
