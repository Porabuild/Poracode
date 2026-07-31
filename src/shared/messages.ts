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
  "git.switch.dirtyWorktree": "Cannot switch branches — commit or stash your changes first",

  // ── Git: commit ───────────────────────────────────────────
  "git.commit.failed": "Commit failed: {detail}",
  "git.commit.hookFailed": "Pre-commit hook failed",
  "git.hook.failed": "{hook} hook failed",

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
  "git.pull.localChanges": "Local changes need to be stashed before pulling from {branch}",
  "git.pull.reapplyConflicts": "Re-applying local changes has conflicts",
  "git.pull.stashPreserved":
    "Pull did not complete. Your local changes remain in a Poracode stash.",
  "git.pull.reapplyAfterMerge":
    "Your local changes were stashed and will be re-applied once the merge is resolved.",
  "git.pull.stashReapplied": "Your stashed local changes were re-applied.",

  // ── Git: worktree ─────────────────────────────────────────
  "git.worktree.noBranch": "Cannot create a default worktree path without a branch name",
  "git.worktree.dirtySource":
    "Branch '{branch}' has uncommitted changes in '{path}' — commit or stash them before merging",
  "git.worktree.cleanupFailed": "{original}\nWorktree cleanup also failed: {cleanup}",
  "git.detachedHead": "detached HEAD",

  // ── Experiments ──────────────────────────────────────────
  "experiment.diff.baseFullCommit": "Experiment diff base must be a full commit hash",
  "experiment.candidate.changedDuringDiff":
    "Experiment candidate changed while its diff was being captured",
  "experiment.candidate.statusFailed": "Unable to read experiment candidate status",
  "experiment.candidate.tooManyUntracked":
    "Experiment candidate has too many untracked files ({count}; maximum {maximum})",
  "experiment.candidate.diffTooLarge": "Experiment candidate diff is too large to compare safely",
  "experiment.candidate.untrackedReadFailed": "Unable to read untracked candidate file: {path}",
  "experiment.candidate.changedDuringStats":
    "Experiment candidate changed while its stats were being captured",
  "experiment.candidate.commitResolveFailed": "Unable to resolve the experiment candidate commit",
  "experiment.candidate.notDescendant":
    "Experiment candidate no longer descends from its frozen base commit",
  "experiment.merge.branchTipsFailed": "Unable to resolve branch tips for fast-forward merge",
  "experiment.merge.sourceBranchMismatch":
    "Expected source worktree branch {expected}, but found {actual}",
  "experiment.merge.worktreeDirty": "Worktree {path} has uncommitted changes",
  "experiment.merge.worktreeBranchMismatch":
    "Expected worktree branch {expected}, but found {actual}",
  "experiment.merge.worktreeHeadMismatch": "Expected worktree HEAD {expected}, but found {actual}",
  "experiment.merge.branchHeadMismatch":
    "Expected branch {branch} at {expected}, but found {actual}",
  "experiment.worktree.ownerNeedsFrozenSource": "A worktree owner requires a frozen branch source",
  "experiment.worktree.creationRollbackFailed":
    "Failed to create owned worktree: {detail}. Rollback left branch {branch}: {rollback}",
  "experiment.worktree.expectedOwnerNeedsBranch": "An expected worktree owner requires a branch",
  "experiment.worktree.metadataRollbackFailed":
    "Failed to record owned branch metadata: {detail}. Rollback left branch {branch}: {rollback}",
  "experiment.worktree.sourceMetadataRollbackFailed":
    "Failed to record frozen source metadata: {detail}. Rollback left {rollback}",
  "experiment.worktree.rollbackWorktree": "worktree at {path}: {detail}",
  "experiment.worktree.rollbackBranch": "branch {branch}: {detail}",
  "experiment.worktree.frozenSourceNeedsCommit":
    "A frozen worktree source requires a full commit hash",
  "experiment.worktree.frozenSourceNotLocal":
    "Frozen worktree source is not a local branch: {branch}",
  "experiment.worktree.sourceMoved": "Source branch {branch} moved before the worktree was created",
  "experiment.worktree.ownerMismatch": "Expected worktree owner {expected}, but found {actual}",
  "experiment.worktree.noOwner": "none",
  "experiment.worktree.unavailable": "The experiment candidate worktree is unavailable.",
  "experiment.judge.atLeastTwo": "Experiment judge requires at least two candidates",
  "experiment.judge.invalidJson": "Experiment judge returned invalid JSON",
  "experiment.judge.invalidShape": "Experiment judge returned an invalid response shape",
  "experiment.judge.winnerRange": "Experiment judge winner must be between 1 and {candidateCount}",
  "experiment.judge.emptyRationale": "Experiment judge returned an empty rationale",
  "experiment.judge.noChanges": "The candidates have not made any changes yet.",
  "experiment.judge.noResponse":
    "No chat response is available for experiment candidate {threadId}.",
  "experiment.judge.promptBlank": "Experiment prompt must not be blank",
  "experiment.judge.uniqueThreadIds": "Experiment candidate thread ids must be unique",
  "experiment.judge.noDefaultModel": "No default one-shot model configured for {provider}",
  "experiment.judge.oneShotUnsupported": "{provider} does not support one-shot generation",

  // ── Git: WSL ──────────────────────────────────────────────
  "git.wsl.homeNotFound": 'Unable to resolve home directory for WSL distro "{distro}"',
  "git.wsl.mkdirFailed": 'Unable to create WSL worktree directory "{path}"',

  // ── Git: PR ───────────────────────────────────────────────
  "git.pr.createFailed": "Failed to create pull request: {detail}",
  "git.pr.mergeFailed": "Failed to merge pull request: {detail}",
  "git.pr.closeFailed": "Failed to close pull request: {detail}",

  // ── Git: generate message ─────────────────────────────────
  "git.generateMessage.failed": "Could not generate commit message: {detail}",

  // ── Supervisor ────────────────────────────────────────────
  "supervisor.restarted": "Background process restarted",
  "supervisor.exited": "Background process exited unexpectedly",
  "supervisor.notRunning": "Background process is not running",

  // ── Kimi Code ─────────────────────────────────────────────
  "kimi.credentialsLocked":
    "Kimi Code could not update its credentials because another process is using the credential file. Close other Poracode or Kimi Code processes, then retry.",
  "kimi.emptyResponse":
    "Kimi Code ended the turn without returning a response. Restart the thread and try again.",

  // ── App update ────────────────────────────────────────────
  "update.error": "Update error: {detail}",
  "update.serviceUnavailable": "The update service is temporarily unavailable.",
  "update.operationFailed": "The update operation failed.",
  "update.devUnavailable": "Update checks are not available in development mode.",

  // ── Remote hosts ─────────────────────────────────────────
  "remote.helper.invalidResponse": "Poracode Helper returned an invalid response.",
  "remote.helper.wrongHost": "The SSH tunnel reached an incompatible Poracode server.",
  "remote.helper.probeFailed": "Poracode Helper is not ready yet (HTTP {status}).",
  "remote.helper.timeout": "Timed out waiting for Poracode Helper.",
  "remote.helper.startFailed":
    "Poracode Helper failed to start. Check that Node 24.10 or newer and npm are installed on the remote machine.",
  "remote.project.invalidName": "Enter a valid project name.",
  "remote.project.invalidPath": "Enter a valid absolute project path.",
  "remote.project.invalidCloneUrl":
    "Enter a safe repository URL using HTTPS, HTTP, SSH, Git, FTP, FTPS, or scp syntax.",
  "remote.project.directoryFailed": "Could not create the project folder.",
  "remote.project.notFound": "Project not found.",
  "remote.project.runningThreads": "Stop the project's running threads before changing its folder.",
  "remote.project.experimentsOwned":
    "Remove the project's experiments before removing the project.",
  "remote.server.unreachable":
    "Can't reach the remote server. Check that it is online, then reconnect it.",
} as const;

