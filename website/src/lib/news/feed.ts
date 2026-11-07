import handWritten from "./items.json";

/**
 * Builds https://poracode.com/news.json for the app's new-thread news line:
 * the hand-written items in `items.json` plus items derived from public GitHub
 * data. The app validates every item (`src/shared/newsFeed.ts`); a root test
 * runs this builder's output through that validator, so keep the two in step.
 *
 * Authoring rules live in the `news-line` skill. In short: plain text under
 * 140 characters with an `en` entry, HTTPS links to poracode.com, x.com, or
 * github.com/Porabuild only, stable lowercase ids, and an `end` date for
 * anything time-bound.
 */
export const NEWS_FEED_VERSION = 1;
export const REPO = "Porabuild/Poracode";
export const REPO_URL = `https://github.com/${REPO}`;

/** Star counts worth celebrating. An item shows until stars pass the milestone by 15%. */
export const STAR_MILESTONES = [
  100, 250, 500, 1_000, 1_500, 2_000, 3_000, 5_000, 7_500, 10_000, 15_000, 20_000, 30_000, 50_000,
  100_000,
];
const MILESTONE_WINDOW = 1.15;

export interface GitHubSnapshot {
  stars: number | null;
  goodFirstIssues: number | null;
}

export interface NewsFeedDocument {
  version: number;
  generatedAt: string;
  paused: boolean;
  items: unknown[];
}

export function starMilestoneItem(stars: number | null): Record<string, unknown> | null {
  if (stars === null) return null;
  const milestone = STAR_MILESTONES.filter((value) => value <= stars).at(-1);
  if (!milestone || stars >= milestone * MILESTONE_WINDOW) return null;
  return {
    id: `github-stars-${milestone}`,
    kind: "community",
    template: { name: "github-stars-milestone", count: milestone },
    action: { type: "url", url: REPO_URL },
    weight: 2,
  };
}

export function goodFirstIssuesItem(
  count: number | null,
  now: Date,
): Record<string, unknown> | null {
  if (!count || count < 1) return null;
  // A new id each month, so someone who closed it hears about new issues later.
  const month = now.toISOString().slice(0, 7);
  return {
    id: `good-first-issues-${month}`,
    kind: "community",
    template: { name: "good-first-issues", count },
    action: {
      type: "url",
      url: `${REPO_URL}/issues?q=is%3Aissue%20is%3Aopen%20label%3A%22good%20first%20issue%22`,
    },
    weight: 1,
  };
}

export function buildNewsFeed(github: GitHubSnapshot, now: Date): NewsFeedDocument {
  const manual = handWritten as { paused?: boolean; items?: unknown[] };
  const derived = [
    starMilestoneItem(github.stars),
    goodFirstIssuesItem(github.goodFirstIssues, now),
  ].filter((item): item is Record<string, unknown> => item !== null);
  return {
    version: NEWS_FEED_VERSION,
    generatedAt: now.toISOString(),
    paused: manual.paused === true,
    items: [...(manual.items ?? []), ...derived],
  };
}

async function githubJson(path: string): Promise<unknown> {
  const token = process.env.GITHUB_TOKEN?.trim();
  const response = await fetch(`https://api.github.com/${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "poracode-website-news",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 3600 },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}`);
  return response.json();
}

/** Public repository numbers; each one degrades to null independently. */
export async function fetchGitHubSnapshot(): Promise<GitHubSnapshot> {
  const [repo, issues] = await Promise.allSettled([
    githubJson(`repos/${REPO}`),
    githubJson(
      `search/issues?q=${encodeURIComponent(`repo:${REPO} is:issue is:open label:"good first issue"`)}&per_page=1`,
    ),
  ]);
  const stars =
    repo.status === "fulfilled" &&
    typeof (repo.value as { stargazers_count?: unknown }).stargazers_count === "number"
      ? (repo.value as { stargazers_count: number }).stargazers_count
      : null;
  const goodFirstIssues =
    issues.status === "fulfilled" &&
    typeof (issues.value as { total_count?: unknown }).total_count === "number"
      ? (issues.value as { total_count: number }).total_count
      : null;
  return { stars, goodFirstIssues };
}
