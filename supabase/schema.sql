-- ============================================================================
--  PaperPicks — database schema
--  Paste this whole file into: Supabase → SQL Editor → New query → Run
--  Safe to re-run: every statement uses "if not exists" / "or replace".
-- ============================================================================

-- ── Extensions ──────────────────────────────────────────────────────────────
-- pgvector: lets us store an "embedding" (a numeric fingerprint of meaning) per
-- paper and search by similarity. This powers the semantic Search/Watch page.
create extension if not exists vector;
-- pgcrypto: provides gen_random_uuid() for default primary keys.
create extension if not exists pgcrypto;


-- ── papers ──────────────────────────────────────────────────────────────────
-- The corpus / "library". We ingest BROAD into here; only a few get shortlisted.
create table if not exists papers (
  id                    uuid primary key default gen_random_uuid(),

  -- Identity & metadata
  arxiv_id              text unique not null,     -- e.g. "2401.12345" — dedupe key
  title                 text not null,
  abstract              text,
  authors               text[] default '{}',
  url                   text,                     -- arXiv abstract page
  pdf_url               text,
  code_url              text,                     -- GitHub / Papers-with-Code (replicability)
  categories            text[],                   -- arXiv categories: cs.CL, cs.CV, ...
  primary_field         text,                     -- our bucket: 'llm' | 'vision'
  published_at          timestamptz,              -- when the paper came out
  first_seen_at         timestamptz default now(),-- when WE first ingested it

  -- Raw signals (gathered during enrichment)
  hf_upvotes            int  default 0,
  github_stars          int  default 0,
  citation_count        int  default 0,
  influential_citations int  default 0,

  -- Scores (computed by the judge/scoring step)
  importance_score      real,
  replicability_score   real,
  final_score           real,
  importance_reason     text,                     -- one-line "why it matters" from the LLM
  replicability_badge   text,                     -- 'code+data' | 'code' | 'no code'

  -- Semantic search
  embedding             vector(768),              -- Gemini text-embedding-004 = 768 dims

  -- Bookkeeping
  source                text,                     -- 'hf_daily' | 'arxiv' | ...
  raw                   jsonb,                    -- original payload, for reprocessing/debug
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Indexes for the queries we'll actually run:
create index if not exists papers_primary_field_idx on papers (primary_field);
create index if not exists papers_final_score_idx   on papers (final_score desc nulls last);
create index if not exists papers_published_at_idx  on papers (published_at desc nulls last);
-- HNSW index = fast approximate nearest-neighbour search over embeddings (cosine).
create index if not exists papers_embedding_idx
  on papers using hnsw (embedding vector_cosine_ops);


-- ── shortlists / shortlist_items ────────────────────────────────────────────
-- One shortlist per week; items are the ranked papers in that week's "This Week".
create table if not exists shortlists (
  id          uuid primary key default gen_random_uuid(),
  week_of     date unique not null,               -- Monday of that week
  created_at  timestamptz default now()
);

create table if not exists shortlist_items (
  id            uuid primary key default gen_random_uuid(),
  shortlist_id  uuid not null references shortlists(id) on delete cascade,
  paper_id      uuid not null references papers(id)     on delete cascade,
  rank          int,
  bucket        text,                              -- 'proven' | 'fresh'
  reason        text,
  unique (shortlist_id, paper_id)
);


-- ── picks ───────────────────────────────────────────────────────────────────
-- Which papers YOU chose to read, and their status.
create table if not exists picks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  paper_id   uuid not null references papers(id)     on delete cascade,
  status     text not null default 'reading',       -- 'reading' | 'read' | 'archived'
  picked_at  timestamptz default now(),
  unique (user_id, paper_id)
);


-- ── feedback ────────────────────────────────────────────────────────────────
-- 👍 / 👎 per paper — seeds future "Recommended for you" personalization.
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  paper_id   uuid not null references papers(id)     on delete cascade,
  vote       smallint not null check (vote in (-1, 1)),
  created_at timestamptz default now(),
  unique (user_id, paper_id)
);


-- ── saved_search ────────────────────────────────────────────────────────────
-- Your persistent Search/Watch query (persists until you change or reset it).
create table if not exists saved_search (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  query      text,
  updated_at timestamptz default now(),
  unique (user_id)                                 -- one active watch per user (v1)
);


-- ── keep updated_at fresh on papers ─────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists papers_set_updated_at on papers;
create trigger papers_set_updated_at
  before update on papers
  for each row execute function set_updated_at();


-- ── semantic search function (used later, by the Search page) ────────────────
-- Given a query embedding, return the most similar papers (optionally within a
-- single field bucket). Called from the backend via supabase.rpc('match_papers').
create or replace function match_papers(
  query_embedding vector(768),
  match_count     int  default 12,
  field_filter    text default null
)
returns table (
  id            uuid,
  arxiv_id      text,
  title         text,
  primary_field text,
  similarity    float
)
language sql stable as $$
  select
    p.id, p.arxiv_id, p.title, p.primary_field,
    1 - (p.embedding <=> query_embedding) as similarity   -- <=> is cosine distance
  from papers p
  where p.embedding is not null
    and (field_filter is null or p.primary_field = field_filter)
  order by p.embedding <=> query_embedding
  limit match_count;
$$;


-- ── Row Level Security (RLS) ────────────────────────────────────────────────
-- With RLS ON, the public "anon" key can only do what a policy allows. The
-- server-side service_role key (used by the ingest job) bypasses RLS entirely.

-- Papers & shortlists: any logged-in user may READ. Writes happen only via the
-- service_role key in our backend, so no write policy is needed.
alter table papers          enable row level security;
alter table shortlists      enable row level security;
alter table shortlist_items enable row level security;

drop policy if exists "read papers"          on papers;
drop policy if exists "read shortlists"      on shortlists;
drop policy if exists "read shortlist_items" on shortlist_items;

create policy "read papers"          on papers          for select to authenticated using (true);
create policy "read shortlists"      on shortlists      for select to authenticated using (true);
create policy "read shortlist_items" on shortlist_items for select to authenticated using (true);

-- Personal tables: each user may only see & change their OWN rows.
alter table picks        enable row level security;
alter table feedback     enable row level security;
alter table saved_search enable row level security;

drop policy if exists "own picks"        on picks;
drop policy if exists "own feedback"     on feedback;
drop policy if exists "own saved_search" on saved_search;

create policy "own picks"        on picks        for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own feedback"     on feedback     for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own saved_search" on saved_search for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Done. You should see the tables under Supabase → Table Editor.
