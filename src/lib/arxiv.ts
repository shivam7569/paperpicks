/**
 * arxiv.ts — arXiv Atom-feed client + field classifier + watch-lens query builder.
 *
 * WHAT IT IS:   The primary paper-source adapter. Fetches metadata from arXiv,
 *               normalizes it to ArxivPaper, and derives field tags + code links.
 * WHAT IT DOES: Fetchers (all → ArxivPaper[]): fetchRecent (broad recent sweep by
 *               category, grows the corpus), fetchByIds (metadata for specific
 *               ids, enriches existing papers), fetchByQuery (relevance-ranked
 *               results for a raw search_query). Helpers: classifyField(...) →
 *               'vision' | 'llm'; detectCodeUrl(...texts) → first GitHub URL or
 *               null; lensToArxivQuery(text) → an arXiv search_query string.
 * WORK WITH IT: import { fetchRecent, fetchByIds, fetchByQuery, classifyField,
 *               detectCodeUrl, lensToArxivQuery } from './arxiv'. The watch lens
 *               (scripts/watch.ts) pairs lensToArxivQuery + fetchByQuery, then a
 *               semantic embedding filter restores precision.
 * BEHAVIORS:   Parses Atom via fast-xml-parser. fetchRecent defaults to cats
 *               cs.CL/cs.CV/cs.LG/cs.AI, sortBy submittedDate desc, 100 results;
 *               fetchByQuery sortBy relevance (TF-IDF-ish: rare terms win), 80
 *               results. classifyField prefers real categories (cs.CV/eess.IV →
 *               vision, cs.CL → llm) and only then keyword-guesses via
 *               VISION_HINTS. lensToArxivQuery lowercases, strips punctuation and
 *               LENS_STOPWORDS, OR-joins up to 6 unique `all:` terms (falls back
 *               to the whole encoded text if none survive). Any non-OK HTTP
 *               response throws; entries missing id/title are dropped.
 * CHANGE IT:   Corpus breadth → default `categories`/`maxResults` in fetchRecent.
 *               Field routing → the category prefixes or VISION_HINTS list.
 *               Lens recall → LENS_STOPWORDS and the `.slice(0, 6)` term cap.
 *               Code-link matching → GITHUB_RE.
 */
import { XMLParser } from 'fast-xml-parser';
import type { PrimaryField } from './types';

const ARXIV_API = 'http://export.arxiv.org/api/query';
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export interface ArxivPaper {
  arxiv_id: string;
  title: string;
  abstract: string;
  authors: string[];
  url: string;
  pdf_url: string | null;
  categories: string[];
  primary_category: string | null;
  code_url: string | null;
  published_at: string | null;
}

const GITHUB_RE = /https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/;

/** Find a GitHub repo URL mentioned in any of the given texts (abstract/comment). */
export function detectCodeUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t?.match(GITHUB_RE);
    if (m) return m[0].replace(/[.,)\]]+$/, ''); // trim trailing punctuation
  }
  return null;
}

const VISION_HINTS = [
  'image', 'vision', 'video', 'segmentation', 'detection', 'diffusion',
  '3d', 'pixel', 'scene', 'depth', 'render', 'photo', 'visual', 'gaussian',
];

/**
 * Field bucket. Prefers REAL arXiv categories; falls back to a keyword guess
 * only when no decisive category is present.
 * Two buckets: 'vision' (computer vision) vs 'llm' (LLM / language / general AI).
 */
export function classifyField(
  categories: string[] | null,
  title: string,
  abstract: string
): PrimaryField {
  const cats = categories ?? [];
  if (cats.some((c) => c.startsWith('cs.CV') || c.startsWith('eess.IV'))) return 'vision';
  if (cats.some((c) => c.startsWith('cs.CL'))) return 'llm';
  const t = `${title} ${abstract}`.toLowerCase();
  return VISION_HINTS.some((k) => t.includes(k)) ? 'vision' : 'llm';
}

function asArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/** "http://arxiv.org/abs/2607.02513v1" → "2607.02513" */
function normalizeId(rawId: string): string {
  return rawId.replace(/^https?:\/\/arxiv\.org\/abs\//, '').replace(/v\d+$/, '').trim();
}

function mapEntry(entry: any): ArxivPaper | null {
  const rawId: string | undefined = entry?.id;
  const title = String(entry?.title ?? '').replace(/\s+/g, ' ').trim();
  if (!rawId || !title) return null;
  const arxiv_id = normalizeId(rawId);

  const abstract = String(entry?.summary ?? '').replace(/\s+/g, ' ').trim();
  const authors = asArray(entry?.author)
    .map((a: any) => String(a?.name ?? '').trim())
    .filter(Boolean);
  const categories = asArray(entry?.category)
    .map((c: any) => c?.['@_term'])
    .filter((t: unknown): t is string => typeof t === 'string');
  const primary_category = entry?.['arxiv:primary_category']?.['@_term'] ?? categories[0] ?? null;

  const pdf = asArray(entry?.link).find((l: any) => l?.['@_title'] === 'pdf');
  const pdf_url = pdf?.['@_href'] ?? `https://arxiv.org/pdf/${arxiv_id}`;

  return {
    arxiv_id,
    title,
    abstract,
    authors,
    url: `https://arxiv.org/abs/${arxiv_id}`,
    pdf_url,
    categories,
    primary_category,
    code_url: detectCodeUrl(abstract, entry?.['arxiv:comment']),
    published_at: entry?.published ?? entry?.updated ?? null,
  };
}

function parseFeed(xml: string): ArxivPaper[] {
  const doc = parser.parse(xml);
  return asArray(doc?.feed?.entry)
    .map(mapEntry)
    .filter((p): p is ArxivPaper => p !== null);
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { accept: 'application/atom+xml' } });
  if (!res.ok) throw new Error(`arXiv fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

/** Recent papers across the given categories (default: our four AI categories). */
export async function fetchRecent(
  opts: { categories?: string[]; maxResults?: number; start?: number } = {}
): Promise<ArxivPaper[]> {
  const categories = opts.categories ?? ['cs.CL', 'cs.CV', 'cs.LG', 'cs.AI'];
  const query = categories.map((c) => `cat:${c}`).join('+OR+');
  const url =
    `${ARXIV_API}?search_query=${query}&start=${opts.start ?? 0}` +
    `&max_results=${opts.maxResults ?? 100}&sortBy=submittedDate&sortOrder=descending`;
  return parseFeed(await fetchXml(url));
}

/** Metadata for specific arXiv IDs (used to enrich papers we already have). */
export async function fetchByIds(ids: string[]): Promise<ArxivPaper[]> {
  if (ids.length === 0) return [];
  const url = `${ARXIV_API}?id_list=${ids.join(',')}&max_results=${ids.length}`;
  return parseFeed(await fetchXml(url));
}

// Filler words that add no topical signal to an arXiv keyword search.
const LENS_STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'in', 'on', 'and', 'or', 'to', 'with', 'via',
  'using', 'about', 'that', 'this', 'related', 'recent', 'papers', 'paper',
  'domain', 'field', 'area', 'work', 'works',
]);

/**
 * Turn a free-text watch lens into an arXiv `search_query`. We OR the meaningful
 * terms across ALL fields (`all:`) so recall is wide — reaching categories the
 * default AI sweep never touches (e.g. q-fin). Precision is restored afterward by
 * the semantic (embedding) filter in scripts/watch.ts.
 */
export function lensToArxivQuery(text: string): string {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !LENS_STOPWORDS.has(w));
  const uniq = [...new Set(terms)].slice(0, 6);
  if (uniq.length === 0) return `all:${encodeURIComponent(text.trim())}`;
  return uniq.map((t) => `all:${t}`).join('+OR+');
}

/**
 * Papers matching a raw arXiv `search_query`, RELEVANCE-ranked (used by the watch
 * lens). Relevance (TF-IDF-ish) weights rare, discriminative terms like "fintech"
 * far above common ones like "model", so niche topics actually surface.
 */
export async function fetchByQuery(searchQuery: string, maxResults = 80): Promise<ArxivPaper[]> {
  const url =
    `${ARXIV_API}?search_query=${searchQuery}&start=0` +
    `&max_results=${maxResults}&sortBy=relevance`;
  return parseFeed(await fetchXml(url));
}
