/**
 * semanticscholar.ts — Semantic Scholar batch citation client.
 *
 * WHAT IT IS:   The citation-signal source. Citation counts are the key
 *               time-varying input to "living scores" — a paper cited more
 *               should rank higher over time.
 * WHAT IT DOES: fetchCitations(arxivIds) → Map<arxiv_id, { citation_count,
 *               influential_citations }>. Calls the batch endpoint asking only
 *               for citationCount + influentialCitationCount.
 * WORK WITH IT: import { fetchCitations } from './semanticscholar'; the scoring/
 *               refresh job passes a batch of arXiv ids and merges the counts.
 * BEHAVIORS:    Reads optional SEMANTIC_SCHOLAR_API_KEY and sends it as the
 *               x-api-key header (best-effort — works keyless, just rate-limited).
 *               Ids are sent as `arXiv:<id>`; up to ~500 per request. Retries
 *               429/5xx up to 5x with exponential backoff (capped 30s).
 *               Papers S2 hasn't indexed come back null and are simply omitted;
 *               missing counts default to 0. 401/403 throws with a hint that the
 *               key is invalid/inactive or has stray whitespace.
 * CHANGE IT:    Extra fields → the `fields=` query param in fetchCitations (and
 *               widen the Citations interface). Retry count → the `tries` arg.
 *               Batches over ~500 ids must be chunked by the caller.
 */
const BATCH_URL = 'https://api.semanticscholar.org/graph/v1/paper/batch';

export interface Citations {
  citation_count: number;
  influential_citations: number;
}

async function postWithRetry(url: string, body: unknown, tries = 5): Promise<unknown> {
  const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    // Semantic Scholar's shared pool 429s readily — back off and retry.
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const waitMs = Math.min(30000, 2 ** attempt * 1000);
      console.log(
        `   ⏳ Semantic Scholar ${res.status} — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${tries})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const text = await res.text();
    // 401/403 = the API key was rejected (invalid, not yet activated, or a stray
    // space/quote/newline in the SEMANTIC_SCHOLAR_API_KEY secret), not a rate limit.
    const hint =
      res.status === 401 || res.status === 403
        ? ' — check SEMANTIC_SCHOLAR_API_KEY is valid & activated (no stray spaces/quotes/newline in the secret)'
        : '';
    throw new Error(`Semantic Scholar ${res.status}: ${text.slice(0, 200)}${hint}`);
  }
  throw new Error('Semantic Scholar: exhausted retries');
}

/**
 * Citation counts for a batch of arXiv ids (max ~500). Returns a map keyed by
 * arxiv_id — papers Semantic Scholar hasn't indexed yet are simply omitted.
 */
export async function fetchCitations(
  arxivIds: string[]
): Promise<Map<string, Citations>> {
  const out = new Map<string, Citations>();
  if (arxivIds.length === 0) return out;

  const url = `${BATCH_URL}?fields=citationCount,influentialCitationCount`;
  const data = (await postWithRetry(url, {
    ids: arxivIds.map((id) => `arXiv:${id}`),
  })) as Array<null | { citationCount?: number; influentialCitationCount?: number }>;

  data.forEach((row, i) => {
    if (row) {
      out.set(arxivIds[i], {
        citation_count: row.citationCount ?? 0,
        influential_citations: row.influentialCitationCount ?? 0,
      });
    }
  });
  return out;
}
