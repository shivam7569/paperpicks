/**
 * Semantic Scholar client — fetches citation counts (the key time-varying signal
 * behind "living scores": a paper that gets cited more should rank higher over
 * time). Uses the batch endpoint (up to 500 ids per request) to stay well under
 * the rate limit. An API key (SEMANTIC_SCHOLAR_API_KEY) is optional.
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
    throw new Error(`Semantic Scholar ${res.status}: ${text.slice(0, 200)}`);
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
