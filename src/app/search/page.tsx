import { searchPapers } from '@/lib/papers';
import { PaperCard } from '@/components/PaperCard';

export const dynamic = 'force-dynamic';

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? '').trim();
  const results = query ? await searchPapers(query, { limit: 20 }) : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Find papers by meaning, not just keywords — across the whole corpus.
        </p>
      </div>

      <form action="/search" method="get" className="mb-6">
        <input
          type="search"
          name="q"
          defaultValue={query}
          autoFocus
          placeholder="e.g. retrieval-augmented generation, video diffusion…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500"
        />
      </form>

      {query === '' ? (
        <p className="text-zinc-500">Type a topic above to search your paper library.</p>
      ) : results.length === 0 ? (
        <p className="text-zinc-500">No matches for “{query}”.</p>
      ) : (
        <ol className="space-y-4">
          {results.map((p, i) => (
            <li key={p.id}>
              <PaperCard paper={p} rank={i + 1} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
