-- PaperPicks — single-user feedback (run once in Supabase → SQL Editor).
-- my_vote:  1 = 👍 (like → steer recommendations toward similar papers)
--          -1 = 👎 (not for me → hide it + steer away from similar)
--        null = no vote yet
alter table papers add column if not exists my_vote smallint;
create index if not exists papers_my_vote_idx on papers (my_vote);
