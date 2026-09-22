/**
 * Versioned runtime cache and its install lock. The cache is deliberately a
 * sibling of the profile data (`<base>/runtime/<version>/<target>`), never
 * inside the server's owned `<namespace>.host-v1` root.
 *
 * Correctness does not rest on the lock. An entry is built in a unique private
 * staging directory and published with one atomic rename (see `install.mjs`),
 * and every reader re-verifies the ready marker against the pinned manifest.
 * The lock is an advisory duplicate-work optimization: losing it, timing out,
 * or refusing a record this generation does not understand degrades to a
 * concurrent but independently safe install instead of a failure. It is not a
 * kernel mutual-exclusion guarantee and must never be described as one.
 */
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { installCancelled, installLockForeign, installLockTimeout } from "./errors.mjs";

export const RUNTIME_READY_FILE = ".poracode-runtime.json";
export const LOCK_RECORD_VERSION = 1;
const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_BUSY_CODES = new Set(["EEXIST", "ENOTEMPTY", "EPERM", "ENOTDIR", "ENOENT", "EBUSY"]);

export function resolveRuntimeCacheRoot(env = process.env, home = homedir()) {
  const override = env.PORACODE_RUNTIME_CACHE_DIR?.trim();
  if (override) return resolve(override);
  const declaredBase = env.PORACODE_BASE_DIR?.trim();
  const base = declaredBase && isAbsolute(declaredBase) ? declaredBase : join(home, ".poracode");
  return join(base, "runtime");
}

export function readReadyMarker(runtimeDir) {
  const path = join(runtimeDir, RUNTIME_READY_FILE);
  try {
    const marker = JSON.parse(readFileSync(path, "utf8"));
    if (marker?.formatVersion !== 1 || typeof marker.tarballSha256 !== "string") return null;
    return marker;
  } catch {
    return null;
  }
}

export function writeReadyMarker(runtimeDir, marker) {
  writeFileSync(
    join(runtimeDir, RUNTIME_READY_FILE),
    `${JSON.stringify({ formatVersion: 1, ...marker }, null, 2)}\n`,
  );
}

/**
 * Read the owner record at the lock pathname. Exactly three outcomes are
 * recognized:
 * - `missing`: no owner file; only a crashed pre-publication generation or the
 *   legacy `mkdir`-then-write generation can leave one;
 * - `parsed`: generation 1 (`{formatVersion: 1, pid, token}`) or the legacy
 *   bare-pid text file, which stays readable so an old launcher's lock is
 *   either respected (live pid) or reclaimed (dead pid);
 * - `foreign`: JSON without `formatVersion`, a future `formatVersion`, an
 *   unreadable record, or anything else. A foreign record is never reclaimed
 *   and never deleted; `ensureRuntime` proceeds without the lock instead, so a
 *   newer generation's artifact can never be overwritten by this one (F5).
 */
function readLockOwnerRecord(lockDir) {
  let raw;
  try {
    raw = readFileSync(join(lockDir, "owner"), "utf8");
  } catch (error) {
    return { status: error?.code === "ENOENT" ? "missing" : "foreign", owner: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const pid = Number.parseInt(parsed.pid, 10);
      const token = typeof parsed.token === "string" ? parsed.token : null;
      const current =
        parsed.formatVersion === LOCK_RECORD_VERSION &&
        Number.isSafeInteger(pid) &&
        pid > 0 &&
        token !== null;
      return current
        ? { status: "parsed", owner: { pid, token } }
        : { status: "foreign", owner: null };
    }
  } catch {
    // Legacy owner file: a bare pid.
  }
  const pid = Number.parseInt(raw.trim(), 10);
  return Number.isSafeInteger(pid) && pid > 0
    ? { status: "parsed", owner: { pid, token: null }, legacy: true }
    : { status: "foreign", owner: null };
}

