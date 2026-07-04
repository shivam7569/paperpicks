/**
 * Tiny GitHub client — reads a repo's star count (a proxy for code adoption).
 * A token (GITHUB_TOKEN) is optional but raises the rate limit from 60 to
 * 5000 req/hour; the weekly Action passes its built-in token automatically.
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
