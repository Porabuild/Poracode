/**
 * Pre-extraction safety guard for the downloaded runtime tarball.
 *
 * The archive is untrusted input: before any of its content is written or
 * executed, every entry must be a contained relative path and no entry may be
 * a symlink or hardlink. Only the two shared install scripts are extracted
 * here; the full release-directory install then runs through the shipped
 * `scripts/server-release-install.mjs`, so extraction/overlay/install logic is
 * not duplicated in this package.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { isAbsolute, normalize, sep } from "node:path";

export class UnsafeRuntimeArchiveError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeRuntimeArchiveError";
  }
}

function isContainedRelativePath(entry) {
  if (typeof entry !== "string" || entry.length === 0) return false;
  if (isAbsolute(entry) || /^[A-Za-z]:[\\/]/u.test(entry) || entry.startsWith("\\\\")) return false;
  const normalized = normalize(entry);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return false;
  return !normalized.split(/[\\/]/u).includes("..");
}

export function validateRuntimeArchive(options) {
  const run = options.run ?? defaultRun;
  const tar = options.tar ?? "tar";
  const names = run(tar, ["-tzf", options.tarball], { encoding: "utf8" })
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ".");
  for (const entry of names) {
    if (!isContainedRelativePath(entry)) {
      throw new UnsafeRuntimeArchiveError(
        `Refusing to extract the runtime: entry escapes the install directory (${entry}).`,
      );
    }
  }
  const verbose = run(tar, ["-tvzf", options.tarball], { encoding: "utf8" })
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  for (const line of verbose) {
    const type = line.trimStart()[0];
    if (type === "l" || type === "h") {
      throw new UnsafeRuntimeArchiveError(
        `Refusing to extract the runtime: link entry is not allowed (${line.trim()}).`,
      );
    }
  }
  return names;
}

/** Extract the named members of a validated archive (the shared install scripts). */
export function extractArchiveMembers(options) {
  const run = options.run ?? defaultRun;
  const tar = options.tar ?? "tar";
  mkdirSync(options.destination, { recursive: true });
  run(tar, ["-xzf", options.tarball, "-C", options.destination, ...options.members], {
    stdio: "pipe",
  });
}

function defaultRun(command, args, runOptions = {}) {
  return execFileSync(command, args, { stdio: "pipe", ...runOptions });
}
