/**
 * Versioned runtime cache installation.
 *
 * Construction is independently safe: every installer builds the runtime in a
 * unique private staging directory, writes the ready marker into it, and then
 * publishes it with a single atomic rename to `<cacheRoot>/<version>/<target>`.
 * The first rename wins; every later promoter re-verifies the winner's ready
 * marker against the pinned manifest (sha256, entry hash, version, target) and
 * adopts it. No process ever deletes, rewrites, or replaces another
 * installer's published entry, and no failure of the advisory install lock can
 * fail or corrupt an install.
 *
 * The lock (see `cache.mjs`) only avoids duplicate work. A busy lock, a lock
 * this generation refuses to touch, or a crashed installer's staging is
 * handled by the publication path itself: concurrent installers may both
 * build, but exactly one artifact becomes the cache entry and all of them
 * agree on its verified bytes. Crashed staging directories are swept when
 * their recorded pid is gone.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { extractArchiveMembers, validateRuntimeArchive } from "./archive.mjs";
import { downloadArtifact, sha256File, stageLocalArtifact } from "./artifact.mjs";
import { acquireInstallLock, readReadyMarker, writeReadyMarker } from "./cache.mjs";
import { cacheTampered, cacheUnreadable, installCancelled } from "./errors.mjs";

const SHARED_INSTALL_SCRIPTS = [
  "scripts/server-release-install.mjs",
  "scripts/server-native-overlay.mjs",
];

/** Lock failures that only cost the duplicate-work optimization, never safety. */
const LOCK_DEGRADE_CODES = new Set([
  "PORACODE_RUNTIME_INSTALL_LOCK_TIMEOUT",
  "PORACODE_RUNTIME_INSTALL_LOCK_FOREIGN",
]);

/** Rename failures that mean the destination already exists (or cannot be replaced). */
const PROMOTION_BUSY_CODES = new Set(["ENOTEMPTY", "EEXIST", "EPERM", "ENOENT"]);

export function runtimeDirectory(cacheRoot, version, target) {
  return join(cacheRoot, version, target);
}

function assertReusable(runtimeDir, ready, entry, version, target) {
  if (ready.version !== version || ready.target !== target) {
    throw cacheTampered(
      runtimeDir,
      `the install record is for ${String(ready.version)}/${String(ready.target)}`,
    );
  }
  if (ready.tarballSha256 !== entry.sha256) {
    throw cacheTampered(runtimeDir, "the pinned artifact sha256 changed");
  }
  const entryFile = join(runtimeDir, "lib", "server.cjs");
  if (!existsSync(entryFile)) {
    throw cacheTampered(runtimeDir, "lib/server.cjs is missing");
  }
  if (sha256File(entryFile) !== ready.entrySha256) {
    throw cacheTampered(runtimeDir, "lib/server.cjs hash changed");
  }
  return runtimeDir;
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
 * Remove staging directories a crashed/killed install left behind. Only
 * directories for this exact version/target whose recorded pid is not alive
 * are touched, so a concurrent live install (however it acquired its lock) is
 * never disturbed.
 */
function sweepOrphanStaging(cacheRoot, version, target) {
  const prefix = `.staging-${version}-${target}-`;
  let entries;
  try {
    entries = readdirSync(cacheRoot);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!name.startsWith(prefix)) continue;
    const pid = Number.parseInt(name.slice(prefix.length).split("-")[0], 10);
    if (!Number.isSafeInteger(pid) || pid <= 0 || pidIsAlive(pid)) continue;
    rmSync(join(cacheRoot, name), { recursive: true, force: true });
  }
}

