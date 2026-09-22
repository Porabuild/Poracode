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

/** A requested member does not exist in the archive's validated listing. */
export class MissingArchiveMemberError extends Error {
  constructor(member) {
    super(
      `The runtime archive does not contain ${member}; it was not built by this release ` +
        "train. Reinstall the poracode package or pin a newer version.",
    );
    this.name = "MissingArchiveMemberError";
    this.code = "PORACODE_RUNTIME_ARCHIVE_MEMBER_MISSING";
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

/**
 * Canonical spelling of an archive member: "/"-separated with no empty or "."
 * segments. Archive entries always use "/" no matter the host platform, so
 * this must not go through `path.normalize` (host separator semantics).
 */
function canonicalArchiveMember(entry) {
  return entry
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join("/");
}

/**
 * Map each requested member to the archive entry that carries it, so
 * extraction uses the tar flavor's own stored spelling. Archives built by a
 * directory walk keep the leading "./" GNU tar emits ("./scripts/x"), while
 * bsdtar strips it ("scripts/x") — and GNU tar matches extraction requests
 * against the stored spelling only, so a canonicalized request fails there
 * with "Not found in archive". `names` must be the listing
 * `validateRuntimeArchive` already vetted and returned: every resolved name is
 * replayed verbatim from that listing, so resolution can never introduce a
 * name the safety checks did not see, and the archive is not listed again.
 */
export function resolveArchiveMembers(names, members) {
  if (!Array.isArray(names)) {
    throw new Error(
      "resolveArchiveMembers needs the validated listing from validateRuntimeArchive",
    );
  }
  const stored = new Map();
  for (const entry of names) {
    const key = canonicalArchiveMember(entry);
    if (!stored.has(key)) stored.set(key, entry);
  }
  const resolved = [];
  for (const member of members) {
    if (!isContainedRelativePath(member)) {
      throw new UnsafeRuntimeArchiveError(
        `Refusing to extract the runtime: requested member escapes the install directory (${member}).`,
      );
    }
    const entry = stored.get(canonicalArchiveMember(member));
    if (entry === undefined) throw new MissingArchiveMemberError(member);
    resolved.push(entry);
  }
  return resolved;
}

/**
 * Extract the named members of a validated archive (the shared install
 * scripts). `names` must be the listing `validateRuntimeArchive` returned:
 * members are resolved against it so the tar invocation uses each entry's
 * stored spelling, without listing the archive a second time.
 */
export function extractArchiveMembers(options) {
  const run = options.run ?? defaultRun;
  const tar = options.tar ?? "tar";
  const members = resolveArchiveMembers(options.names, options.members);
  mkdirSync(options.destination, { recursive: true });
  // An empty member list must extract nothing, not everything: `tar -x` with
  // no members unpacks the whole archive.
  if (members.length > 0) {
    run(tar, ["-xzf", options.tarball, "-C", options.destination, ...members], {
      stdio: "pipe",
    });
  }
}

function defaultRun(command, args, runOptions = {}) {
  return execFileSync(command, args, { stdio: "pipe", ...runOptions });
}
