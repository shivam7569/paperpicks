/**
 * PaperPicks — model registry.
 * The single source of truth for every model the app calls. Change a model
 * here and every script/route picks it up.
 *
 * Two roles:
 *  - judge     → reads abstracts, scores importance/replicability (Anthropic Claude)
 *  - embedding → turns text into a vector for semantic search (Google Gemini)
 *
 * Why two providers: Anthropic has no embeddings API, so embeddings stay on Gemini.
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
