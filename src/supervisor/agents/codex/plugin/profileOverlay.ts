import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  linkSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  type Stats,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * How a profile overlay entry is reconciled with the profile's real
 * `CODEX_HOME` when the overlay holds a regular file instead of a link.
 *
 * - `credential` — `auth.json`. Login/logout happen in the real home, so a
 *   missing source means "signed out" and the overlay copy is dropped rather
 *   than resurrected. Codex refreshes tokens in whichever home it runs under,
 *   so a newer overlay copy is written back instead of being overwritten.
 * - `config` — `config.toml`. Same newest-wins reconciliation; a missing
 *   source is restored from the overlay copy (settings, not credentials).
 * - `appendLog` — `session_index.jsonl`. Both homes are read when listing
 *   sessions, so an existing overlay copy is left alone; only a missing or
 *   wrong link is repaired.
 */
type OverlayStatePolicy = "credential" | "config" | "appendLog";

const PROFILE_OVERLAY_STATE_FILES: ReadonlyArray<{ name: string; policy: OverlayStatePolicy }> = [
  { name: "auth.json", policy: "credential" },
  { name: "config.toml", policy: "config" },
  { name: "session_index.jsonl", policy: "appendLog" },
];

/**
 * Reconcile a profile overlay's state files with the profile's real home
 * before a launch. Non-destructive by design: correct links are kept as-is,
 * a newer copy (written by Codex inside the overlay when symlinks fell back
 * to hard-link/copy, typical on Windows) is never overwritten by the older
 * source, and every replacement goes through an atomic rename so a thread
 * already running on the same profile never sees the file disappear.
 */
export function refreshProfileOverlayState(overlayHomeDir: string, sourceHomeDir: string): void {
  for (const { name, policy } of PROFILE_OVERLAY_STATE_FILES) {
    refreshProfileOverlayStateFile(join(sourceHomeDir, name), join(overlayHomeDir, name), policy);
  }
}

function lstatOrUndefined(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch {
    return undefined;
  }
}

function statOrUndefined(path: string): Stats | undefined {
  try {
    return statSync(path);
  } catch {
    return undefined;
  }
}

function sameContent(left: string, right: string): boolean {
  try {
    return readFileSync(left).equals(readFileSync(right));
  } catch {
    return false;
  }
}

function tempSibling(path: string): string {
  return `${path}.poracode-${process.pid}-${randomBytes(4).toString("hex")}`;
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone, or held open on Windows; the next launch retries.
  }
}

/** Link (symlink, then hard link, then optionally copy) `source` at a fresh `path`. */
function createStateLink(source: string, path: string, allowCopy: boolean): boolean {
  try {
    symlinkSync(source, path, "file");
    return true;
  } catch {
    // Fall through to hard-link/copy compatibility.
  }
  try {
    linkSync(source, path);
    return true;
  } catch {
    // Fall through to copy.
  }
  if (!allowCopy) return false;
  try {
    copyFileSync(source, path);
    return true;
  } catch {
    return false;
  }
}

/** Atomically replace `target` with a link to `source`; leaves `target` intact on failure. */
function replaceWithStateLink(source: string, target: string, allowCopy: boolean): void {
  const temp = tempSibling(target);
  if (!createStateLink(source, temp, allowCopy)) return;
  try {
    renameSync(temp, target);
  } catch {
    removeQuietly(temp);
  }
}

/** Atomically copy `from` over `to`; leaves `to` intact on failure. */
function atomicCopy(from: string, to: string): void {
  const temp = tempSibling(to);
  try {
    copyFileSync(from, temp);
    renameSync(temp, to);
  } catch {
    removeQuietly(temp);
  }
}

function isLinkTo(target: string, source: string): boolean {
  try {
    return resolve(dirname(target), readlinkSync(target)) === resolve(source);
  } catch {
    return false;
  }
}

export function refreshProfileOverlayStateFile(
  source: string,
  target: string,
  policy: OverlayStatePolicy,
): void {
  const targetLstat = lstatOrUndefined(target);
  const sourceStat = statOrUndefined(source);

  if (!targetLstat) {
    if (sourceStat) createStateLink(source, target, true);
    return;
  }

  if (targetLstat.isSymbolicLink()) {
    // A correct link already tracks the source (a dangling one just means the
    // profile is signed out). Only a link to some other home is replaced.
    if (isLinkTo(target, source) || !sourceStat) return;
    replaceWithStateLink(source, target, true);
    return;
  }

  // A regular file: either a hard link to the source or a copy fallback.
  if (!sourceStat) {
    if (policy === "credential") removeQuietly(target);
    else if (policy === "config") atomicCopy(target, source);
    return;
  }
  if (sourceStat.dev === targetLstat.dev && sourceStat.ino === targetLstat.ino) return;
  if (policy === "appendLog") return;

  if (sameContent(source, target)) {
    // Nothing to reconcile; upgrade to a real link when one is available, but
    // never churn a fresh copy on every launch.
    replaceWithStateLink(source, target, false);
    return;
  }
  if (targetLstat.mtimeMs > sourceStat.mtimeMs) {
    // Codex refreshed this file inside the overlay: the overlay is newest.
    atomicCopy(target, source);
    return;
  }
  if (sourceStat.mtimeMs > targetLstat.mtimeMs) {
    // Re-login (or an edit) in the real home: the source is newest.
    replaceWithStateLink(source, target, true);
  }
}