// ---------------------------------------------------------------------------

/** Union of every known message key. */
export type MessageKey = keyof typeof messages;

/**
 * Optional locale-aware resolver. The renderer installs one (via
 * `setMessageResolver`) so `msg()` returns translated text; the supervisor and
 * any other macro-less process leave it unset and fall back to English. This
 * keeps this module free of Lingui macros so it stays importable everywhere.
 */
export type MessageResolver = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string | undefined;

let messageResolver: MessageResolver | undefined;

/** Install (or clear, with `undefined`) the locale-aware message resolver. */
export function setMessageResolver(resolver: MessageResolver | undefined): void {
  messageResolver = resolver;
}

/** Interpolate `{param}` placeholders in an English template. */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

/**
 * Look up a user-facing message by key with optional `{param}` interpolation.
 * Returns the active locale's translation when a resolver is installed,
 * otherwise the English source.
 *
 * ```ts
 * msg("git.merge.conflictsDetail", { files: "src/index.ts\nREADME.md" })
 * // → "Merge has conflicts:\nsrc/index.ts\nREADME.md"
 * ```
 */
export function msg(key: MessageKey, params?: Record<string, string | number>): string {
  const resolved = messageResolver?.(key, params);
  if (resolved != null) return resolved;
  return interpolate(messages[key], params);
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
  {
    test: /remote Poracode command returned no JSON result|Poracode Helper returned (?:an invalid port|no pairing URL|an invalid environment descriptor)|remote Poracode pairing URL contained no credential/i,
    key: "remote.helper.invalidResponse",
  },
  {
    test: /Expected a Poracode Helper, but the endpoint is hosted by/i,
    key: "remote.helper.wrongHost",
  },
  {
    test: /Poracode Helper probe returned HTTP \d+/i,
    key: "remote.helper.probeFailed",
    params: (raw) => ({ status: raw.match(/HTTP (\d+)/i)?.[1] ?? "?" }),
  },
  {
    test: /Timed out waiting for the SSH tunnel to reach Poracode Helper/i,
    key: "remote.helper.timeout",
  },
  {
    test: /Poracode Helper failed to start|Poracode SSH requires (?:Node 24\.10 or newer|npm)|Uploaded Poracode runtime archive was not found|No remote loopback port is available for Poracode/i,
    key: "remote.helper.startFailed",
  },
  {
    // undici collapses every transport-level failure into this opaque message
    // (the OS errno, if any, lives only in the cause chain). Anchored so a
    // longer message that merely mentions fetching keeps its own wording.
    test: /^fetch failed\.?$/i,
    key: "remote.server.unreachable",
  },
  {
    // Errno codes that unambiguously mean "the host was not reachable".
    test: /\b(?:ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH)\b/,
    key: "remote.server.unreachable",
  },
];

