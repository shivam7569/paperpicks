/**
 * top.ts — read-only inspector: print the top papers by final_score.
 *
 * WHAT IT IS:   A diagnostic helper, NOT a weekly pipeline step. It lets you
 *               eyeball what scoring produced from the terminal without opening
 *               the dashboard.
 * WHAT IT DOES: Selects papers ordered by final_score desc (nulls last) and prints
 *               a ranked list — score, primary_field, replicability_badge, upvotes,
 *               title, and the LLM's importance_reason. Reads only; writes nothing.
 * WORK WITH IT: `npm run top` (top 10 overall). `npm run top -- --limit N` changes
 *               the count. `npm run top -- --field <name>` filters by primary_field
 *               (e.g. `vision`, `llm`). Run it any time after score/rescore.
 * BEHAVIORS:    Reads only Supabase service credentials (getServiceClient). No LLM,
 *               no rate limits, no mutations. Throws (exit 1) on a Supabase error;
 *               prints a "run ingest then score first" hint when the table is empty.
 * CHANGE IT:    Default row count is the '10' fallback in the --limit parse; edit the
 *               .select(...) list or the .order(...) column to inspect different
 *               fields or sort differently.
 *
 * Usage:
 *   npm run top                    → top 10 overall
 *   npm run top -- --limit 5       → top 5
 *   npm run top -- --field vision  → top 10 computer-vision papers
 *   npm run top -- --field llm     → top 10 llm/language papers
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limit = parseInt(argValue('--limit') ?? '10', 10);
  const field = argValue('--field'); // 'llm' | 'vision' | undefined

  const supabase = getServiceClient();
  let query = supabase
    .from('papers')
    .select('title, primary_field, final_score, replicability_badge, importance_reason, hf_upvotes')
    .order('final_score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (field) query = query.eq('primary_field', field);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    console.log('No papers found. Run `npm run ingest` then `npm run score` first.');
    return;
  }

  console.log(`\n🏆 Top ${data.length} papers by final_score${field ? ` (${field})` : ''}:\n`);
  data.forEach((p, i) => {
    const score = p.final_score != null ? Number(p.final_score).toFixed(1) : ' — ';
    console.log(
      `${String(i + 1).padStart(2)}. [${score}]  (${p.primary_field ?? '?'} · ${p.replicability_badge ?? '?'} · ▲${p.hf_upvotes ?? 0})`
    );
    console.log(`    ${p.title}`);
    if (p.importance_reason) console.log(`    ↳ ${p.importance_reason}`);
    console.log('');
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
