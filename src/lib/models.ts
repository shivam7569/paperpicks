/**
 * models.ts — central model registry for PaperPicks.
 *
 * WHAT IT IS:   The single source of truth for every AI model the app calls,
 *               spanning two providers (Anthropic for judging, Google Gemini
 *               for embeddings — Anthropic has no embeddings API).
 * WHAT IT DOES: Exports one frozen const, MODELS: `judge` (the Claude model id
 *               that scores paper importance/replicability) and `embedding`
 *               ({ id, dims }) for semantic-search vectors.
 * WORK WITH IT: import { MODELS } from './models'. Consumed by lib/anthropic.ts
 *               (MODELS.judge) and lib/gemini.ts (MODELS.embedding.id / .dims).
 *               `as const`, so ids are literal types — do not mutate at runtime.
 * BEHAVIORS:    Env overrides (read at module load): ANTHROPIC_MODEL → judge
 *               (default 'claude-sonnet-5'); GEMINI_EMBEDDING_MODEL → embedding.id
 *               (default 'gemini-embedding-2'). dims is hard-coded 768 (via
 *               Gemini Matryoshka truncation) to match the vector(768) pgvector
 *               column and stay under pgvector's 2000-dim HNSW index limit.
 * CHANGE IT:    Swap the judge model → set ANTHROPIC_MODEL or edit the default on
 *               the `judge` line. Change embedding size → edit `dims` AND the DB
 *               vector(N) column + reindex, or 768 vs stored vectors won't match.
 */
export const MODELS = {
  /** Claude model that judges papers. Override with ANTHROPIC_MODEL in .env.local. */
  judge: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',

  embedding: {
    /** Gemini embedding model. Override with GEMINI_EMBEDDING_MODEL. */
    id: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
    /**
     * Output dimensions. gemini-embedding-2 defaults to 3072 but supports
     * Matryoshka truncation, so we request 768 to:
     *   (a) match the vector(768) pgvector column, and
     *   (b) stay under pgvector's 2000-dim HNSW index limit (3072 can't be indexed).
     */
    dims: 768,
  },
} as const;
