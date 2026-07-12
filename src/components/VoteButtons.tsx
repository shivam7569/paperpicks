'use client';
/**
 * VoteButtons.tsx — 👍/👎 curation buttons (owner only).
 *
 * WHAT IT IS:   Client component rendered inside PaperCard when canVote is true.
 * WHAT IT DOES: Renders two buttons that call the setVote(paperId, next) server action via
 *               useTransition; clicking the already-active vote sends null to clear it
 *               (vote === v ? null : v). Local state mirrors the choice for instant feedback.
 * WORK WITH IT: <VoteButtons paperId={string} initialVote={number|null} />; only mounted for
 *               the signed-in owner (gated by PaperCard's canVote).
 * BEHAVIORS:    Optimistic local `vote` state seeded from initialVote; both buttons disabled
 *               while the transition is pending; active vote is tinted (emerald for 👍, rose for 👎).
 *               aria-labels describe the "more like this" / "hide and steer away" intent.
 * CHANGE IT:    Vote semantics/persistence live in setVote (app/actions); undo behavior is the
 *               `next` ternary in cast(); restyle via the `base` string and per-state classNames.
 */

import { useState, useTransition } from 'react';
import { setVote } from '@/app/actions';

export function VoteButtons({
  paperId,
  initialVote,
}: {
  paperId: string;
  initialVote: number | null;
}) {
  const [vote, setV] = useState<number | null>(initialVote ?? null);
  const [pending, start] = useTransition();

  const cast = (v: number) => {
    const next = vote === v ? null : v; // click again to undo
    setV(next);
    start(() => {
      void setVote(paperId, next);
    });
  };

  const base = 'rounded-md px-2 py-1 text-sm leading-none transition-colors disabled:opacity-50';

  return (
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        aria-label="Like — more like this"
        disabled={pending}
        onClick={() => cast(1)}
        className={`${base} ${
          vote === 1
            ? 'bg-emerald-100 dark:bg-emerald-900'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        👍
      </button>
      <button
        type="button"
        aria-label="Not for me — hide and steer away"
        disabled={pending}
        onClick={() => cast(-1)}
        className={`${base} ${
          vote === -1
            ? 'bg-rose-100 dark:bg-rose-900'
            : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
        }`}
      >
        👎
      </button>
    </div>
  );
}