function ownerIsAlive(owner) {
  if (!owner) return false;
  try {
    process.kill(owner.pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return error?.code === "EPERM";
  }
}

function sameOwner(a, b) {
  if (!a || !b) return false;
  return a.pid === b.pid && a.token === b.token;
}

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

/**
 * Remove scratch directories a crashed acquisition left behind: staging
 * (`….new-*`) and private yields/quarantines (`….stale-*`). Neither name is
 * ever claimed or renamed onto, so removing one can never disturb the active
 * lock pathname; only entries whose recorded pid is not alive are touched. A
 * quarantine whose reclaimer is still alive may be mid-restore and is left
 * alone.
 */
function sweepOrphanLockScratch(lockDir) {
  const directory = dirname(lockDir);
  const base = basename(lockDir);
  let entries;
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const name of entries) {
    const prefix = name.startsWith(`${base}.new-`)
      ? `${base}.new-`
      : name.startsWith(`${base}.stale-`)
        ? `${base}.stale-`
        : null;
    if (!prefix) continue;
    const pid = Number.parseInt(name.slice(prefix.length).split("-")[0], 10);
    if (!Number.isSafeInteger(pid) || pid <= 0 || pidIsAlive(pid)) continue;
    rmSync(join(directory, name), { recursive: true, force: true });
  }
}

/**
 * Classify the lock pathname:
 * - `absent`: free for an atomic staging rename;
 * - `foreign`: a record this generation must not reclaim or delete;
 * - `held`: a live owner keeps the lock regardless of age (age alone is never
 *   authority to steal a running install);
 * - `abandoned`: a dead owner, or a missing record older than the stale window;
 * - `ownerless`: a missing record still inside the stale window. This
 *   generation never creates this state; only a crashed pre-publication
 *   generation can. It is age-gated rather than claimed immediately.
 */
function classifyLock(lockDir, now) {
  let stat;
  try {
    stat = statSync(lockDir);
  } catch {
    // The lock disappeared between the failed claim and this read.
    return { state: "absent" };
  }
  const record = readLockOwnerRecord(lockDir);
  if (record.status === "foreign") return { state: "foreign" };
  if (record.status === "parsed") {
    return ownerIsAlive(record.owner)
      ? { state: "held", owner: record.owner, ino: stat.ino, dev: stat.dev }
      : { state: "abandoned", owner: record.owner, ino: stat.ino, dev: stat.dev };
  }
  return now() - stat.mtimeMs > LOCK_STALE_MS
    ? { state: "abandoned", owner: null, ino: stat.ino, dev: stat.dev }
    : { state: "ownerless" };
}

/**
 * Atomic stale-lock reclamation with an identity-verified rename: rename the
 * observed generation to a unique private name, prove it is still the exact
 * generation classified as abandoned (inode+device+owner record, owner not
 * alive), and only then delete it. A pathname replaced after the observation
 * is restored when the path is free and never deleted; if a newer holder won
 * the vacancy the quarantine stays inert and is swept once its reclaimer is
 * gone.
 */
function reclaimAbandonedLock(lockDir, observed) {
  const quarantine = `${lockDir}.stale-${process.pid}-${randomUUID()}`;
  try {
    renameSync(lockDir, quarantine);
  } catch {
    return false;
  }
  let takenStat;
  let taken;
  try {
    takenStat = statSync(quarantine);
    taken = readLockOwnerRecord(quarantine);
  } catch {
    return false;
  }
  const sameRecord =
    observed.owner === null
      ? taken.status === "missing"
      : taken.status === "parsed" && sameOwner(taken.owner, observed.owner);
  const sameGeneration =
    takenStat.ino === observed.ino && takenStat.dev === observed.dev && sameRecord;
  const ownerBecameAlive =
    taken.status === "parsed" && taken.owner !== null && ownerIsAlive(taken.owner);
  if (!sameGeneration || ownerBecameAlive) {
    try {
      renameSync(quarantine, lockDir);
    } catch {
      // A newer holder already owns the pathname; the quarantine name is inert.
    }
    return true;
  }
  removeVerifiedPrivateDirectory(quarantine);
  return true;
}

/**
 * Delete a directory this process holds under a private, unguessable name and
 * has re-verified. No other process ever claims or renames onto such a name,
 * so this removal cannot race an acquirer the way a path-based removal of the
 * shared lock pathname could (F1).
 */
function removeVerifiedPrivateDirectory(directory) {
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // A private-name cleanup failure is inert residue; it is never dangerous
    // and is swept by pid once this process exits.
  }
}

/**
 * Release the lock only while it still is the exact generation this
 * acquisition published. The verified lock is atomically renamed to a private
 * name first; the rename is the yield, and only a generation that re-verifies
 * as ours on the private name is deleted. A lock that a reclaimer moved and
 * restored, or a newer owner that took the vacancy, is never deleted and never
 * makes release throw: being displaced is a lost optimization, not a failed
 * install.
 */
