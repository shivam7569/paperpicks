/**
 * PaperPicks — embed
 * ------------------------------------------------------------------
 * Gives every paper a semantic vector (gemini-embedding-2 @768). These power
 * BOTH semantic search and feedback-driven recommendations (papers similar to
 * the ones you 👍).
 *
 * Resumable: only touches papers where embedding IS NULL.
 *
 * Usage:
 *   npm run embed                 → embed all papers missing a vector
 *   npm run embed -- --limit 20   → cap it for a quick test
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
