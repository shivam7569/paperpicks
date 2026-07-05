# 📚 PaperPicks

**A personal, self-updating radar for AI research.** Every week it surfaces a small, ranked set of the most important new papers in your field (LLM / NLP + Computer Vision) — important, not random — so you stay ahead without drowning in arXiv.

> Live: **https://paperpicks-seven.vercel.app** · Repo: **github.com/shivam7569/paperpicks**

---

## Aim & goal

This is a real dependency, not a demo. The goal is **reliable, high-quality curation that surfaces what is _becoming_ important** — so a few minutes a week keeps you current and ahead in LLM/NLP + CV research.

Three filters define a "good" pick:
1. **In-field** — LLM / Language / Computer Vision.
2. **Important** — a substantial contribution, judged on the merits (not hype, not random).
3. **Replicable** — code/data available and method clear. This is a _soft preference_, a boost — never a hard gate (you handle compute yourself, per paper).

The design principle throughout: **ingest broad, curate narrow, and let signals of real-world traction (citations, stars, upvotes) reshape the ranking over time.**

---

## What it does (features)

| View / feature | What it is |
|---|---|
| **This Week** | The top-ranked judged papers — your curated shortlist. |
| **Search** | Semantic search over the whole corpus (by _meaning_, not keywords), tilted toward fresher & higher-scored results. |
| **For You** | Recommendations from your **taste vector** — the average of papers you 👍'd, steered away from 👎'd ones. |
| **Watch lens** | A standing "ingestion criterion": a topic the weekly job keeps pulling _new_ matching papers on from arXiv, until you change or reset it. Reaches beyond the default AI categories (e.g. finance). |
| **Living scores** | Rankings evolve weekly as citations & GitHub stars accrue — **no re-judging by the LLM**, so it's cheap. |
| **Owner curation** | 👍 / 👎 feedback (which reshapes search + recs) is **owner-only**, behind a magic-link login. The public site is read-only. |

---

## How it works (architecture)

Two moving parts, deliberately separated:

```
                    ┌──────────────────────── weekly (GitHub Actions cron) ───────────────────────┐
   HF Daily Papers ─┤                                                                              │
   arXiv (cs.*)  ───┤  ingest → ingest:arxiv → watch → enrich → embed → citations → stars → score → rescore
   Watch lens    ───┘        │                                                              │        │
                             └──────────────► Supabase (Postgres + pgvector) ◄─────────────┴────────┘
                                                        ▲
                                                        │  reads (server components) + owner writes
                                              Next.js app on Vercel  ── This Week · For You · Search · Watch
```

- **The website (Vercel)** only reads from the database and renders the UI. It never calls the LLM. It stays cheap and fast.
- **The weekly pipeline (GitHub Actions cron)** does all the heavy lifting — fetching, embedding, judging, blending — and writes results to Supabase. It runs **Sundays 06:00 IST** (`30 0 * * 0` UTC) and on-demand via the "Run workflow" button.

Why this split? The LLM scoring is slow and would blow a serverless timeout; the cron has no such limit, and a weekly write also keeps the free-tier Supabase project from auto-pausing.

### The ingestion logic

Two funnels feed one library:

1. **Hugging Face Daily Papers** (`ingest.ts`) — the community-curated shortlist. These carry **upvotes** and are the only papers the LLM **judges** (`source='hf_daily'`).
2. **arXiv broad sweep** (`ingest-arxiv.ts`) — the ~200 most recent `cs.CL / cs.CV / cs.LG / cs.AI` papers, with real categories and code links. Unjudged; they exist so **search** has a big corpus to match against (`source='arxiv'`).
3. **Watch lens** (`watch.ts`) — your saved topic. Turns the lens into a **relevance-ranked** arXiv keyword search (reaches _any_ category), then keeps the papers whose embedding is closest to the lens. These enter as `source='watch'` and **are judged & ranked** like HF candidates.

`enrich.ts` then backfills real categories + code links onto HF papers; `embed.ts` adds a semantic vector to every paper; `citations.ts` / `stars.ts` refresh the live traction signals; `score.ts` judges new candidates; `rescore.ts` re-blends every paper's final score.

### The scoring model (`src/lib/scoring.ts`)

The LLM judges each candidate once, producing **raw, stable** `importance` and `replicability` (0–100). Those are stored untouched. The **final score is derived** (and re-derived weekly) by blending them with live signals:

```
importance = 0.60·rawImportance
           + 0.15·upvoteScore      (HF upvotes, normalized to the corpus max)
           + 0.15·citationScore    (log2 scale — Semantic Scholar)
           + 0.10·starScore        (log2 scale — GitHub)

final      = importance + 0.30·rawReplicability     (soft boost)
```

Because the final score is a cheap re-blend of stored numbers, papers that are _becoming_ important (cited/starred more) climb over time **without any new LLM calls** — that's the "living scores" idea.

---

## Tech stack

