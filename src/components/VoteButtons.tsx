'use client';

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
