import type { JudgeResult } from './anthropic';

/**
 * Blend the LLM judge with community signal into the final scores.
 * Every weight lives here so the ranking logic is easy to see and tune.
 */
export function computeScores(judge: JudgeResult, upvotes: number, upvoteMax: number) {
  // Normalize upvotes to 0–100 relative to the strongest paper in this batch.
  const upvoteScore = upvoteMax > 0 ? (upvotes / upvoteMax) * 100 : 0;

  // Importance = mostly the judge, nudged by community upvotes.
  const importance_score = 0.7 * judge.importance + 0.3 * upvoteScore;

  // Replicability comes straight from the judge (a soft factor).
  const replicability_score = judge.replicability;

  // Final = importance first, replicability as a boost (preferred-not-required).
  const final_score = importance_score + 0.3 * replicability_score;

  return {
    importance_score: round1(importance_score),
    replicability_score: round1(replicability_score),
    final_score: round1(final_score),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
