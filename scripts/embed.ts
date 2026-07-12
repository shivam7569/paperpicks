/**
 * embed.ts — weekly step 5: give every paper a semantic embedding vector.
 *
 * WHAT IT IS:   The "embed" step (runs after enrich, before prune). It produces the
 *               vectors that power BOTH semantic search and feedback-driven
 *               recommendations (papers similar to the ones you 👍), and that watch.ts
 *               compares against its lens.
 * WHAT IT DOES: Selects papers with embedding IS NULL, embeds each one's
 *               "title\n\nabstract" via Gemini (gemini-embedding-2 @768,
 *               RETRIEVAL_DOCUMENT task type), and writes the vector back to the
 *               `embedding` column as JSON.stringify(vec) — pgvector accepts that
 *               "[0.1,0.2,…]" text format.
 * WORK WITH IT: `npm run embed` embeds all papers missing a vector; `-- --limit 20`
 *               caps the batch for a quick test.
 * BEHAVIORS:    Reads Supabase creds via getServiceClient plus the Gemini key used
 *               by src/lib/gemini. Resumable — only NULL embeddings are touched, so
 *               re-running continues where it left off. Sleeps EMBED_DELAY_MS (env,
 *               default 200ms) between calls. Input text is capped at 8000 chars.
 *               Each paper is wrapped in try/catch: failures are warned and counted,
 *               and the process exits 1 if any failed.
 * CHANGE IT:    `--limit N` bounds the run; EMBED_DELAY_MS env var tunes throttling.
 *               The model/dimensionality/task type live in embedText/embeddingModelName
 *               (src/lib/gemini.ts).
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { embedText, embeddingModelName } from '../src/lib/gemini';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limitArg = argValue('--limit');
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;
  const supabase = getServiceClient();

  let query = supabase.from('papers').select('id, title, abstract').is('embedding', null);
  if (limit) query = query.limit(limit);

  const { data: papers, error } = await query;
  if (error) throw new Error(error.message);
  if (!papers || papers.length === 0) {
    console.log('✅ Every paper is already embedded.');
    return;
  }

  console.log(`\n🧬 Embedding ${papers.length} papers with ${embeddingModelName()}...\n`);
  const DELAY_MS = Number(process.env.EMBED_DELAY_MS) || 200;
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < papers.length; i++) {
    const p = papers[i];
    try {
      // Title + abstract is the paper's "meaning"; cap length as a safety net.
      const text = `${p.title}\n\n${p.abstract ?? ''}`.slice(0, 8000);
      const vec = await embedText(text, 'RETRIEVAL_DOCUMENT');

      // pgvector accepts its text format "[0.1,0.2,...]" — JSON.stringify matches it.
      const { error: upErr } = await supabase
        .from('papers')
        .update({ embedding: JSON.stringify(vec) })
        .eq('id', p.id);
      if (upErr) throw new Error(upErr.message);

      ok++;
      if (ok % 20 === 0 || i === papers.length - 1) {
        console.log(`   …${ok}/${papers.length} embedded`);
      }
    } catch (e) {
      failed++;
      console.warn(`   ✗ ${p.id} — ${(e as Error).message}`);
    }
    if (i < papers.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n🧬 Done. Embedded ${ok}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
