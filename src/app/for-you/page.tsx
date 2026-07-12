/**
 * for-you/page.tsx — the "/for-you" route (personalized recommendations).
 *
 * WHAT IT IS:   Server component for the taste-personalized "For You" page.
 * WHAT IT DOES: Fetches the top 12 recommended papers (getRecommended(12)) and
 *               isOwner() in parallel, then renders them as a numbered <ol> of ranked
 *               PaperCards. Recommendations lean toward papers similar to what you've
 *               👍'd and away from what you've 👎'd (a taste vector).
 * WORK WITH IT: Route "/for-you". Depends on getRecommended from papers.ts, isOwner()
 *               from supabase-server, and the PaperCard component.
 * BEHAVIORS:    export const dynamic = 'force-dynamic' — fresh per request. Empty state
 *               (no votes yet → no taste vector) prompts you to 👍 a few papers on This
 *               Week or Search to seed it. canVote gates the 👍/👎 controls to the owner.
 * CHANGE IT:    Number shown → the count passed to getRecommended(12); the similarity /
 *               taste-vector math lives in getRecommended inside papers.ts.
 */
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
