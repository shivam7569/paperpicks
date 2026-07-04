import type { JudgeResult } from './anthropic';

/**
 * Scoring blend — the ranking logic, kept here so it's easy to see and tune.
 *
 * We store the RAW, stable judge scores (importance_score = judge's importance,
 * replicability_score = judge's replicability) and DERIVE a time-varying
 * final_score by blending them with live signals: community upvotes, citations,
 * and GitHub stars. Re-running the blend weekly (scripts/rescore.ts) lets papers
 * that are *becoming* important (cited / starred more) climb — no LLM re-call.
 */

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
