/**
 * Gemini embeddings client (raw REST — no SDK, so the request/response stays
 * visible and we're insulated from SDK churn).
 *
 * Anthropic has no embeddings API, so semantic-search vectors come from Gemini.
 * The model id and dimensions are declared once in models.ts.
 */
import { MODELS } from './models';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('Missing GEMINI_API_KEY in .env.local');
  return k;
}

/** POST with retry + backoff on rate-limit (429) and transient 5xx errors. */
async function postWithRetry(url: string, body: unknown, tries = 5): Promise<any> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() },
      body: JSON.stringify(body),
    });

    if (res.ok) return res.json();

    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = retryAfter ? retryAfter * 1000 : Math.min(30000, 2 ** attempt * 1000);
      console.log(
        `   ⏳ ${res.status} from Gemini — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${tries})`
      );
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
  throw new Error('Gemini: exhausted retries');
}

/**
 * Task type tells Gemini how the text will be used, which sharpens retrieval:
 *  - RETRIEVAL_DOCUMENT for the papers we store
 *  - RETRIEVAL_QUERY   for a user's search query
 */
export type EmbedTask = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Embed one text into a vector (length = MODELS.embedding.dims, i.e. 768). */
export async function embedText(
  text: string,
  task: EmbedTask = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const url = `${API_BASE}/models/${MODELS.embedding.id}:embedContent`;
  const body = {
    model: `models/${MODELS.embedding.id}`,
    content: { parts: [{ text }] },
    taskType: task,
    outputDimensionality: MODELS.embedding.dims,
  };

  const data = await postWithRetry(url, body);
  const values = data?.embedding?.values;
  if (!Array.isArray(values)) throw new Error('Gemini embed returned no vector');
  return values as number[];
}

export function embeddingModelName(): string {
  return MODELS.embedding.id;
}
