/**
 * score.ts — weekly step: the LLM judge (the expensive one).
 *
 * WHAT IT IS:   The one pipeline step that calls Claude. It assigns each new
 *               high-signal candidate its raw importance / replicability scores
 *               and an initial final_score; rescore.ts later re-blends the final
 *               from these cached raw scores without paying for the LLM again.
 * WHAT IT DOES: Selects UNSCORED candidate papers — importance_score IS NULL AND
 *               (source='hf_daily' OR source='watch' OR hf_upvotes>0), ordered by
 *               upvotes desc — judges each with Claude (judgePaper via
 *               src/lib/anthropic), blends in community signal (computeScores from
 *               src/lib/scoring), and writes importance_score, replicability_score,
 *               final_score, importance_reason, replicability_badge back per row.
 * WORK WITH IT: `npm run score` — 9th pipeline step (after stars, before rescore).
 *               `npm run score -- --limit N` judges only N papers (cheap test run).
 *               `npm run score -- --reset` first NULLs all five score columns on
 *               every paper, then re-judges the whole candidate set (use after
 *               changing the judge model). Resumable: touches only rows where
 *               importance_score IS NULL, so a re-run picks up where it left off.
 * BEHAVIORS:    Reads SCORE_DELAY_MS (default 250) plus the Anthropic + Supabase
 *               credentials used by src/lib/anthropic and getServiceClient.
 *               Deliberately skips the broad arXiv search corpus (source='arxiv',
 *               0 upvotes) to protect the budget — those exist for embeddings/search
 *               only. Goes one paper at a time with a SCORE_DELAY_MS pause between
 *               calls; the Anthropic SDK additionally auto-retries 429/5xx with
 *               backoff. Per-paper judge failures are caught and counted; the run
 *               exits 1 if any paper failed.
 * CHANGE IT:    Pace LLM calls via SCORE_DELAY_MS. Change WHICH papers get judged by
 *               editing the .or(...) candidate filter. The judge prompt/model lives
 *               in src/lib/anthropic (judgePaper/judgeModelName); the raw→final blend
 *               weights live in src/lib/scoring (computeScores).
 *
 * Usage:
 *   npm run score                 → score ALL unscored candidate papers
 *   npm run score -- --limit 3    → score only the top 3 (cheap test run)
 *   npm run score -- --reset      → clear every score, then re-judge everything
 *
 * Resumable: it only touches papers where importance_score IS NULL, so you can
 * re-run it any time and it picks up where it left off.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

import { getServiceClient } from '../src/lib/supabase';
import { judgePaper, judgeModelName } from '../src/lib/anthropic';
import { computeScores } from '../src/lib/scoring';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const limitArg = argValue('--limit');
  const limit = limitArg ? parseInt(limitArg, 10) : undefined;

  const supabase = getServiceClient();

  // --reset: clear all existing scores first (e.g. after changing the judge
  // model) so the whole library is re-judged by one consistent model.
  if (process.argv.includes('--reset')) {
    const { data: cleared, error: rErr } = await supabase
      .from('papers')
      .update({
        importance_score: null,
        replicability_score: null,
        final_score: null,
        importance_reason: null,
        replicability_badge: null,
      })
      .not('id', 'is', null)
      .select('id');
    if (rErr) throw new Error(`Reset failed: ${rErr.message}`);
    console.log(`♻️  Reset scores on ${cleared?.length ?? 0} papers.`);
  }

  // Only judge high-signal CANDIDATES (HF-curated / community-upvoted), NOT the
  // whole search corpus. Broad arXiv papers (source='arxiv', 0 upvotes) exist for
  // embeddings/search only — judging them all would blow the budget.
  let query = supabase
    .from('papers')
    .select('id, title, abstract, primary_field, hf_upvotes, citation_count, github_stars')
    .is('importance_score', null)
    .or('source.eq.hf_daily,source.eq.watch,hf_upvotes.gt.0')
    .order('hf_upvotes', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data: papers, error } = await query;
  if (error) throw new Error(`Fetch failed: ${error.message}`);
  if (!papers || papers.length === 0) {
    console.log('✅ No unscored papers. Nothing to do.');
    return;
  }

  const upvoteMax = Math.max(...papers.map((p) => p.hf_upvotes ?? 0), 1);
  console.log(
    `\n🧮 Scoring ${papers.length} papers with ${judgeModelName()} (upvoteMax=${upvoteMax})...\n`
  );

  let ok = 0;
  let failed = 0;

  // Go one-at-a-time with a small delay between calls; the Anthropic SDK also
  // auto-retries 429/5xx with backoff. Tune the gap with SCORE_DELAY_MS.
  const DELAY_MS = Number(process.env.SCORE_DELAY_MS) || 250;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let idx = 0; idx < papers.length; idx++) {
    const p = papers[idx];
    try {
      const judge = await judgePaper({
        title: p.title,
        field: p.primary_field,
        abstract: p.abstract,
      });
      const scores = computeScores(
        judge,
        p.hf_upvotes ?? 0,
        upvoteMax,
        p.citation_count ?? 0,
        p.github_stars ?? 0
      );

      const { error: upErr } = await supabase
        .from('papers')
        .update({
          importance_score: scores.importance_score,
          replicability_score: scores.replicability_score,
          final_score: scores.final_score,
          importance_reason: judge.reason,
          replicability_badge: judge.badge,
        })
        .eq('id', p.id);
      if (upErr) throw new Error(upErr.message);

      ok++;
      console.log(`   ✓ [${scores.final_score.toFixed(1)}] ${p.title.slice(0, 70)}`);
      console.log(`       ${judge.reason}`);
    } catch (e) {
      failed++;
      console.warn(`   ✗ ${p.title.slice(0, 70)} — ${(e as Error).message}`);
    }
    if (idx < papers.length - 1) await sleep(DELAY_MS);
  }

  console.log(`\n🧮 Done. Scored ${ok}, failed ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Score crashed:', err);
  process.exitCode = 1;
});
