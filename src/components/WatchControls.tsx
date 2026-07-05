'use client';

import { useTransition } from 'react';
import { setWatch, clearWatch } from '@/app/actions';

/**
 * Owner control for the standing "watch lens". Shows the active lens (with a
 * Reset) and, when you've typed a new query, a button to start watching it.
 * Anonymous visitors see only the read-only "Watching:" label (if a lens exists).
 */
export function WatchControls({
  query,
  currentLens,
  canWatch,
}: {
  query: string;
  currentLens: string | null;
  canWatch: boolean;
}) {
  const [pending, start] = useTransition();

  if (!currentLens && !canWatch) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
      {currentLens && (
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          🔭 Watching: <strong className="font-medium">{currentLens}</strong>
          {canWatch && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(() => void clearWatch())}
              className="text-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:hover:text-indigo-200"
            >
              ✕ Reset
            </button>
          )}
        </span>
      )}
      {canWatch && query !== '' && query !== currentLens && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => void setWatch(query))}
          className="rounded-full border border-indigo-300 px-3 py-1 font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          🔭 Watch “{query}”
        </button>
      )}
    </div>
  );
}
