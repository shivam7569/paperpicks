/** Our two subfield buckets (Language/NLP is folded into 'llm'). */
export type PrimaryField = 'llm' | 'vision';

/**
 * The columns we WRITE during Phase 1 ingest. It's a subset of the full
 * `papers` table — scores and embeddings are added by later steps, so they
 * aren't set here.
 */
export interface PaperInsert {
  arxiv_id: string;
  title: string;
  abstract: string | null;
  authors: string[];
  url: string;
  pdf_url: string | null;
  code_url: string | null;
  categories: string[] | null;
  primary_field: PrimaryField | null;
  published_at: string | null;
  hf_upvotes: number;
  source: string;
  raw: unknown;
}
