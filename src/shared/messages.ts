/**
 * Centralized user-facing message catalog.
 *
 * Every string shown to the user (toasts, dialogs, inline errors) should come
 * from here so we have a single source of truth that is easy to translate later.
 *
 * Templates use `{param}` placeholders, resolved at call time by `msg()`.
 */

const messages = {
  // ── Git: general ──────────────────────────────────────────
  "git.commandFailed": "Git {command} failed: {detail}",

  // ── Git: branch / switch ──────────────────────────────────
  "git.switch.dirtyWorktree":
    "Cannot switch branches — commit or stash your changes first",

  // ── Git: commit ───────────────────────────────────────────
  "git.commit.failed": "Commit failed: {detail}",

  // ── Git: push / sync ──────────────────────────────────────
  "git.push.failed": "Push failed: {detail}",
  "git.sync.failed": "Sync failed: {detail}",

  // ── Git: merge ────────────────────────────────────────────
  "git.merge.failed": "Merge failed",
  "git.merge.conflicts": "Merge has conflicts",
  "git.merge.conflictsDetail": "Merge has conflicts:\n{files}",
  "git.merge.finishFailed": "Could not complete the merge",
  "git.merge.abortFailed": "Could not abort the merge: {detail}",

  // ── Git: pull from source ─────────────────────────────────
  "git.pull.failed": "Pull failed: {detail}",

  // ── Git: mergetool ────────────────────────────────────────
  "git.mergetool.failed": "Merge tool failed to resolve conflicts",

  // ── Git: worktree ─────────────────────────────────────────
  "git.worktree.noBranch":
    "Cannot create a default worktree path without a branch name",
  "git.worktree.dirtySource":
    "Branch '{branch}' has uncommitted changes in '{path}' — commit or stash them before merging",
  "git.worktree.cleanupFailed":
    "{original}\nWorktree cleanup also failed: {cleanup}",

  // ── Git: WSL ──────────────────────────────────────────────
  "git.wsl.homeNotFound":
    "Unable to resolve home directory for WSL distro \"{distro}\"",
  "git.wsl.mkdirFailed":
    "Unable to create WSL worktree directory \"{path}\"",

  // ── Git: PR ───────────────────────────────────────────────
  "git.pr.createFailed": "Failed to create pull request: {detail}",
  "git.pr.mergeFailed": "Failed to merge pull request: {detail}",
  "git.pr.closeFailed": "Failed to close pull request: {detail}",

  // ── Git: generate message ─────────────────────────────────
  "git.generateMessage.failed":
    "Could not generate commit message: {detail}",

  // ── Supervisor ────────────────────────────────────────────
  "supervisor.restarted": "Background process restarted",
  "supervisor.exited": "Background process exited unexpectedly",
  "supervisor.notRunning": "Background process is not running",

  // ── App update ────────────────────────────────────────────
  "update.error": "Update error: {detail}",
} as const;

// ---------------------------------------------------------------------------

/** Union of every known message key. */
export type MessageKey = keyof typeof messages;

/**
 * Look up a user-facing message by key with optional `{param}` interpolation.
 *
 * ```ts
 * msg("git.merge.conflictsDetail", { files: "src/index.ts\nREADME.md" })
 * // → "Merge has conflicts:\nsrc/index.ts\nREADME.md"
 * ```
 */
export function msg(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  let text: string = messages[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * Extract the raw message string from an unknown caught value.
 *
 * Use this for `console.error` logging or when you need the unmodified detail.
 * For user-facing toasts, prefer {@link friendlyError} instead.
 */
export function errorDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Pattern → friendly message mapping (for user-facing toasts)
// ---------------------------------------------------------------------------

/**
 * Each entry is a regex tested against the raw error string and the
 * message key (+ optional param extractor) to use when it matches.
 * Order matters — first match wins.
 */
const errorPatterns: Array<{
  test: RegExp;
  key: MessageKey;
  params?: (raw: string) => Record<string, string>;
}> = [
  {
    test: /local changes.*would be overwritten/i,
    key: "git.switch.dirtyWorktree",
  },
  {
    test: /not fully merged/i,
    key: "git.merge.failed",
  },
  {
    test: /CONFLICT|Merge conflict/,
    key: "git.merge.conflicts",
  },
];

/** Strip Electron IPC wrapper noise from error messages. */
function stripIpcPrefix(raw: string): string {
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/i, "");
}

/**
 * Turn an unknown caught error into a short, user-friendly toast string.
 *
 * 1. Extracts the raw message.
 * 2. Strips Electron IPC wrapper noise.
 * 3. Matches against known patterns → returns a catalog message.
 * 4. Falls back to the stripped raw string for unknown errors.
 */
export function friendlyError(err: unknown): string {
  const raw = stripIpcPrefix(errorDetail(err));

  for (const pattern of errorPatterns) {
    if (pattern.test.test(raw)) {
      return msg(pattern.key, pattern.params?.(raw));
    }
  }

  return raw;
}
