import type { GitRemoteInfo } from "./contracts";
import { parseForgeRemote } from "./forgeRemote";

/**
 * Identity of the repository a project points at, derived from its cached origin
 * remote. The authority and full namespace matter: identical names on two
 * forges, enterprise hosts or Azure organizations are different repositories.
 *
 * Returns `null` when the origin remote isn't known yet — such a project must
 * never be collapsed into another one by repository identity.
 */
export function repoIdentityKey(remoteInfo: GitRemoteInfo | null | undefined): string | null {
  if (!remoteInfo?.owner.trim() || !remoteInfo.repo.trim()) return null;
  const remote = parseForgeRemote(remoteInfo.url, "origin");
  return remote ? `${remote.host}/${remote.path}`.toLocaleLowerCase() : null;
}
