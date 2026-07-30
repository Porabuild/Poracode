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
  "automation.run.exited": msg({
    message: "The automation conversation exited before the turn completed.",
  }),
  "automation.run.replyRequired": msg({
    message: "The automation needs a reply before it can continue.",
  }),
  "automation.run.approvalRequired": msg({
    message: "The automation needs approval before it can continue.",
  }),
  "automation.run.failed": msg({ message: "The scheduled automation failed." }),
  "automation.run.targetInUse": msg({
    message: "Another automation is already using this conversation.",
  }),
  "automation.run.timeLimit": msg({ message: "The automation exceeded its time limit." }),
  "automation.run.completionUnavailable": msg({
    message: "Completion evaluation is unavailable.",
  }),
  "automation.run.completionFailed": msg({
    message: "Completion evaluation failed: {detail}",
  }),
  "automation.run.projectMissing": msg({ message: "Project no longer exists." }),
  "automation.heartbeat.missing": msg({
    message: "The heartbeat conversation no longer exists.",
  }),
  "automation.heartbeat.archived": msg({
    message: "The heartbeat conversation is archived.",
  }),
  "automation.heartbeat.nativeChatRequired": msg({
    message: "Heartbeat automations require a native chat conversation.",
  }),
  "automation.heartbeat.differentProject": msg({
    message: "The heartbeat conversation belongs to a different project.",
  }),
  "automation.heartbeat.differentAgent": msg({
    message: "The heartbeat conversation uses a different agent.",
  }),
  "automation.heartbeat.busy": msg({
    message: "The heartbeat conversation is currently busy.",
  }),
  "automation.heartbeat.unavailable": msg({ message: "Heartbeat execution is unavailable." }),
  "automation.heartbeat.cannotResume": msg({
    message: "The heartbeat conversation cannot be resumed.",
  }),
  "automation.retry.cancelled": msg({ message: "Scheduled retry was cancelled." }),
  "automation.retry.taskDeleted": msg({ message: "Scheduled task was deleted before retrying." }),
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
