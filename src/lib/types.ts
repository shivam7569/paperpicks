/**
 * types.ts — shared TypeScript shapes for the ingest pipeline.
 *
 * WHAT IT IS:   Compile-time-only type definitions (no runtime code) describing
 *               what the Phase 1 ingest steps write into the `papers` table.
 * WHAT IT DOES: Exports PrimaryField ('llm' | 'vision' — Language/NLP folds into
 *               'llm') and the PaperInsert interface, the subset of `papers`
 *               columns set at ingest time (arxiv_id, title, abstract, authors,
 *               urls, categories, primary_field, published_at, hf_upvotes, source,
 *               raw). Scores and embeddings are intentionally absent — later steps
 *               add them.
 * WORK WITH IT: import type { PaperInsert, PrimaryField } from '../src/lib/types'.
 *               Used by the ingest scripts: scripts/ingest.ts (both types),
 *               scripts/ingest-arxiv.ts and scripts/watch.ts (PaperInsert), to type
 *               the rows they upsert into Supabase.
 * BEHAVIORS:    Types only — erased at build, zero runtime effect. Field nullability
 *               mirrors the DB: e.g. abstract/pdf_url/code_url/categories/
 *               primary_field/published_at are nullable; authors, hf_upvotes, source,
 *               raw are required. `raw` is `unknown` (the original API payload).
 * CHANGE IT:    Add a new subfield bucket → extend the PrimaryField union (and the
 *               classifier that assigns it). Ingest a new column → add it to
 *               PaperInsert AND the DB schema AND the scripts that build the rows.
 */

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
