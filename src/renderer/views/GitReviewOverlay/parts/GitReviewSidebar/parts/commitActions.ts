import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { CommitDefaultAction } from "@/shared/contracts";

export interface CommitActionAvailability {
  /** A remote exists, so the changes can be pushed. */
  hasRemote: boolean;
  /** A GitHub PR can be opened: remote + target branch + no open PR yet. */
  canCreatePr: boolean;
}

/** Display labels keyed by the stable {@link CommitDefaultAction} id; resolve via `useLingui().t`. */
export const COMMIT_ACTION_LABELS: Record<CommitDefaultAction, MessageDescriptor> = {
  commit: msg`Commit`,
  "commit-push": msg`Commit & Push`,
  "commit-push-pr": msg`Commit & Create PR`,
};

/**
 * Commit actions offered by the commit split-button, in ascending order of
 * scope. `commit` is always available; `commit-push` needs a remote;
 * `commit-push-pr` additionally needs a PR target with no open PR yet.
 */
export function getAvailableCommitActions(
  availability: CommitActionAvailability,
): CommitDefaultAction[] {
  const actions: CommitDefaultAction[] = ["commit"];
  if (availability.hasRemote) actions.push("commit-push");
  if (availability.canCreatePr) actions.push("commit-push-pr");
  return actions;
}

/**
 * The primary commit action: the user's sticky last-used default when it's
 * available, otherwise the strongest available fallback (push needs a remote).
 * Never mutates the stored preference — a temporarily-unavailable default is
 * just displayed as its fallback until it becomes available again.
 */
export function resolvePrimaryCommitAction(
  preferred: CommitDefaultAction,
  availability: CommitActionAvailability,
): CommitDefaultAction {
  if (getAvailableCommitActions(availability).includes(preferred)) return preferred;
  return availability.hasRemote ? "commit-push" : "commit";
}