- **Framework:** Next.js 16 (App Router, Turbopack, `src/`), React 19, TypeScript, Tailwind v4.
- **Data:** Supabase — Postgres + **pgvector** (semantic search) + **Auth** (magic link) + RLS.
- **Judge model:** Anthropic **Claude Sonnet 5** (`claude-sonnet-5`) via `@anthropic-ai/sdk` with structured outputs.
- **Embeddings:** Google **`gemini-embedding-2`** truncated to **768 dims** (Matryoshka; matches the `vector(768)` column and stays under pgvector's HNSW limit).
- **Signals:** Hugging Face Daily Papers, arXiv API, Semantic Scholar (citations), GitHub (stars).
- **Automation:** GitHub Actions cron. **Hosting:** Vercel.

All model IDs live in one place — [`src/lib/models.ts`](src/lib/models.ts).

---

## Project structure

```
paperpicks/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx            # shell + nav (Sign in / Sign out)
│  │  ├─ page.tsx              # "This Week"
│  │  ├─ for-you/page.tsx      # taste-vector recommendations
│  │  ├─ search/page.tsx       # semantic search + watch-lens UI + empty-state watch feed
│  │  ├─ login/page.tsx        # magic-link login (owner)
│  │  ├─ auth/callback/route.ts# magic-link landing → session
│  │  ├─ auth/signout/route.ts # clears session
│  │  └─ actions.ts            # server actions: setVote, setWatch, clearWatch (owner-gated)
│  ├─ components/
│  │  ├─ PaperCard.tsx         # one ranked paper card
│  │  ├─ VoteButtons.tsx       # 👍 / 👎 (owner only)
│  │  └─ WatchControls.tsx     # "Watch this topic" / Reset (owner only)
│  ├─ lib/
│  │  ├─ models.ts             # ⭐ single model registry (judge + embedding)
│  │  ├─ scoring.ts            # ⭐ the ranking blend (tune weights here)
│  │  ├─ papers.ts             # server-side reads (This Week / Search / For You / Watch)
│  │  ├─ anthropic.ts          # Claude judge (importance/replicability/reason/badge)
│  │  ├─ gemini.ts             # embeddings client
│  │  ├─ arxiv.ts              # arXiv fetch/parse/classify + lens→query + code detection
│  │  ├─ semanticscholar.ts    # batch citation fetch
│  │  ├─ github.ts             # repo star fetch
│  │  ├─ supabase.ts           # service-role client (server, bypasses RLS)
│  │  ├─ supabase-server.ts    # cookie-aware client + isOwner()
│  │  ├─ supabase-browser.ts   # browser client (login)
│  │  └─ types.ts              # shared types
│  └─ proxy.ts                 # Next 16 "proxy" (formerly middleware) — refreshes auth session
├─ scripts/                    # the weekly pipeline (run via npm, tsx)
│  ├─ clean.ts  ingest.ts  ingest-arxiv.ts  watch.ts  enrich.ts
│  ├─ embed.ts  citations.ts  stars.ts  score.ts  rescore.ts  top.ts
├─ supabase/
│  ├─ schema.sql               # full schema (papers, saved_search, RLS, match_papers RPC)
│  └─ migrations/
│     ├─ 001_feedback.sql      # papers.my_vote
│     └─ 002_watch.sql         # saved_search.embedding
├─ .github/workflows/weekly.yml# the cron pipeline
└─ .env.example                # env template
```

⭐ = the two files you'll most likely want to edit to tune behavior.

---

## Data model (key tables)

- **`papers`** — one row per paper: `arxiv_id`, `title`, `abstract`, `authors`, `categories`, `primary_field` (`llm`|`vision`), `url`/`pdf_url`/`code_url`, `hf_upvotes`, `citation_count`, `github_stars`, `source` (`hf_daily`|`arxiv`|`watch`), `embedding vector(768)`, the scores (`importance_score`, `replicability_score`, `final_score`, `importance_reason`, `replicability_badge`), and `my_vote` (`1`|`-1`|`null`).
- **`saved_search`** — your watch lens: `query` + its `embedding`, one per user.
- **`match_papers`** RPC — pgvector cosine similarity search used by Search & For You.

---

## Getting started (local)

**Prerequisites:** Node 20+, a Supabase project, an Anthropic API key (prepaid — no free tier), a Gemini API key.

```bash
git clone https://github.com/shivam7569/paperpicks
cd paperpicks
npm install
cp .env.example .env.local     # then fill in the values (see table below)
```

**Set up the database** — in Supabase → SQL Editor, run in order:
1. `supabase/schema.sql`
2. `supabase/migrations/001_feedback.sql`
3. `supabase/migrations/002_watch.sql`

**Populate it & run:**
```bash
npm run ingest && npm run ingest:arxiv -- --max 200 \
  && npm run enrich && npm run embed && npm run citations \
  && npm run stars && npm run score && npm run rescore
npm run dev          # → http://localhost:3000
```

To wipe and rebuild from scratch: `npm run clean -- --yes` then the pipeline above.

---

## Environment variables — and where each one lives

The single most important operational concept: **the website and the weekly job are different runtimes with different secrets.**

| Variable | Vercel (website) | GitHub Actions (weekly job) | Purpose |
|---|:--:|:--:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | — | Login (browser + session) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | Server reads/writes (bypasses RLS) 🔴 secret |
| `GEMINI_API_KEY` | ✅ | ✅ | Search + embedding a saved lens 🔴 secret |
| `ALLOWED_EMAIL` | ✅ | — | Only this email may curate |
| `ANTHROPIC_API_KEY` | — | ✅ | Judging (offline only) 🔴 secret |
| `GITHUB_TOKEN` | — | auto | Star fetch (Actions provides it automatically) |
| `WATCH_MAX` / `WATCH_MIN_SIM` / `WATCH_POOL` | — | optional | Watch-lens tuning (defaults 15 / 0.5 / 80) |
| `SCORE_DELAY_MS` / `SEMANTIC_SCHOLAR_API_KEY` | — | optional | Judge pacing / citation rate limit |

**Rule of thumb:** if the _website_ needs it (render a page, log in, save a lens) → **Vercel**. If only the _weekly pipeline_ needs it (fetch, judge, tune ingestion) → **GitHub Actions**. Locally, `.env.local` holds everything.

---

## The weekly pipeline (npm scripts)

Run in this order (this is exactly what `weekly.yml` does):

| Script | Does |
|---|---|
| `npm run ingest` | Pull Hugging Face Daily Papers (candidates, with upvotes). |
| `npm run ingest:arxiv -- --max 200` | Broaden the search corpus from arXiv. |
| `npm run watch` | Pull new papers matching your saved watch lens. |
| `npm run enrich` | Backfill real categories + code links. |
| `npm run embed` | Add a semantic vector to every paper. |
| `npm run citations` | Refresh citation counts (Semantic Scholar). |
| `npm run stars` | Refresh GitHub stars for papers with code. |
| `npm run score` | Judge new candidates with Claude. |
| `npm run rescore` | Re-blend every paper's final score with fresh signals. |

Utilities: `npm run clean -- --yes` (wipe all papers), `npm run top -- --limit 10` (inspect the ranking), `npm run typecheck`.

Most scripts accept `--dry-run` (fetch/parse only, no writes). `watch` also accepts `--query "..."` to test any topic without saving a lens:
```bash
npm run watch -- --query "diffusion models for medical imaging" --dry-run
```

---

## Using the app

- **Browse** This Week / For You / Search — open to anyone.
- **Sign in** (magic link, top-right) to curate — owner only.
- **👍 / 👎** a paper: 👎 hides it and steers recommendations away; 👍 pulls For You toward it.
- **Search** a topic in natural language (it's semantic — phrasing doesn't need to be keywords).
- **Watch a topic:** search it, then click **🔭 Watch this topic**. The weekly job then keeps pulling & ranking new papers on it. An empty search box shows your ranked watch feed. **Reset** to stop.

---

## How to modify / extend

Almost every knob is in one obvious place:

- **Change the judge model** (e.g. to Opus for higher quality, or Haiku for lower cost) → `src/lib/models.ts` (or set `ANTHROPIC_MODEL`). Same file for the embedding model/dims.
- **Tune the ranking** (weights on judge vs upvotes vs citations vs stars, the replicability boost, the log curves) → `src/lib/scoring.ts`. Re-run `npm run rescore` to apply without re-judging.
- **Widen ingestion scope** (e.g. add `q-fin.*` finance categories, or econ) → the category list in `src/lib/arxiv.ts` (`fetchRecent`). This is the single line that keeps the corpus AI-only.
- **Tune the watch lens** → env `WATCH_MAX` (papers/week), `WATCH_MIN_SIM` (similarity floor), `WATCH_POOL` (candidates considered); the query-building logic is `lensToArxivQuery` in `arxiv.ts`.
- **Tune search re-ranking** (similarity vs freshness vs importance) → `searchPapers` in `src/lib/papers.ts`.
- **Change the schedule** → the `cron` in `.github/workflows/weekly.yml`.
- **Add a new signal/source** → a `src/lib/<source>.ts` client + a `scripts/<source>.ts` step + wire it into `scoring.ts` and `weekly.yml`.

---

## Deployment

1. **Vercel** — import the repo, add the Vercel env vars from the table above, deploy. It auto-redeploys on every push to `main`. (Data changes need no redeploy — pages read live.)
2. **GitHub Actions** — add the weekly-job secrets (Settings → Secrets and variables → Actions). `GITHUB_TOKEN` is automatic. The workflow runs on schedule + a manual "Run workflow" button.
3. **Supabase Auth** (for login) — Authentication → URL Configuration: set **Site URL** to your Vercel URL and add **Redirect URLs** for both `https://<your-app>.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`.

> **Note on Next.js 16:** middleware was renamed to **proxy** — the session refresher lives in `src/proxy.ts` (a `middleware.ts` would silently not run).

---

## Cost

- **Claude Sonnet 5 judge:** ≈ **$1.70 / month** at ~100 papers/week (prepaid Anthropic credits). Living-score re-blends are free (no LLM). Opus would be higher; Haiku lower.
- **Gemini embeddings, Supabase, Vercel, GitHub Actions:** free tiers are ample for a personal, weekly-cadence tool.

---

## License

Personal project — use it as a reference. No warranty.
