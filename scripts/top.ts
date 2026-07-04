/**
 * PaperPicks — top (inspection helper)
 * ------------------------------------------------------------------
 * Prints the highest-ranked papers straight from Supabase, so you can eyeball
 * what the scoring produced without opening the dashboard.
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
