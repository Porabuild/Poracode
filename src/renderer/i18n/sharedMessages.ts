import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { setMessageResolver, type MessageKey } from "@/shared/messages";
import { i18n } from "./i18n";

/**
 * Lingui descriptors mirroring the shared `messages` catalog in
 * `@/shared/messages`. That module stays macro-free so it can be imported by
 * the supervisor process too; the renderer installs these translations at
 * runtime via {@link setMessageResolver}. `{param}` placeholders are ICU
 * arguments resolved with the values passed to `msg()`.
 */
const SHARED_MESSAGE_DESCRIPTORS: Record<MessageKey, MessageDescriptor> = {
  "git.commandFailed": msg({ message: "Git {command} failed: {detail}" }),
  "git.switch.dirtyWorktree": msg({
    message: "Cannot switch branches — commit or stash your changes first",
  }),
  "git.commit.failed": msg({ message: "Commit failed: {detail}" }),
  "git.commit.hookFailed": msg({ message: "Pre-commit hook failed" }),
  "git.hook.failed": msg({ message: "{hook} hook failed" }),
  "git.push.failed": msg({ message: "Push failed: {detail}" }),
  "git.sync.failed": msg({ message: "Sync failed: {detail}" }),
  "git.merge.failed": msg({ message: "Merge failed" }),
  "git.merge.conflicts": msg({ message: "Merge has conflicts" }),
  "git.merge.conflictsDetail": msg({ message: "Merge has conflicts:\n{files}" }),
  "git.merge.finishFailed": msg({ message: "Could not complete the merge" }),
  "git.merge.abortFailed": msg({ message: "Could not abort the merge: {detail}" }),
  "git.pull.failed": msg({ message: "Pull failed: {detail}" }),
  "git.pull.localChanges": msg({
    message: "Local changes need to be stashed before pulling from {branch}",
  }),
  "git.pull.reapplyConflicts": msg({ message: "Re-applying local changes has conflicts" }),
  "git.pull.stashPreserved": msg({
    message: "Pull did not complete. Your local changes remain in a Poracode stash.",
  }),
  "git.worktree.noBranch": msg({
    message: "Cannot create a default worktree path without a branch name",
  }),
  "git.worktree.dirtySource": msg({
    message:
      "Branch '{branch}' has uncommitted changes in '{path}' — commit or stash them before merging",
  }),
  // NOTE: `lingui extract`'s PO writer mangles a translated `msgstr` that
  // leads with a placeholder immediately followed by a newline (`{original}\n…`),
  // dropping that leading segment on rewrite. The es/ru/uk `msgstr` for this key
  // is hand-maintained in the catalogs; if you re-run extract, re-apply it. The
  // `sharedMessages.test.ts` regression guard fails if it gets dropped.
  "git.worktree.cleanupFailed": msg({
    message: "{original}\nWorktree cleanup also failed: {cleanup}",
  }),
  "git.detachedHead": msg({ message: "detached HEAD" }),
  "experiment.diff.baseFullCommit": msg({
    message: "Experiment diff base must be a full commit hash",
  }),
  "experiment.candidate.changedDuringDiff": msg({
    message: "Experiment candidate changed while its diff was being captured",
  }),
  "experiment.candidate.statusFailed": msg({
    message: "Unable to read experiment candidate status",
  }),
  "experiment.candidate.tooManyUntracked": msg({
    message: "Experiment candidate has too many untracked files ({count}; maximum {maximum})",
  }),
  "experiment.candidate.diffTooLarge": msg({
    message: "Experiment candidate diff is too large to compare safely",
  }),
  "experiment.candidate.untrackedReadFailed": msg({
    message: "Unable to read untracked candidate file: {path}",
  }),
  "experiment.candidate.changedDuringStats": msg({
    message: "Experiment candidate changed while its stats were being captured",
  }),
  "experiment.candidate.commitResolveFailed": msg({
    message: "Unable to resolve the experiment candidate commit",
  }),
  "experiment.candidate.notDescendant": msg({
    message: "Experiment candidate no longer descends from its frozen base commit",
  }),
  "experiment.merge.branchTipsFailed": msg({
    message: "Unable to resolve branch tips for fast-forward merge",
  }),
  "experiment.merge.sourceBranchMismatch": msg({
    message: "Expected source worktree branch {expected}, but found {actual}",
  }),
  "experiment.merge.worktreeDirty": msg({
    message: "Worktree {path} has uncommitted changes",
  }),
  "experiment.merge.worktreeBranchMismatch": msg({
    message: "Expected worktree branch {expected}, but found {actual}",
  }),
  "experiment.merge.worktreeHeadMismatch": msg({
    message: "Expected worktree HEAD {expected}, but found {actual}",
  }),
  "experiment.merge.branchHeadMismatch": msg({
    message: "Expected branch {branch} at {expected}, but found {actual}",
  }),
  "experiment.worktree.ownerNeedsFrozenSource": msg({
    message: "A worktree owner requires a frozen branch source",
  }),
  "experiment.worktree.creationRollbackFailed": msg({
    message: "Failed to create owned worktree: {detail}. Rollback left branch {branch}: {rollback}",
  }),
  "experiment.worktree.expectedOwnerNeedsBranch": msg({
    message: "An expected worktree owner requires a branch",
  }),
  "experiment.worktree.metadataRollbackFailed": msg({
    message:
      "Failed to record owned branch metadata: {detail}. Rollback left branch {branch}: {rollback}",
  }),
  "experiment.worktree.sourceMetadataRollbackFailed": msg({
    message: "Failed to record frozen source metadata: {detail}. Rollback left {rollback}",
  }),
  "experiment.worktree.rollbackWorktree": msg({
    message: "worktree at {path}: {detail}",
  }),
  "experiment.worktree.rollbackBranch": msg({ message: "branch {branch}: {detail}" }),
  "experiment.worktree.frozenSourceNeedsCommit": msg({
    message: "A frozen worktree source requires a full commit hash",
  }),
  "experiment.worktree.frozenSourceNotLocal": msg({
    message: "Frozen worktree source is not a local branch: {branch}",
  }),
  "experiment.worktree.sourceMoved": msg({
    message: "Source branch {branch} moved before the worktree was created",
  }),
  "experiment.worktree.ownerMismatch": msg({
    message: "Expected worktree owner {expected}, but found {actual}",
  }),
  "experiment.worktree.noOwner": msg({ message: "none" }),
  "experiment.judge.atLeastTwo": msg({
    message: "Experiment judge requires at least two candidates",
  }),
  "experiment.judge.invalidJson": msg({ message: "Experiment judge returned invalid JSON" }),
  "experiment.judge.invalidShape": msg({
    message: "Experiment judge returned an invalid response shape",
  }),
  "experiment.judge.winnerRange": msg({
    message: "Experiment judge winner must be between 1 and {candidateCount}",
  }),
  "experiment.judge.emptyRationale": msg({
    message: "Experiment judge returned an empty rationale",
  }),
  "experiment.judge.promptBlank": msg({ message: "Experiment prompt must not be blank" }),
  "experiment.judge.uniqueThreadIds": msg({
    message: "Experiment candidate thread ids must be unique",
  }),
  "experiment.judge.noDefaultModel": msg({
    message: "No default one-shot model configured for {provider}",
  }),
  "experiment.judge.textOnlyUnsupported": msg({
    message: "{provider} does not support text-only one-shot generation",
  }),
  "git.wsl.homeNotFound": msg({
    message: 'Unable to resolve home directory for WSL distro "{distro}"',
  }),
  "git.wsl.mkdirFailed": msg({ message: 'Unable to create WSL worktree directory "{path}"' }),
  "git.pr.createFailed": msg({ message: "Failed to create pull request: {detail}" }),
  "git.pr.mergeFailed": msg({ message: "Failed to merge pull request: {detail}" }),
  "git.pr.closeFailed": msg({ message: "Failed to close pull request: {detail}" }),
  "git.generateMessage.failed": msg({ message: "Could not generate commit message: {detail}" }),
  "supervisor.restarted": msg({ message: "Background process restarted" }),
  "supervisor.exited": msg({ message: "Background process exited unexpectedly" }),
  "supervisor.notRunning": msg({ message: "Background process is not running" }),
  "update.error": msg({ message: "Update error: {detail}" }),
};

/**
 * Install the renderer's locale-aware resolver for `@/shared/messages`. Imported
 * for its side effect by the i18n runtime, so it is active as soon as i18n
 * loads (including in tests, which import the runtime via `testSetup`).
 */
setMessageResolver((key, params) => {
  const descriptor = SHARED_MESSAGE_DESCRIPTORS[key];
  // The catalog keys messages by their source text, so the descriptor's id
  // (or message) is the lookup key; `i18n._` interpolates the `{param}` values.
  return i18n._(descriptor.id ?? descriptor.message ?? key, params);
});
