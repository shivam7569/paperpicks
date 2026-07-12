/**
 * ingest.ts — weekly step 1: pull Hugging Face Daily Papers into the library.
 *
 * WHAT IT IS:   The FIRST step of the weekly pipeline (ingest → ingest:arxiv →
 *               watch → enrich → embed → prune → citations → stars → score →
 *               rescore). HF Daily Papers is community-curated and carries
 *               upvotes, so it is the high-signal candidate source that later
 *               gets judged by Claude (score.ts).
 * WHAT IT DOES: Fetches the HF Daily Papers JSON, maps each item to a `papers`
 *               row (arxiv_id, title, abstract, authors, arXiv url/pdf_url,
 *               hf_upvotes, source='hf_daily', raw payload), and upserts into
 *               Supabase. code_url/categories are left null for enrich.ts to fill.
 * WORK WITH IT: `npm run ingest` writes to Supabase; `npm run ingest -- --dry-run`
 *               fetches + parses only (prints a sample, no DB writes, no keys
 *               needed). Runs before ingest:arxiv.
 * BEHAVIORS:    Reads Supabase creds via getServiceClient (env from .env.local, or
 *               CI secrets — config() is a no-op when the file is absent). Upserts
 *               onConflict='arxiv_id': new papers inserted, existing refreshed,
 *               while unset columns (scores, embedding) keep their values. Skips
 *               items missing an arxiv_id or title (toRow returns null). Field is a
 *               rough keyword guess (classifyField) later corrected by enrich.ts.
 *               Single fetch, no retry/rate-limit logic; a failed upsert exits 1.
 * CHANGE IT:    HF_DAILY_PAPERS_URL selects the source endpoint. VISION_HINTS drives
 *               the temporary llm-vs-vision guess. Add `--dry-run` to preview safely.
 */
import { config } from 'dotenv';
// Load local secrets. In CI (GitHub Actions) there's no .env.local and env
// vars come from repo secrets — config() then simply does nothing. Harmless.
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import type { PaperInsert, PrimaryField } from '../src/lib/types';

const HF_DAILY_PAPERS_URL = 'https://huggingface.co/api/daily_papers';

// --- Rough first-pass field classifier -------------------------------------
// TEMPORARY: keyword guess of llm-vs-vision. Phase 5 replaces this with the
// paper's real arXiv categories (cs.CV → vision, cs.CL → llm, ...).
const VISION_HINTS = [
  'image', 'vision', 'video', 'segmentation', 'detection', 'diffusion',
  '3d', 'pixel', 'scene', 'depth', 'render', 'photo', 'visual', 'gaussian',
];
function classifyField(text: string): PrimaryField {
  const t = text.toLowerCase();
  return VISION_HINTS.some((k) => t.includes(k)) ? 'vision' : 'llm';
}

// --- Shape of the bits of the HF response we use ---------------------------
interface HfAuthor { name?: string }
interface HfPaper {
  id?: string;
  title?: string;
  summary?: string;
  upvotes?: number;
  publishedAt?: string;
  authors?: HfAuthor[];
}
interface HfDailyItem {
  paper?: HfPaper;
  title?: string;
  publishedAt?: string;
}

async function fetchDailyPapers(): Promise<HfDailyItem[]> {
  const res = await fetch(HF_DAILY_PAPERS_URL, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HF fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as HfDailyItem[]) : [];
}

/** Map one HF item to a papers row, or null if it's missing essentials. */
function toRow(item: HfDailyItem): PaperInsert | null {
  const p = item.paper ?? {};
  const arxivId = p.id?.trim();
  const title = (p.title ?? item.title ?? '').trim();
  if (!arxivId || !title) return null;

  const abstract = p.summary?.trim() ?? null;
  const authors = (p.authors ?? [])
    .map((a) => a.name?.trim())
    .filter((n): n is string => Boolean(n));

  return {
    arxiv_id: arxivId,
    title,
    abstract,
    authors,
    url: `https://arxiv.org/abs/${arxivId}`,
    pdf_url: `https://arxiv.org/pdf/${arxivId}`,
    code_url: null, // detected during enrichment (arXiv comment/abstract)
    categories: null, // filled later when we add arXiv metadata
    primary_field: classifyField(`${title} ${abstract ?? ''}`),
    published_at: p.publishedAt ?? item.publishedAt ?? null,
    hf_upvotes: p.upvotes ?? 0,
    source: 'hf_daily',
    raw: item,
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(`\n📥 Ingest starting${dryRun ? '  (dry run — no DB writes)' : ''}...`);

  const items = await fetchDailyPapers();
  const rows = items.map(toRow).filter((r): r is PaperInsert => r !== null);
  console.log(
    `   Fetched ${items.length} items from HF Daily Papers → ${rows.length} valid papers.`
  );
  if (rows.length === 0) {
    console.log('   Nothing to ingest.');
    return;
  }

  const visionCount = rows.filter((r) => r.primary_field === 'vision').length;
  console.log(
    `   Rough field split: ${rows.length - visionCount} llm/language · ${visionCount} vision.`
  );

  if (dryRun) {
    const s = rows[0];
    console.log('\n   Sample mapped paper:');
    console.log(`   • ${s.title}`);
    console.log(
      `     arxiv_id=${s.arxiv_id}  field=${s.primary_field}  upvotes=${s.hf_upvotes}`
    );
    console.log('\n   ✅ Dry run complete. No database changes made.');
    return;
  }

  // Upsert on arxiv_id: new papers inserted, existing ones refreshed. Columns we
  // don't set here (scores, embedding) keep their existing values on conflict.
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('papers')
    .upsert(rows, { onConflict: 'arxiv_id' })
    .select('arxiv_id');

  if (error) {
    console.error('   ❌ Upsert failed:', error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`   ✅ Upserted ${data?.length ?? rows.length} papers into Supabase.`);
}

main().catch((err) => {
  console.error('Ingest crashed:', err);
  process.exitCode = 1;
});
