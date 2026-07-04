import { getRecommended } from '@/lib/papers';
import { isOwner } from '@/lib/supabase-server';
import { PaperCard } from '@/components/PaperCard';

export const dynamic = 'force-dynamic';

export default async function ForYouPage() {
  const [papers, canVote] = await Promise.all([getRecommended(12), isOwner()]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">For You</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Papers closest to what you’ve 👍’d (and away from what you’ve 👎’d). The more
          you rate, the sharper this gets.
        </p>
      </div>

      {papers.length === 0 ? (
        <p className="text-zinc-500">
          Nothing to recommend yet — 👍 a few papers on This Week or Search to seed it.
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
