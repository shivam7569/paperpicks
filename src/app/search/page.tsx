import { searchPapers, getWatch, getWatchedPapers } from '@/lib/papers';
import { isOwner } from '@/lib/supabase-server';
import { PaperCard } from '@/components/PaperCard';
import { WatchControls } from '@/components/WatchControls';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const [results, canVote, lens] = await Promise.all([
    query ? searchPapers(query, { limit: 20 }) : Promise.resolve([]),
    isOwner(),
    getWatch(),
  ]);
  const watched = query === '' && lens ? await getWatchedPapers(20) : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Find papers by meaning, not just keywords — across the whole corpus.
        </p>
      </div>

      <form action="/search" method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="e.g. retrieval-augmented generation, video diffusion…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
      </form>

      <WatchControls query={query} currentLens={lens?.query ?? null} canWatch={canVote} />

      {query !== '' ? (
        results.length === 0 ? (
          <p className="text-zinc-500">No matches for “{query}”.</p>
        ) : (
          <ol className="space-y-4">
            {results.map((p, i) => (
              <li key={p.id}>
                <PaperCard paper={p} rank={i + 1} canVote={canVote} />
              </li>
            ))}
          </ol>
        )
      ) : lens ? (
        <div>
          <h2 className="mb-3 text-sm font-medium text-zinc-500">
            Your watch — newest ranked papers on “{lens.query}”
          </h2>
          {watched.length === 0 ? (
            <p className="text-zinc-500">
              No watched papers yet — the weekly job will fill this after its next run.
            </p>
          ) : (
            <ol className="space-y-4">
              {watched.map((p, i) => (
                <li key={p.id}>
                  <PaperCard paper={p} rank={i + 1} canVote={canVote} />
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <p className="text-zinc-500">Type a topic above to search your paper library.</p>
      )}
    </div>
  );
}
