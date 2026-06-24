/**
 * Pinned client identifiers that some provider usage endpoints require in
 * request headers. The endpoints are private/undocumented and reject requests
 * with a missing or stale `User-Agent` (Claude returns a persistent 429 without
 * one), so these values rot. Bump them here when a provider starts rejecting
 * requests; the host can also override via `HostPort.clientVersions`.
 *
 * Last reviewed: 2026-06-23.
 */
export const DEFAULT_CLIENT_VERSIONS = {
  claudeCode: "2.1.186",
  codex: "0.50.0",
  copilotChat: "0.26.7",
  editor: "vscode/1.96.2",
} as const;