function releaseOwnedLock(lockDir, token, identity) {
  try {
    const record = readLockOwnerRecord(lockDir);
    if (record.status !== "parsed" || record.owner.token !== token) return;
    let stat;
    try {
      stat = statSync(lockDir);
    } catch {
      return;
    }
    if (stat.ino !== identity.ino || stat.dev !== identity.dev) return;
    const yielded = `${lockDir}.stale-${process.pid}-${randomUUID()}`;
    try {
      renameSync(lockDir, yielded);
    } catch {
      return;
    }
    let yieldedStat;
    let yieldedRecord;
    try {
      yieldedStat = statSync(yielded);
      yieldedRecord = readLockOwnerRecord(yielded);
    } catch {
      return;
    }
    const verified =
      yieldedStat.ino === identity.ino &&
      yieldedStat.dev === identity.dev &&
      yieldedRecord.status === "parsed" &&
      yieldedRecord.owner.token === token;
    if (!verified) {
      try {
        renameSync(yielded, lockDir);
      } catch {
        // A newer holder already owns the pathname; the yielded name is inert.
      }
      return;
    }
    removeVerifiedPrivateDirectory(yielded);
  } catch {
    // Release is a best-effort yield; an install's result never depends on it.
  }
}

export function acquireInstallLock(lockDir, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;
  const pollMs = options.pollMs ?? 250;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const signal = options.signal;
  const token = randomUUID();
  const record = `${JSON.stringify({
    formatVersion: LOCK_RECORD_VERSION,
    pid: process.pid,
    token,
    at: new Date().toISOString(),
  })}\n`;
  const self = { pid: process.pid, token };
  const throwIfCancelled = () => {
    if (signal?.aborted) throw installCancelled(lockDir);
  };
  const wait = async (ms) => {
    if (!signal) {
      await sleep(ms);
      return;
    }
    throwIfCancelled();
    let onAbort;
    const aborted = new Promise((_resolve, reject) => {
      onAbort = () => reject(installCancelled(lockDir));
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      await Promise.race([sleep(ms), aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  };
  return (async () => {
    const deadline = now() + timeoutMs;
    mkdirSync(dirname(lockDir), { recursive: true });
    sweepOrphanLockScratch(lockDir);
    for (;;) {
      throwIfCancelled();
      // A reclaimer can move this acquisition's freshly published lock aside
      // and restore it; recognizing our own {pid, token} adopts the restored
      // lock instead of waiting on our own record until the deadline (F3).
      const own = readLockOwnerRecord(lockDir);
      if (own.status === "parsed" && sameOwner(own.owner, self)) {
        try {
          const identity = statSync(lockDir);
          return () => releaseOwnedLock(lockDir, token, identity);
        } catch {
          // The lock moved again; fall through to a fresh classification.
        }
      }
      let exists = true;
      try {
        statSync(lockDir);
      } catch {
        exists = false;
      }
      let claimError = null;
      if (!exists) {
        // Owner publication is atomic: the complete record is written inside a
        // unique staging directory and the directory is renamed onto the lock
        // pathname in one step, so the pathname never exists without a
        // complete record. The existence check above means the rename is only
        // attempted on a vacancy, so an ownerless directory inside the stale
        // window is never silently replaced.
        const staging = `${lockDir}.new-${process.pid}-${randomUUID()}`;
        try {
          mkdirSync(staging, { recursive: false });
          writeFileSync(join(staging, "owner"), record);
          renameSync(staging, lockDir);
          const identity = statSync(lockDir);
          return () => releaseOwnedLock(lockDir, token, identity);
        } catch (error) {
          claimError = error;
          rmSync(staging, { recursive: true, force: true });
          if (!LOCK_BUSY_CODES.has(error?.code)) throw error;
        }
      }
      const observed = classifyLock(lockDir, now);
      if (observed.state === "foreign") throw installLockForeign(lockDir);
      if (observed.state === "abandoned" && reclaimAbandonedLock(lockDir, observed)) continue;
      if (now() >= deadline) throw installLockTimeout(lockDir, claimError);
      await wait(pollMs);
    }
  })();
}