const remoteErrorMessageKeys: Readonly<Record<string, MessageKey>> = {
  invalid_project_name: "remote.project.invalidName",
  invalid_project_path: "remote.project.invalidPath",
  invalid_clone_url: "remote.project.invalidCloneUrl",
  project_directory_failed: "remote.project.directoryFailed",
  project_not_found: "remote.project.notFound",
  project_has_running_threads: "remote.project.runningThreads",
  experiment_owned: "remote.project.experimentsOwned",
};

function remoteErrorMessageKey(error: unknown): MessageKey | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? remoteErrorMessageKeys[code] : undefined;
}

/**
 * Strip Electron IPC wrapper noise from error messages. The wrapped class name
 * varies (`Error:`, `TypeError:` from undici's `fetch failed`, …) and may be
 * absent, so match any of them rather than plain `Error:`.
 */
function stripIpcPrefix(raw: string): string {
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:[A-Za-z]*Error:\s*)?/i, "");
}

/**
 * Sentinel used to ferry an extra "details" block (typically full stderr)
 * inside the single-string error channel between supervisor → main → renderer.
 * Null bytes do not appear in legitimate error messages, so the marker is
 * collision-safe against real content.
 */
const DETAILS_SENTINEL = " __LC_DETAILS__ ";

/** Append a details block to an error summary so the renderer can disclose it. */
export function attachErrorDetails(summary: string, details: string): string {
  if (!details) return summary;
  return `${summary}${DETAILS_SENTINEL}${details}`;
}

/** Split a raw error string into `{ summary, details }`. */
function splitErrorDetails(raw: string): { summary: string; details: string } {
  const idx = raw.indexOf(DETAILS_SENTINEL);
  if (idx < 0) return { summary: raw, details: "" };
  return {
    summary: raw.slice(0, idx),
    details: raw.slice(idx + DETAILS_SENTINEL.length),
  };
}

const HOOK_PATH_RX = /\.husky\/([\w.-]+)|\.git\/hooks\/([\w.-]+)/;

/**
 * Detect whether a stderr blob looks like output from a failed git hook.
 * Husky prints `husky - <hook> hook exited with code N` on failure, and
 * git itself emits paths under `.husky/` or `.git/hooks/` when invoking
 * scripts.
 */
function detectHookFailure(stderr: string): { hook: string } | null {
  if (!stderr) return null;
  const huskyMatch = stderr.match(/husky\s*-\s*([\w.-]+)\s+hook/i);
  if (huskyMatch?.[1]) return { hook: huskyMatch[1] };
  const pathMatch = stderr.match(HOOK_PATH_RX);
  if (pathMatch) return { hook: pathMatch[1] ?? pathMatch[2] ?? "pre-commit" };
  if (/hook .* (failed|exited)/i.test(stderr)) return { hook: "pre-commit" };
  return null;
}

/**
 * Turn an unknown caught error into a short, user-friendly toast string.
 *
 * 1. Extracts the raw message.
 * 2. Strips Electron IPC wrapper noise.
 * 3. Drops any attached details block (use {@link friendlyErrorWithDetail} to keep it).
 * 4. Matches against known patterns → returns a catalog message.
 * 5. Falls back to the stripped raw string for unknown errors.
 */
export function friendlyError(err: unknown): string {
  return friendlyErrorWithDetail(err).summary;
}

/**
 * Same as {@link friendlyError} but also returns any attached stderr/details
 * block so callers can render it in a toast description or "Show details"
 * disclosure. Hook failures are summarized as "Pre-commit hook failed" with
 * the raw bash noise kept in `details`.
 */
export function friendlyErrorWithDetail(err: unknown): { summary: string; details: string } {
  const raw = stripIpcPrefix(errorDetail(err));
  const { summary: rawSummary, details } = splitErrorDetails(raw);
  const remoteKey = remoteErrorMessageKey(err);
  if (remoteKey) {
    const summary = msg(remoteKey);
    return {
      summary,
      details: details || (rawSummary === summary ? "" : rawSummary),
    };
  }

  const hook = detectHookFailure(details || rawSummary);
  if (hook) {
    const summary =
      hook.hook === "pre-commit" || !hook.hook
        ? msg("git.commit.hookFailed")
        : msg("git.hook.failed", { hook: hook.hook });
    return { summary, details: details || rawSummary };
  }

  for (const pattern of errorPatterns) {
    if (pattern.test.test(rawSummary)) {
      return { summary: msg(pattern.key, pattern.params?.(rawSummary)), details };
    }
  }

  return { summary: rawSummary, details };
}
