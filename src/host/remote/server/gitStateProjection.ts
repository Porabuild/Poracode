import type {
  GitStateInterest,
  GitStatePatch,
  GitStateSnapshot,
  PullRequestState,
} from "@/shared/gitState";

/**
 * Keeps unbounded pull-request bodies off the remote wire.
 *
 * `PullRequestState` carries a raw `diff` string, a `files[]` list and
 * `reviewThreads[]`. Those are fetched only when a client opens a PR review, but
 * once fetched they live in the host's global Git snapshot — which is embedded in
 * the shell snapshot that clients re-fetch on every status-affecting event, and
 * re-broadcast to every connected client on every ordinary PR poll. A single
 * large PR can therefore add megabytes to traffic nobody asked for.
 *
 * Two rules, both chosen so no client can lose data it already holds (patch
 * application replaces a pull-request entry wholesale, so silently dropping a
 * field would erase the client's copy):
 *
 * - The **shell snapshot** never carries these bodies. It is a bootstrap of
 *   whole-workspace state, and a client that wants a review bundle declares the
 *   interest — which triggers a fresh fetch and a patch carrying it.
 * - A **patch** keeps them only for the pull requests that *this connection*
 *   currently declares a review-bundle interest in. A connection with no such
 *   interest never received these bodies in the first place, so stripping them
 *   cannot remove anything from its store.
 */

const HEAVY_PR_FIELDS = ["diff", "files", "reviewThreads"] as const;

function stripHeavyFields(state: PullRequestState): PullRequestState {
  let next: Record<string, unknown> | undefined;
  for (const field of HEAVY_PR_FIELDS) {
    if (state[field] === undefined) continue;
    next ??= { ...state } as unknown as Record<string, unknown>;
    delete next[field];
  }
  // `freshness` is deliberately preserved: it is small, and it tells the client
  // these resources exist on the host and how stale they are.
  return (next as unknown as PullRequestState | undefined) ?? state;
}

function stripRecord(
  pullRequests: Readonly<Record<string, PullRequestState>>,
  keep: (key: string) => boolean,
): { readonly value: Readonly<Record<string, PullRequestState>>; readonly changed: boolean } {
  let changed = false;
  const next: Record<string, PullRequestState> = {};
  for (const [key, state] of Object.entries(pullRequests)) {
    if (keep(key)) {
      next[key] = state;
      continue;
    }
    const stripped = stripHeavyFields(state);
    if (stripped !== state) changed = true;
    next[key] = stripped;
  }
  return { value: changed ? next : pullRequests, changed };
}

/** Git snapshot with every pull-request body removed. */
export function projectGitStateSnapshotForRemote(snapshot: GitStateSnapshot): GitStateSnapshot {
  const { value, changed } = stripRecord(snapshot.pullRequests, () => false);
  return changed ? { ...snapshot, pullRequests: value } : snapshot;
}

/**
 * True when `interests` asks for the full review bundle of the pull request
 * stored under `key`. Matched on the key suffix because the interest names a
 * project + number while the snapshot is keyed by an encoded composite.
 */
function bundleInterestMatcher(interests: readonly GitStateInterest[]): (key: string) => boolean {
  const wanted = interests.filter(
    (interest) => interest.kind === "pull-request" && interest.includeReviewBundle === true,
  );
  if (wanted.length === 0) return () => false;
  return (key) =>
    wanted.some(
      (interest) =>
        interest.kind === "pull-request" &&
        key.includes(interest.projectId) &&
        key.includes(String(interest.prNumber)),
    );
}

/**
 * Patch with pull-request bodies kept only where this connection declared a
 * review-bundle interest. Returns the original patch when nothing was stripped,
 * so the common case costs no allocation and callers can reuse a shared
 * serialization.
 */
export function projectGitStatePatchForInterests(
  patch: GitStatePatch,
  interests: readonly GitStateInterest[],
): GitStatePatch {
  if (!patch.pullRequests) return patch;
  const { value, changed } = stripRecord(patch.pullRequests, bundleInterestMatcher(interests));
  return changed ? { ...patch, pullRequests: value } : patch;
}
