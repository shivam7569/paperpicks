import { getTopScored } from '@/lib/papers';
import { isOwner } from '@/lib/supabase-server';
import { PaperCard } from '@/components/PaperCard';

// Always read fresh from the DB at request time (data refreshes weekly).
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [papers, canVote] = await Promise.all([getTopScored(12), isOwner()]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">This Week</h1>
        <p className="mt-1 text-sm text-zinc-500">
          The most important AI papers, judged by Claude Sonnet 5 and ranked.
        </p>
      </div>

      {papers.length === 0 ? (
        <p className="text-zinc-500">
          No scored papers yet — run the pipeline (<code>npm run ingest</code> then{' '}
          <code>npm run score</code>) to populate.
        </p>
      ) : (
        <ol className="space-y-4">
          {papers.map((p, i) => (
            <li key={p.id}>
              <PaperCard paper={p} rank={i + 1} canVote={canVote} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