/** `rmdir`, never `rm -r`: it can only remove a directory that has no content. */
function removeEmptyDirectory(directory) {
  try {
    if (!statSync(directory).isDirectory()) return false;
    rmdirSync(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Publish the verified staging directory as the immutable cache entry. The
 * rename is the only writer to the entry pathname, so the first promoter wins;
 * a loser adopts the winner after re-verifying its marker, and a pre-existing
 * empty directory (a crash leftover) is removed with `rmdir` and the
 * promotion retried once. Markerless, corrupt, or unknown-generation content
 * is refused byte-for-byte, never replaced.
 */
function publishRuntime(runtimeDir, installedDir, entry, version, target) {
  mkdirSync(dirname(runtimeDir), { recursive: true });
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(installedDir, runtimeDir);
      return runtimeDir;
    } catch (error) {
      if (!PROMOTION_BUSY_CODES.has(error?.code)) throw error;
      // A vanished staging directory is an internal invariant violation, not a
      // cache conflict; surface the original failure.
      if (!existsSync(installedDir)) throw error;
      const winner = readReadyMarker(runtimeDir);
      if (winner) return assertReusable(runtimeDir, winner, entry, version, target);
      if (attempt === 0 && removeEmptyDirectory(runtimeDir)) continue;
      const late = readReadyMarker(runtimeDir);
      if (late) return assertReusable(runtimeDir, late, entry, version, target);
      throw cacheUnreadable(
        runtimeDir,
        "the path exists without a readable generation-1 install record; it is never replaced",
      );
    }
  }
}

/**
 * An existing entry either carries a readable generation-1 marker (handled by
 * the caller) or is an empty directory this launcher may replace atomically.
 * Anything else — an unknown future marker, a corrupt marker, or markerless
 * content — fails closed before any install work starts.
 */
function assertCachePathInstallable(runtimeDir) {
  let stat;
  try {
    stat = statSync(runtimeDir);
  } catch {
    return;
  }
  if (!stat.isDirectory()) throw cacheUnreadable(runtimeDir, "the cache path is not a directory");
  if (readdirSync(runtimeDir).length === 0) return;
  if (readReadyMarker(runtimeDir) !== null) return;
  throw cacheUnreadable(runtimeDir, "no readable generation-1 install record exists at this path");
}

/**
 * Return a verified runtime directory, installing it if necessary.
 * `resolveArtifact` is the injectable acquisition seam used by tests and the
 * qualification script; production omits it and downloads the pinned URL.
 */
export async function ensureRuntime(input) {
  const { version, target, entry, cacheRoot } = input;
  const runtimeDir = runtimeDirectory(cacheRoot, version, target);
  const existing = readReadyMarker(runtimeDir);
  if (existing) return assertReusable(runtimeDir, existing, entry, version, target);

  mkdirSync(join(cacheRoot, version), { recursive: true });
  assertCachePathInstallable(runtimeDir);
  const lockDir = join(cacheRoot, `${version}-${target}.lock`);
  let releaseLock = () => {};
  try {
    releaseLock = await acquireInstallLock(lockDir, {
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.lock
        ? {
            timeoutMs: input.lock.timeoutMs,
            pollMs: input.lock.pollMs,
            sleep: input.lock.sleep,
            now: input.lock.now,
          }
        : {}),
    });
  } catch (error) {
    // The lock is only an optimization; the publication path is independently
    // safe, so a busy or unfamiliar lock must never fail an install.
    if (!LOCK_DEGRADE_CODES.has(error?.code)) throw error;
  }
  try {
    if (input.signal?.aborted) throw installCancelled(lockDir);
    const afterLock = readReadyMarker(runtimeDir);
    if (afterLock) return assertReusable(runtimeDir, afterLock, entry, version, target);
    sweepOrphanStaging(cacheRoot, version, target);

    const stagingRoot = join(
      cacheRoot,
      `.staging-${version}-${target}-${process.pid}-${randomUUID()}`,
    );
    mkdirSync(stagingRoot, { recursive: false });
    try {
      const tarballPath = join(stagingRoot, "runtime.tar.gz");
      if (typeof input.resolveArtifact === "function") {
        const resolved = await input.resolveArtifact({
          version,
          target,
          entry,
          destination: tarballPath,
        });
        if (typeof resolved === "string") {
          stageLocalArtifact(resolved, entry, tarballPath);
        } else if (resolved && typeof resolved.sha256 === "string") {
          if (resolved.sha256 !== entry.sha256) {
            throw cacheTampered(tarballPath, "injected resolver returned a different sha256");
          }
          stageLocalArtifact(resolved.path, entry, tarballPath);
        } else {
          throw new Error("resolveArtifact must return a local tarball path");
        }
      } else if (typeof input.localTarball === "string") {
        stageLocalArtifact(input.localTarball, entry, tarballPath);
      } else {
        await downloadArtifact(entry, tarballPath, {
          ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
          ...(input.signal ? { signal: input.signal } : {}),
        });
      }

      validateRuntimeArchive({ tarball: tarballPath, ...(input.run ? { run: input.run } : {}) });
      const bootstrapDir = join(stagingRoot, "bootstrap");
      extractArchiveMembers({
        tarball: tarballPath,
        destination: bootstrapDir,
        members: SHARED_INSTALL_SCRIPTS,
        ...(input.run ? { run: input.run } : {}),
      });
      const installModulePath = join(bootstrapDir, "scripts", "server-release-install.mjs");
      if (!existsSync(installModulePath)) {
        throw new Error(
          "The runtime artifact does not ship scripts/server-release-install.mjs; it was not " +
            "built by this release train. Reinstall the poracode package or pin a newer version.",
        );
      }
      const installModule = await import(pathToFileURL(installModulePath).href);
      const installedDir = join(stagingRoot, "runtime");
      installModule.installServerRelease({
        tarball: tarballPath,
        releaseDir: installedDir,
        ...(input.run ? { run: input.run } : {}),
        ...(input.npm ? { npm: input.npm } : {}),
      });
      const entryFile = join(installedDir, "lib", "server.cjs");
      if (!existsSync(entryFile)) {
        throw new Error(`The runtime artifact did not install lib/server.cjs (${entryFile})`);
      }
      writeReadyMarker(installedDir, {
        version,
        target,
        tarballSha256: entry.sha256,
        entrySha256: sha256File(entryFile),
        installedAt: new Date().toISOString(),
      });
      publishRuntime(runtimeDir, installedDir, entry, version, target);
    } finally {
      rmSync(stagingRoot, { recursive: true, force: true });
    }
  } finally {
    releaseLock();
  }
  return runtimeDir;
}
