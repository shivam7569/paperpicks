-- ── Watch lens (ingestion criterion) ────────────────────────────────────────
-- saved_search already holds your persistent query text. Store its embedding too
-- so the weekly job can semantically filter arXiv candidates without re-embedding
-- the lens every run. 768 dims = same as papers.embedding (pgvector).
alter table saved_search add column if not exists embedding vector(768);
