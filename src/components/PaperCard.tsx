/**
 * PaperCard.tsx — one ranked paper in the weekly feed.
 *
 * WHAT IT IS:   Server component (no 'use client'); renders a single ranked paper card.
 * WHAT IT DOES: Shows rank (#N) + final_score, chips for primary_field (via fieldLabel),
 *               replicability_badge (hidden when null/'unclear'), and hf_upvotes (▲) when present;
 *               the linked title, the LLM importance_reason paragraph, a deterministic
 *               "Why this rank:" line from explainScore(paper), an author line (first 3 + 'et al.'),
 *               and arXiv/PDF/Code links. Renders <VoteButtons> only when canVote is true.
 * WORK WITH IT: <PaperCard paper={PaperRow} rank={n} canVote={bool} />; used by the feed/search
 *               list pages that map over ranked papers. canVote defaults to false.
 * BEHAVIORS:    Pure/stateless — all data comes from the paper prop. score falls back to '—'
 *               when final_score is null; badge and upvote chips are conditionally omitted;
 *               title link falls back to '#'; VoteButtons is owner-gated by the canVote prop.
 * CHANGE IT:    Field names → fieldLabel(); rank explanation → explainScore (lib/explain);
 *               vote gating → the canVote prop; colors/spacing → the Tailwind classNames.
 */
import type { PaperRow } from '@/lib/papers';
import { explainScore } from '@/lib/explain';
import { VoteButtons } from '@/components/VoteButtons';

function fieldLabel(f: string | null): string {
  if (f === 'vision') return 'Vision';
  if (f === 'llm') return 'LLM / Language';
  return '—';
}

export function PaperCard({
  paper,
  rank,
  canVote = false,
}: {
  paper: PaperRow;
  rank: number;
  canVote?: boolean;
}) {
  const score = paper.final_score != null ? paper.final_score.toFixed(1) : '—';
  const names = paper.authors ?? [];
  const authorLine = names.slice(0, 3).join(', ') + (names.length > 3 ? ' et al.' : '');
  const badge = paper.replicability_badge;
  const rationale = explainScore(paper);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="flex items-start gap-3">
        {/* rank + score */}
        <div className="flex w-12 flex-col items-center">
          <span className="text-xs text-zinc-400">#{rank}</span>
          <span className="mt-0.5 rounded-md bg-emerald-50 px-2 py-1 text-sm font-semibold tabular-nums text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            {score}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {fieldLabel(paper.primary_field)}
              </span>
              {badge && badge !== 'unclear' && (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                  {badge}
                </span>
              )}
              {paper.hf_upvotes ? <span className="text-zinc-400">▲ {paper.hf_upvotes}</span> : null}
            </div>
            {canVote && <VoteButtons paperId={paper.id} initialVote={paper.my_vote} />}
          </div>

          <h2 className="font-medium leading-snug text-zinc-900 dark:text-zinc-100">
            <a
              href={paper.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {paper.title}
            </a>
          </h2>

          {paper.importance_reason && (
            <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {paper.importance_reason}
            </p>
          )}

          <p className="mt-1.5 flex flex-wrap gap-x-1.5 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">
            <span className="shrink-0 font-medium">Why this rank:</span>
            <span className="italic">{rationale}</span>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            {authorLine && <span className="truncate">{authorLine}</span>}
            <span className="flex gap-2">
              {paper.url && (
                <a className="hover:text-zinc-800 dark:hover:text-zinc-200" href={paper.url} target="_blank" rel="noopener noreferrer">arXiv</a>
              )}
              {paper.pdf_url && (
                <a className="hover:text-zinc-800 dark:hover:text-zinc-200" href={paper.pdf_url} target="_blank" rel="noopener noreferrer">PDF</a>
              )}
              {paper.code_url && (
                <a className="hover:text-zinc-800 dark:hover:text-zinc-200" href={paper.code_url} target="_blank" rel="noopener noreferrer">Code</a>
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
