/**
 * GitHub release access for the published N-1 gate: paginated release
 * listing and authenticated asset downloads. Failures are typed
 * (`RELEASE_LIST_UNAVAILABLE`) so infrastructure outages cannot masquerade
 * as the no-predecessor verdict.
 */

import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { redactSecrets } from "./redaction.mjs";

export async function downloadAsset(fetchImpl, asset, destination, token) {
  // Authenticated downloads must go through the API asset URL with an
  // octet-stream accept; unauthenticated ones use the browser URL. The token
  // only travels in headers and is never logged.
  const useApiUrl = Boolean(token) && Number.isSafeInteger(asset.id);
  const url = useApiUrl
    ? `https://api.github.com/repos/${asset.repo}/releases/assets/${asset.id}`
    : asset.browser_download_url;
  if (!url) throw new Error(`release asset ${asset.name} has no downloadable URL`);
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "poracode-n1-qualification",
      ...(useApiUrl ? { accept: "application/octet-stream" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `download of ${asset.name} failed: HTTP ${response.status} (repo asset, not an auth echo)`,
    );
  }
  await pipeline(response.body, createWriteStream(destination));
  return destination;
}

export async function fetchAllReleases(fetchImpl, repo, token) {
  const pages = [];
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "poracode-n1-qualification",
          "x-github-api-version": "2022-11-28",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const detail = redactSecrets(await response.text().catch(() => ""));
      const error = new Error(
        `GitHub release list for ${repo} returned HTTP ${response.status}` +
          (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0"
            ? " (rate limited; set GITHUB_TOKEN)"
            : "") +
          (detail ? `: ${detail.slice(0, 300)}` : ""),
      );
      error.code = "RELEASE_LIST_UNAVAILABLE";
      throw error;
    }
    const batch = await response.json();
    pages.push(...(Array.isArray(batch) ? batch : []));
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return pages;
}
