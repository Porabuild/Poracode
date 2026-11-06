import type { GitRemoteInfo } from "./contracts";
import { parseForgeRemote } from "./forgeRemote";

/**
 * True for a raw SSH/SCP origin (`git@host:path` or `ssh://...`). Such an origin
 * may be an SSH config alias, a deployment-specific route or a proxy, so its
 * spelling is not a repository authority until the owning host resolves it.
 */
export function isUnconfirmedSshOrigin(url: string): boolean {
  const lower = url.toLocaleLowerCase();
  return !lower.includes("://") || lower.startsWith("ssh://");
}

/**
 * Identity of the repository a project points at, derived from its cached origin
 * remote. The authority and full namespace matter: identical names on two
 * forges, enterprise hosts or Azure organizations are different repositories.
 *
 * Only an HTTP(S) origin is a confirmed authority. A raw SSH/SCP origin is
 * returned as `null` even when it names a public host: it may be an unresolved
 * SSH config alias (`git@github.com-<alias>:…`, `gh-personal:…`,
 * `gitlab-work:…`) or an enterprise route, and the same alias can target a
 * different deployment on another machine. The owning host publishes the
 * canonical HTTPS origin after it proves the route. Cached SSH statuses from an
 * older host therefore stay valid for branch/diff display but remain
 * unconfirmed for grouping and shared settings until the next refresh.
 */
export function repoIdentityKey(remoteInfo: GitRemoteInfo | null | undefined): string | null {
  if (!remoteInfo?.owner.trim() || !remoteInfo.repo.trim()) return null;
  if (isUnconfirmedSshOrigin(remoteInfo.url)) return null;
  const remote = parseForgeRemote(remoteInfo.url, "origin");
  return remote ? `${remote.host}/${remote.path}`.toLocaleLowerCase() : null;
}
