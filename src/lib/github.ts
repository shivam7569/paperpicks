/**
 * github.ts — tiny GitHub REST client for repo star counts.
 *
 * WHAT IT IS:   Helper behind the "stars" adoption signal — a repo's star count
 *               is used as a proxy for how much a paper's code is adopted.
 * WHAT IT DOES: parseRepo(codeUrl) → { owner, repo } | null (pulls the slug out
 *               of a GitHub URL, trimming any `.git`); fetchStars(owner, repo) →
 *               star count, or null when the repo is missing/404.
 * WORK WITH IT: import { parseRepo, fetchStars } from './github'; the star-
 *               fetching script parses each paper's code_url then queries stars.
 * BEHAVIORS:    Reads optional GITHUB_TOKEN (raises rate limit 60→5000/hr; the
 *               weekly GitHub Action passes its built-in token automatically).
 *               404 → null; any other non-OK status throws; a missing
 *               stargazers_count field → null. Sends a 'paperpicks' user-agent.
 * CHANGE IT:    Need more repo fields → extend fetchStars (read from the JSON).
 *               URL shapes accepted → REPO_RE. The star→score curve is in
 *               scoring.ts, not here.
 */
const REPO_RE = /github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/;

export function parseRepo(codeUrl: string | null): { owner: string; repo: string } | null {
  if (!codeUrl) return null;
  const m = codeUrl.match(REPO_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

/** Star count for owner/repo, or null if the repo is gone / not found. */
export async function fetchStars(owner: string, repo: string): Promise<number | null> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'paperpicks',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} ${res.statusText}`);

  const data = (await res.json()) as { stargazers_count?: number };
  return typeof data.stargazers_count === 'number' ? data.stargazers_count : null;
}
