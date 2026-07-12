/**
 * scoring.ts — the ranking blend, isolated here so weights are easy to see and tune.
 *
 * WHAT IT IS:   The single home of PaperPicks' ranking math. RAW judge scores are
 *               stored stable; the time-varying final_score is DERIVED from them
 *               plus live signals (upvotes, citations, GitHub stars).
 * WHAT IT DOES: blendFinal(rawImportance, rawReplicability, upvotes, upvoteMax,
 *               citations, stars) → the final_score. computeScores(judge, upvotes,
 *               upvoteMax, citations, stars) → { importance_score, replicability_score
 *               (both RAW judge inputs), final_score } for the initial DB write.
 *               Internal helpers: citationScore & starScore (log2 curves, capped
 *               at 100), round1 (1-decimal rounding).
 * WORK WITH IT: import { computeScores } from '../src/lib/scoring' — used by the
 *               judge step scripts/score.ts. import { blendFinal } — used by the
 *               weekly re-blend scripts/rescore.ts, which recomputes final_score
 *               from the frozen raw scores + fresh signals (no LLM re-call).
 * BEHAVIORS:    Blend weights (in blendFinal): importance = 0.6·rawImportance +
 *               0.15·upvoteScore + 0.15·citationScore + 0.1·starScore, then
 *               final = importance + 0.3·rawReplicability (a soft boost). upvoteScore
 *               is upvotes/upvoteMax·100 (0 when upvoteMax≤0). Negative citations/
 *               stars are floored at 0. No env vars; pure functions.
 * CHANGE IT:    Retune ranking → edit the coefficients in blendFinal. Reshape how
 *               fast citations/stars pay off → edit the ·14 and ·10 multipliers in
 *               citationScore/starScore. Add a new signal → thread a param through
 *               blendFinal AND computeScores AND both caller scripts.
 */
import type { JudgeResult } from './anthropic';

const round1 = (n: number) => Math.round(n * 10) / 10;

// Heavy-tailed signals → log scale.
// citations: 0→0, 5→~36, 15→~56, 60→~85, 250+→100
function citationScore(citations: number): number {
  return Math.min(100, Math.log2(1 + Math.max(0, citations)) * 14);
}
// stars: 0→0, 10→~35, 100→~66, 1000→100
function starScore(stars: number): number {
  return Math.min(100, Math.log2(1 + Math.max(0, stars)) * 10);
}

/** The time-varying final score, from stored raw judge scores + live signals. */
export function blendFinal(
  rawImportance: number,
  rawReplicability: number,
  upvotes: number,
  upvoteMax: number,
  citations: number,
  stars: number
): number {
  const upvoteScore = upvoteMax > 0 ? (upvotes / upvoteMax) * 100 : 0;
  // Importance = mostly the judge, nudged by community + citation + code-adoption momentum.
  const importance =
    0.6 * rawImportance +
    0.15 * upvoteScore +
    0.15 * citationScore(citations) +
    0.1 * starScore(stars);
  // Replicability is a soft boost (preferred, not required).
  return round1(importance + 0.3 * rawReplicability);
}

/**
 * What the judge step writes: the RAW judge scores (stable inputs) plus an
 * initial blended final_score using whatever signals exist right now.
 */
export function computeScores(
  judge: JudgeResult,
  upvotes: number,
  upvoteMax: number,
  citations: number,
  stars: number
) {
  return {
    importance_score: judge.importance, // RAW — stable input to the weekly re-blend
    replicability_score: judge.replicability, // RAW
    final_score: blendFinal(judge.importance, judge.replicability, upvotes, upvoteMax, citations, stars),
  };
}
