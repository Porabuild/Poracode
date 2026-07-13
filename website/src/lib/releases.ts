const GITHUB_REPO = "SDSLeon/lightcode";
const RELEASES_LATEST_URL = `https://github.com/${GITHUB_REPO}/releases/latest`;
const RELEASES_INDEX_URL = `https://github.com/${GITHUB_REPO}/releases`;
const NIGHTLY_TAG_PATTERN = /-nightly\./;

export const PLATFORM_PATTERNS: Record<string, RegExp> = {
  "mac-arm64": /Poracode-.*-arm64\.dmg$/,
  "mac-x64": /Poracode-.*-x64\.dmg$/,
  "win-x64": /Poracode-.*Setup-.*-x64\.exe$/,
  "win-arm64": /Poracode-.*Setup-.*-arm64\.exe$/,
  "linux-x64": /Poracode-.*-x86_64\.AppImage$/,
};

export type PlatformSlug = keyof typeof PLATFORM_PATTERNS;

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubReleaseResponse {
  tag_name: string;
  html_url: string;
  assets: GitHubAsset[];
  prerelease?: boolean;
  published_at?: string | null;
}

export interface ReleaseInfo {
  version: string | null;
  releasesUrl: string;
  downloads: Partial<Record<string, string>>;
  publishedAt?: string | null;
}

function buildReleaseInfo(release: GitHubReleaseResponse): ReleaseInfo {
  const downloads: Record<string, string> = {};
  for (const [slug, pattern] of Object.entries(PLATFORM_PATTERNS)) {
    const asset = release.assets.find((a) => pattern.test(a.name));
    if (asset) downloads[slug] = asset.browser_download_url;
  }
  return {
    version: release.tag_name.replace(/^v/, ""),
    releasesUrl: release.html_url,
    downloads,
    publishedAt: release.published_at ?? null,
  };
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Poracode-Website",
  };
  // Optional: required when the repo is private.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Fetches the latest GitHub release. Server-only — relies on Next.js fetch
 * caching (`revalidate: 300`) so the version + asset URLs are refreshed every
 * 5 minutes without per-request hits to api.github.com.
 */
export async function getLatestRelease(): Promise<ReleaseInfo> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    const release = (await res.json()) as GitHubReleaseResponse;
    return buildReleaseInfo(release);
  } catch {
    return {
      version: null,
      releasesUrl: RELEASES_LATEST_URL,
      downloads: {},
      publishedAt: null,
    };
  }
}

/**
 * Fetches the latest nightly prerelease. GitHub's `/releases/latest` endpoint
 * skips prereleases, so we list all releases and pick the most recent one
 * tagged `*-nightly.*` with `prerelease: true`. Results are cached for 5
 * minutes via Next.js fetch revalidation.
 */
export async function getLatestNightlyRelease(): Promise<ReleaseInfo> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: githubHeaders(),
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    const releases = (await res.json()) as GitHubReleaseResponse[];
    // GitHub returns releases sorted by created_at desc, so the first match wins.
    const nightly = releases.find(
      (r) => r.prerelease === true && NIGHTLY_TAG_PATTERN.test(r.tag_name),
    );

    if (!nightly) {
      return {
        version: null,
        releasesUrl: RELEASES_INDEX_URL,
        downloads: {},
        publishedAt: null,
      };
    }

    return buildReleaseInfo(nightly);
  } catch {
    return {
      version: null,
      releasesUrl: RELEASES_INDEX_URL,
      downloads: {},
      publishedAt: null,
    };
  }
}

export function downloadUrlFor(release: ReleaseInfo, slug: string): string {
  return release.downloads[slug] ?? release.releasesUrl;
}
