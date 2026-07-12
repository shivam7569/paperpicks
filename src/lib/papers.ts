import { getServiceClient } from './supabase';
import { embedText } from './gemini';

/**
 * Server-side reads for the UI. Uses the service-role client (server-only).
 * NEVER import into a client component — it would leak the service key.
 */

export interface PaperRow {
  id: string;
  arxiv_id: string;
  title: string;
  authors: string[] | null;
  url: string | null;
  pdf_url: string | null;
  code_url: string | null;
  primary_field: string | null;
  final_score: number | null;
  importance_score: number | null; // raw judge importance (for the score rationale)
  replicability_score: number | null; // raw judge replicability
  importance_reason: string | null;
  replicability_badge: string | null;
  hf_upvotes: number | null;
  citation_count: number | null;
  github_stars: number | null;
  published_at: string | null;
  my_vote: number | null; // 1 = 👍, -1 = 👎, null = no vote
}

const COLS =
  'id, arxiv_id, title, authors, url, pdf_url, code_url, primary_field, ' +
  'final_score, importance_score, replicability_score, importance_reason, ' +
  'replicability_badge, hf_upvotes, citation_count, github_stars, published_at, my_vote';

// Keep unvoted (null) + liked, drop 👎 (-1). Used to hide dismissed papers.
const NOT_HIDDEN = 'my_vote.is.null,my_vote.neq.-1';

/** Top-ranked, judged papers — the curated "This Week" view (👎'd papers hidden). */
export async function getTopScored(limit = 12): Promise<PaperRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('papers')
    .select(COLS)
    .not('final_score', 'is', null)
    .or(NOT_HIDDEN)
    .order('final_score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PaperRow[];
}

/** Semantic search over the whole corpus by pgvector similarity (👎'd hidden). */
export async function searchPapers(
  query: string,
  opts: { field?: string; limit?: number } = {}
): Promise<PaperRow[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = getServiceClient();
  const vec = await embedText(q, 'RETRIEVAL_QUERY');

  const { data: matches, error } = await supabase.rpc('match_papers', {
    query_embedding: vec,
    match_count: Math.min(60, (opts.limit ?? 20) * 3), // over-fetch, then re-rank
    field_filter: opts.field ?? null,
  });
  if (error) throw new Error(error.message);

  const sims = new Map(
    ((matches ?? []) as { id: string; similarity?: number }[]).map((m) => [m.id, m.similarity ?? 0])
  );
  const ids = [...sims.keys()];
  if (ids.length === 0) return [];

  const { data: rows, error: e2 } = await supabase
    .from('papers')
    .select(COLS)
    .in('id', ids)
    .or(NOT_HIDDEN);
  if (e2) throw new Error(e2.message);

  // Gently tilt pure similarity toward fresher + higher-scored papers, so search
  // surfaces relevant-AND-current work rather than just the closest match.
  const now = Date.now();
  const ranked = ((rows ?? []) as unknown as PaperRow[]).map((r) => {
    const sim = sims.get(r.id) ?? 0;
    const importanceNorm = (r.final_score ?? 0) / 100;
    const ageDays = r.published_at
      ? (now - new Date(r.published_at).getTime()) / 86_400_000
      : 999;
    const recencyNorm = Math.max(0, 1 - ageDays / 60);
    return { r, combined: sim + 0.06 * importanceNorm + 0.05 * recencyNorm };
  });
  ranked.sort((a, b) => b.combined - a.combined);
  return ranked.slice(0, opts.limit ?? 20).map((x) => x.r);
}

function parseEmbedding(e: unknown): number[] | null {
  if (Array.isArray(e)) return e as number[];
  if (typeof e === 'string') {
    try {
      return JSON.parse(e) as number[];
    } catch {
      return null;
    }
  }
  return null;
}

function averageVectors(vs: number[][]): number[] {
  const d = vs[0].length;
  const out = new Array<number>(d).fill(0);
  for (const v of vs) for (let i = 0; i < d; i++) out[i] += v[i];
  for (let i = 0; i < d; i++) out[i] /= vs.length;
  return out;
}

/**
 * Recommended for you: rank the corpus by closeness to your TASTE vector
 * (average of 👍'd papers, nudged away from 👎'd ones). Cold-starts to This Week.
 */
export async function getRecommended(limit = 12): Promise<PaperRow[]> {
  const supabase = getServiceClient();

  const { data: liked } = await supabase
    .from('papers')
    .select('embedding')
    .eq('my_vote', 1)
    .not('embedding', 'is', null);
  const likedVecs = (liked ?? [])
    .map((r) => parseEmbedding((r as { embedding: unknown }).embedding))
    .filter((v): v is number[] => !!v);

  if (likedVecs.length === 0) return getTopScored(limit); // no likes yet

  const taste = averageVectors(likedVecs);

  const { data: disliked } = await supabase
    .from('papers')
    .select('embedding')
    .eq('my_vote', -1)
    .not('embedding', 'is', null);
  const dislikedVecs = (disliked ?? [])
    .map((r) => parseEmbedding((r as { embedding: unknown }).embedding))
    .filter((v): v is number[] => !!v);
  if (dislikedVecs.length > 0) {
    const dv = averageVectors(dislikedVecs);
    for (let i = 0; i < taste.length; i++) taste[i] -= 0.5 * dv[i]; // steer away
  }

  const { data: matches, error } = await supabase.rpc('match_papers', {
    query_embedding: taste,
    match_count: limit + 30,
    field_filter: null,
  });
  if (error) throw new Error(error.message);

  const ids = ((matches ?? []) as { id: string }[]).map((m) => m.id);
  if (ids.length === 0) return [];

  // Only recommend papers you haven't voted on yet.
  const { data: rows, error: e2 } = await supabase
    .from('papers')
    .select(COLS)
    .in('id', ids)
    .is('my_vote', null);
  if (e2) throw new Error(e2.message);

  const byId = new Map(((rows ?? []) as unknown as PaperRow[]).map((r) => [r.id, r]));
  return ids
    .map((id) => byId.get(id))
    .filter((r): r is PaperRow => Boolean(r))
    .slice(0, limit);
}

/** The current watch lens (topic pulled in weekly), or null if none is set. */
export async function getWatch(): Promise<{ query: string } | null> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from('saved_search')
    .select('query')
    .not('query', 'is', null)
    .limit(1)
    .maybeSingle();
  const query = (data as { query?: string } | null)?.query;
  return query ? { query } : null;
}

/** Papers pulled in by the watch lens, ranked (judged/high-score first). 👎'd hidden. */
export async function getWatchedPapers(limit = 20): Promise<PaperRow[]> {
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('papers')
    .select(COLS)
    .eq('source', 'watch')
    .or(NOT_HIDDEN)
    .order('final_score', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PaperRow[];
}
