import { chmodSync, lstatSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { ServerInstallLayout } from "./serverInstallLayout";

/**
 * D4 crash-safe upgrade journal.
 *
 * Every destructive phase of an upgrade is written with the atomic-write
 * helper (temp file + rename) before it runs, so a process crash leaves an
 * explicit phase and never a torn write: a reader observes either the previous
 * complete journal or the new complete journal. The helper does not fsync, so
 * this is process-crash atomicity, not power-loss durability — a power loss
 * can lose the newest phase write and leave an older complete phase behind.
 * The next upgrade for the prefix reconciles a non-terminal journal instead of
 * guessing:
 *
 * - a terminal phase is history and is replaced by the next upgrade,
 * - a non-terminal phase means a previous run stopped between drain, backup,
 *   swap and qualification; the upgrader reports explicit recovery instead of
 *   starting a second upgrade on top of it.
 *
 * Fail-closed reads: "absent" is the only state that may proceed. A journal
 * that exists but cannot be read (for example root:root 0600 written by a
 * `sudo` upgrade while the service runs as another user), that is not a
 * regular file (a directory or a symlink at the journal path — a dangling
 * symlink is never "absent"), that declares another format, or that carries a
 * phase unknown to this build (corrupt, or written by a newer app) holds
 * admission for every release under the prefix and makes the next upgrade
 * refuse with explicit recovery guidance. Such a journal is never treated as
 * absent and is never rewritten by this reader.
 */

export const SERVER_UPGRADE_JOURNAL_VERSION = 1;
export const SERVER_UPGRADE_JOURNAL_FILE = "upgrade-journal.json";

/**
 * The direct-spawn staging signal. A service manager cannot pass this
 * environment variable to the unit it starts, so the journal remains the
 * service-managed signal; a direct spawn gets both. Only the exact value "1"
 * is honored and the signal can only hold admission (never release it), so an
 * inherited or malformed value fails safe.
 */
export const SERVER_UPGRADE_STAGING_ENV = "PORACODE_UPGRADE_STAGING";

export type ServerUpgradePhase =
  | "staging"
  | "staged"
  | "draining"
  | "drained"
  | "backup-captured"
  | "swapped"
  | "candidate-started"
  | "qualified"
  | "complete"
  | "failed"
  | "recovery-required";

/**
 * The phases this build understands. A format-1 journal carrying any other
 * phase (a corrupt record, or one written by a newer build that added a phase)
 * is classified `invalid` so every release under the prefix keeps holding
 * admission: unknown phase semantics must never be guessed. Adding a phase is
 * a compatibility change and requires a `formatVersion` bump plus a
 * regression that still accepts the existing format-1 shape.
 */
const SERVER_UPGRADE_PHASES: readonly ServerUpgradePhase[] = [
  "staging",
  "staged",
  "draining",
  "drained",
  "backup-captured",
  "swapped",
  "candidate-started",
  "qualified",
  "complete",
  "failed",
  "recovery-required",
];

export function isServerUpgradePhase(value: unknown): value is ServerUpgradePhase {
  return typeof value === "string" && (SERVER_UPGRADE_PHASES as readonly string[]).includes(value);
}

export interface ServerUpgradeJournal {
  readonly formatVersion: typeof SERVER_UPGRADE_JOURNAL_VERSION;
  readonly prefix: string;
  readonly releaseId: string;
  readonly releaseDir: string;
  readonly previousTarget: string | null;
  readonly phase: ServerUpgradePhase;
  readonly updatedAt: string;
  readonly detail: string | null;
  readonly backupPath: string | null;
  readonly expectedVersion: string | null;
  readonly expectedEntrypointSha256: string | null;
  /** Forward-only migration pending when this upgrade started. */
  readonly forwardOnlyMigration: boolean;
}

export type ServerUpgradeJournalInput = Omit<
  ServerUpgradeJournal,
  "formatVersion" | "updatedAt"
> & { readonly updatedAt?: string };

export type ServerUpgradeJournalRead =
  | { readonly state: "absent" }
  | { readonly state: "ok"; readonly journal: ServerUpgradeJournal }
  | { readonly state: "unreadable"; readonly path: string; readonly reason: string }
  | { readonly state: "invalid"; readonly path: string; readonly reason: string };

export function serverUpgradeJournalPath(prefix: string): string {
  return join(prefix, SERVER_UPGRADE_JOURNAL_FILE);
}

export function isTerminalUpgradePhase(phase: ServerUpgradePhase): boolean {
  return phase === "complete" || phase === "failed" || phase === "recovery-required";
}

/**
 * Exact operator remediation for a non-terminal journal, shared by the
 * upgrade refusal, the recovery entry points and the doctor check.
 */
export function describeUpgradeJournalRemediation(input: {
  readonly prefix: string;
  readonly phase: ServerUpgradePhase;
  readonly releaseDir: string;
}): string {
  const releaseHint = input.releaseDir.length > 0 ? ` (release ${input.releaseDir})` : "";
  if (input.phase === "staging" || input.phase === "staged")
    return (
      `Nothing has been drained or swapped yet${releaseHint}. Retry safely with ` +
      `\`poracode-server upgrade --resume --from <tarball> --prefix ${input.prefix}\`, or remove ` +
      `the journal with \`poracode-server upgrade --abandon-journal --confirm --prefix ${input.prefix}\`.`
    );
  return (
    `The interrupted upgrade is past the drain/swap boundary${releaseHint}. Resume it with ` +
    `\`poracode-server upgrade --resume --confirm --prefix ${input.prefix}\` (add ` +
    "`--from <tarball>` if the release is not staged), or, after verifying nothing must be kept " +
    `and no release is serving from the staged candidate, remove the journal with ` +
    `\`poracode-server upgrade --abandon-journal --confirm --prefix ${input.prefix}\`.`
  );
}

/**
 * Distinguish absence from a present-but-unusable journal. Only "absent" may
 * be treated as "no upgrade in flight"; callers that make admission, refusal
 * or recovery decisions must use this state result, never the `null`
 * convenience below.
 */
export function readServerUpgradeJournalState(prefix: string): ServerUpgradeJournalRead {
  const path = serverUpgradeJournalPath(prefix);
  let raw: string;
  try {
    // lstat, not stat: a symlink at the journal path is never the journal,
    // even when it currently resolves to a regular file, and a dangling
    // symlink must fail closed as unreadable instead of reading as absent.
    if (!lstatSync(path).isFile()) {
      return { state: "unreadable", path, reason: "the journal path is not a regular file" };
    }
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if (isNotFound(error)) return { state: "absent" };
    return {
      state: "unreadable",
      path,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  let value: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { state: "invalid", path, reason: "the journal is not a JSON object" };
    value = parsed as Record<string, unknown>;
  } catch (error) {
    return {
      state: "invalid",
      path,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  if (value.formatVersion !== SERVER_UPGRADE_JOURNAL_VERSION) {
    return {
      state: "invalid",
      path,
      reason:
        `the journal declares format ${String(value.formatVersion)}, not the supported ` +
        `format ${SERVER_UPGRADE_JOURNAL_VERSION}`,
    };
  }
  // Known-phase check before the field-shape check so the refusal names the
  // unknown phase instead of a generic shape mismatch.
  if (!isServerUpgradePhase(value.phase)) {
    return {
      state: "invalid",
      path,
      reason:
        typeof value.phase === "string"
          ? `the journal declares phase ${JSON.stringify(value.phase)}, which this build does not support`
          : "the journal does not declare a phase",
    };
  }
  if (
    typeof value.prefix !== "string" ||
    typeof value.releaseId !== "string" ||
    typeof value.releaseDir !== "string" ||
    (value.previousTarget !== null && typeof value.previousTarget !== "string") ||
    typeof value.updatedAt !== "string" ||
    (value.detail !== null && typeof value.detail !== "string") ||
    (value.backupPath !== null && typeof value.backupPath !== "string") ||
    (value.expectedVersion !== null && typeof value.expectedVersion !== "string") ||
    (value.expectedEntrypointSha256 !== null &&
      typeof value.expectedEntrypointSha256 !== "string") ||
    typeof value.forwardOnlyMigration !== "boolean"
  ) {
    return { state: "invalid", path, reason: "the journal fields do not match format 1" };
  }
  return { state: "ok", journal: value as unknown as ServerUpgradeJournal };
}

/**
 * Convenience read for display and tests. Returns the journal only for the
 * "ok" state and `null` for every other state — it cannot distinguish absence
 * from an unreadable/future journal, so it must never drive staging,
 * in-flight or recovery decisions.
 */
export function readServerUpgradeJournal(prefix: string): ServerUpgradeJournal | null {
  const read = readServerUpgradeJournalState(prefix);
  return read.state === "ok" ? read.journal : null;
}

function isNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

export function writeServerUpgradeJournal(
  prefix: string,
  input: ServerUpgradeJournalInput,
): ServerUpgradeJournal {
  const journal: ServerUpgradeJournal = {
    formatVersion: SERVER_UPGRADE_JOURNAL_VERSION,
    ...input,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
  const path = serverUpgradeJournalPath(prefix);
  writeFileAtomic(path, `${JSON.stringify(journal, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  // The read-only staging metadata (prefix, release paths, expected version
  // and entrypoint SHA, phase) contains no secrets, and the service user that
  // starts the staged candidate must be able to read it even when the upgrade
  // itself ran as root. Set the mode explicitly so a restrictive umask cannot
  // make the journal unreadable for the service manager's candidate.
  chmodSync(path, 0o644);
  return journal;
}

export function removeServerUpgradeJournal(prefix: string): void {
  rmSync(serverUpgradeJournalPath(prefix), { force: true });
}

/**
 * The install prefix that owns a running prefix-layout bundle, derived from
 * `<prefix>/releases/<id>` so a server started by a service manager (which
 * cannot receive an upgrade-only environment variable) can still discover an
 * in-flight upgrade journal.
 */
export function resolveUpgradePrefixForLayout(layout: ServerInstallLayout): string | null {
  if (layout.kind !== "prefix") return null;
  const releases = dirname(layout.root);
  if (basename(releases) !== "releases") return null;
  const prefix = dirname(releases);
  return prefix === releases ? null : prefix;
}

/** True when `releaseRoot` is a direct `<prefix>/releases/<id>` release. */
function isReleaseUnderPrefix(prefix: string, releaseRoot: string): boolean {
  return dirname(releaseRoot) === join(prefix, "releases");
}

/**
 * True when this layout is the staged candidate of an interrupted upgrade and
 * must therefore hold admission until the upgrader proves and admits it.
 *
 * A present-but-unreadable or invalid journal is treated as staging for every
 * release under its prefix: the staged release cannot be identified, so
 * starting any prefix release with admission open would risk accepting writes
 * into an upgrade that has no readable state. Only an authenticated operator
 * recovery (`upgrade --resume` / `upgrade --abandon-journal --confirm`) can
 * clear that hold.
 */
export function isUpgradeStagingLayout(input: {
  readonly prefix: string;
  readonly layout: ServerInstallLayout;
}): boolean {
  const read = readServerUpgradeJournalState(input.prefix);
  if (read.state === "ok") {
    const journal = read.journal;
    if (isTerminalUpgradePhase(journal.phase)) return false;
    if (journal.phase === "qualified") return false;
    return journal.releaseDir === input.layout.root;
  }
  if (read.state === "absent") return false;
  return isReleaseUnderPrefix(input.prefix, input.layout.root);
}

/** Journal lookup for a running layout; absent journal or checkout → false. */
export function isUpgradeStagingForLayout(layout: ServerInstallLayout): boolean {
  const prefix = resolveUpgradePrefixForLayout(layout);
  if (prefix === null) return false;
  return isUpgradeStagingLayout({ prefix, layout });
}

/**
 * The staging signal for a starting server: the journal hold for this exact
 * release, or the validated direct-spawn marker. Either signal holds
 * admission; neither can open it.
 */
export function resolveUpgradeStaging(input: {
  readonly layout?: ServerInstallLayout;
  readonly env: NodeJS.ProcessEnv;
}): boolean {
  const environmentStaging = input.env[SERVER_UPGRADE_STAGING_ENV] === "1";
  if (input.layout === undefined) return environmentStaging;
  return isUpgradeStagingForLayout(input.layout) || environmentStaging;
}
