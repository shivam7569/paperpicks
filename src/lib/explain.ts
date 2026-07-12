/**
 * explain.ts — deterministic natural-language "why this rank" generator.
 *
 * WHAT IT IS:   A pure, rule-based explainer for a paper's ranking. Deterministic,
 *               NOT an LLM call — it just reads the same numbers scoring.ts blends,
 *               so it never goes stale as the living score shifts week to week.
 *               Complements importance_reason (what the paper contributes) by
 *               explaining WHY it scored where it did.
 * WHAT IT DOES: Exports explainScore(p: ScoreParts) → a plain-English string built
 *               from up to three sentences: (1) the primary driver — real-world
 *               impact vs. community buzz vs. raw contribution; (2) reproducibility,
 *               when notable; (3) recency context ("living score" story). Helpers
 *               fmt (locale number) and joinList (Oxford-comma list) are internal.
 * WORK WITH IT: import { explainScore } from '@/lib/explain'. Called by
 *               components/PaperCard.tsx, passing the PaperRow's score fields.
 * BEHAVIORS:    Returns a "Not yet judged — surfaced by search relevance" notice
 *               when importance_score or final_score is null (unjudged corpus hits).
 *               Null signals default to 0 / age to null. Thresholds: impact =
 *               cites≥10 or stars≥50; buzz = upvotes≥10; novelty-high = imp≥65;
 *               reproducibility strong = rep≥80 (or ≥60 with impact/buzz); recency
 *               notes at ≤120 days (no impact) and ≥365 days (with impact).
 * CHANGE IT:    Reword the rationale → edit the sentence templates in explainScore.
 *               Retune when each story fires → adjust the hasImpact/hasBuzz/rep/
 *               ageDays threshold constants. Keep it in sync with scoring.ts weights
 *               so the narrative matches the actual math.
 */
type ScoreParts = {
  final_score: number | null;
  importance_score: number | null; // raw judge importance (0–100)
  replicability_score: number | null; // raw judge replicability (0–100)
  citation_count: number | null;
  github_stars: number | null;
  hf_upvotes: number | null;
  published_at: string | null;
};

const fmt = (n: number) => n.toLocaleString('en-US');

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function explainScore(p: ScoreParts): string {
  // Unjudged corpus papers (shown in Search by similarity) have no score to explain.
  if (p.importance_score == null || p.final_score == null) {
    return 'Not yet judged — surfaced here by search relevance, not by a ranking score.';
  }

  const imp = p.importance_score;
  const rep = p.replicability_score ?? 0;
  const cites = p.citation_count ?? 0;
  const stars = p.github_stars ?? 0;
  const up = p.hf_upvotes ?? 0;
  const ageDays = p.published_at
    ? (Date.now() - new Date(p.published_at).getTime()) / 86_400_000
    : null;

  const hasImpact = cites >= 10 || stars >= 50;
  const hasBuzz = up >= 10;
  const sentences: string[] = [];

  // 1) The primary driver of the rank.
  if (hasImpact) {
    const bits: string[] = [];
    if (cites >= 1) bits.push(`${fmt(cites)} citation${cites === 1 ? '' : 's'}`);
    if (stars >= 50) bits.push(`${fmt(stars)} GitHub stars`);
    const contrast =
      imp < 60
        ? ' — even though its raw novelty was judged only moderate, that demonstrated adoption is what carries it'
        : ', complementing a solid novelty rating';
    sentences.push(`Ranks high mainly on proven real-world impact: ${joinList(bits)}${contrast}.`);
  } else if (hasBuzz) {
    sentences.push(
      `An early-stage pick riding community attention — ${fmt(up)} Hugging Face upvotes — ` +
        (imp >= 65 ? 'paired with a high novelty rating.' : 'ahead of any citation or adoption track record.')
    );
  } else {
    sentences.push(
      imp >= 65
        ? 'Ranks on the strength of its core contribution, which the model rated highly.'
        : 'A steady mid-table pick: a reasonable contribution without standout community or citation signals yet.'
    );
  }

  // 2) Reproducibility, when it's a real factor.
  if (rep >= 80) {
    sentences.push('It also scores well on reproducibility (code and data available), nudging it up.');
  } else if (rep >= 60 && (hasImpact || hasBuzz)) {
    sentences.push('Reproducibility is reasonable, adding a small boost.');
  }

  // 3) Recency context — the "living score" story.
  if (ageDays !== null) {
    if (ageDays <= 120 && !hasImpact) {
      sentences.push(
        "It's very recent, so there hasn't been time to accumulate citations or stars — the score leans on early signals."
      );
    } else if (ageDays >= 365 && hasImpact) {
      sentences.push('It’s an older paper whose impact has compounded over time — the "living score" at work.');
    }
  }

  return sentences.join(' ');
}
