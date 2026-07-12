'use client';
/**
 * WatchControls.tsx — owner controls for the standing "watch lens" on /search.
 *
 * WHAT IT IS:   Client component with the topic-watch owner controls plus an auto-refresh loop.
 * WHAT IT DOES: Renders the active lens as a read-only "🔭 Watching:" chip; for owners adds
 *               "✕ Reset" (clearWatch), "▶ Run now" (runWatchNow → on-demand ingest+judge on
 *               GitHub Actions), and "🔭 Watch <query>" (setWatch) when the typed query differs
 *               from the current lens. During a run it polls router.refresh() every 15s and shows
 *               running/done/timeout/error status text.
 * WORK WITH IT: <WatchControls query currentLens canWatch watchedCount />; rendered by the /search
 *               page above the results. Returns null when there is no lens and canWatch is false.
 * BEHAVIORS:    `run` state machine idle→running→done|timeout|error. Poll stops early when
 *               watchedCount grows past the snapshotted baseCount (→ done), or caps out after
 *               20 ticks × 15s ≈ 5 min (→ timeout). All owner buttons are gated by canWatch and
 *               disabled while pending/running; anonymous visitors see only the "Watching:" label.
 * CHANGE IT:    Poll cadence = the 15000ms interval; ~5-min cap = the `ticks.current >= 20` check;
 *               owner gating = the canWatch prop; server behavior = setWatch/clearWatch/runWatchNow
 *               (app/actions). (An older doc block for the component sits just below the imports.)
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setWatch, clearWatch, runWatchNow } from '@/app/actions';

/**
 * Owner control for the standing "watch lens": shows the active lens (with a
 * Reset), a "Watch this topic" button for a new query, and a "Run now" button
 * that triggers an on-demand ingest+judge (via GitHub Actions) and auto-refreshes
 * the feed as judged papers land. Anonymous visitors see only the read-only
 * "Watching:" label.
 */
export function WatchControls({
  query,
  currentLens,
  canWatch,
  watchedCount,
}: {
  query: string;
  currentLens: string | null;
  canWatch: boolean;
  watchedCount: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [run, setRun] = useState<'idle' | 'running' | 'done' | 'timeout' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const ticks = useRef(0);
  const baseCount = useRef(0);

  // While an on-demand run is in flight, refresh the feed periodically so newly
  // judged papers appear on their own. The job runs on GitHub Actions; a cold
  // runner (npm ci + embed + judge) can take a few minutes, so we poll up to
  // ~5 min. router.refresh() keeps this component mounted, so state + the
  // interval survive each refresh.
  useEffect(() => {
    if (run !== 'running') return;
    ticks.current = 0;
    baseCount.current = watchedCount;
    const id = setInterval(() => {
      ticks.current += 1;
      router.refresh();
      if (ticks.current >= 20) {
        clearInterval(id);
        setRun('timeout');
      }
    }, 15000);
    return () => clearInterval(id);
    // baseCount is snapshotted at start; we intentionally don't re-run on watchedCount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, router]);

  // New papers landed (the feed grew) → stop early and confirm success.
  useEffect(() => {
    if (run === 'running' && watchedCount > baseCount.current) {
      setRun('done');
    }
  }, [watchedCount, run]);

  async function onRunNow() {
    setMsg('');
    setRun('running');
    try {
      await runWatchNow();
    } catch (e) {
      setRun('error');
      setMsg((e as Error).message);
    }
  }

  if (!currentLens && !canWatch) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
      {currentLens && (
        <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          🔭 Watching: <strong className="font-medium">{currentLens}</strong>
          {canWatch && (
            <button
              type="button"
              disabled={pending || run === 'running'}
              onClick={() => start(() => void clearWatch())}
              className="text-indigo-400 hover:text-indigo-600 disabled:opacity-50 dark:hover:text-indigo-200"
            >
              ✕ Reset
            </button>
          )}
        </span>
      )}

      {canWatch && currentLens && (
        <button
          type="button"
          disabled={run === 'running'}
          onClick={onRunNow}
          className="rounded-full border border-emerald-300 px-3 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          {run === 'running' ? '⏳ Running… (updating automatically)' : '▶ Run now'}
        </button>
      )}

      {canWatch && query !== '' && query !== currentLens && (
        <button
          type="button"
          disabled={pending || run === 'running'}
          onClick={() => start(() => void setWatch(query))}
          className="rounded-full border border-indigo-300 px-3 py-1 font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
        >
          🔭 Watch “{query}”
        </button>
      )}

      {run === 'running' && (
        <span className="text-zinc-500">
          Running on GitHub Actions — new papers appear here as they’re judged (~1–3 min).
        </span>
      )}
      {run === 'done' && <span className="text-emerald-600 dark:text-emerald-400">✓ New papers added.</span>}
      {run === 'timeout' && (
        <span className="text-zinc-500">
          Still working, or nothing new this run — refresh in a bit, or check the repo’s Actions tab.
        </span>
      )}
      {run === 'error' && <span className="text-rose-600">{msg}</span>}
    </div>
  );
}
