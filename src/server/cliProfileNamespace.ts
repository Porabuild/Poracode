import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { canonicalHostPath } from "@/backend/ownership/hostRootPaths";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  closeSync,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { isNightlyRelease } from "./cliReleaseVersion";

/** Determine lookup behavior without modifying profile data. */
function hasCaseInsensitiveLookup(directory: string): boolean {
  const entries = readdirSync(directory);
  for (const name of entries) {
    const index = name.search(/[A-Za-z]/u);
    if (index < 0) continue;
    const character = name[index]!;
    const alternate =
      name.slice(0, index) +
      (character === character.toUpperCase() ? character.toLowerCase() : character.toUpperCase()) +
      name.slice(index + 1);
    if (entries.includes(alternate)) return false;
    const originalPath = join(directory, name);
    const alternatePath = join(directory, alternate);
    try {
      const original = lstatSync(originalPath);
      try {
        const other = lstatSync(alternatePath);
        return original.dev === other.dev && original.ino === other.ino;
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
          throw error;
        const stillOriginal = lstatSync(originalPath);
        if (original.dev === stillOriginal.dev && original.ino === stillOriginal.ino) return false;
      }
    } catch {
      // Another process may have changed the entry; try another name.
    }
  }
  // An empty directory has no existing entry to compare. Create one uniquely
  // owned temporary file and remove only that same inode after checking it.
  const name = `.poracode-case-${randomBytes(16).toString("hex")}a`;
  const path = join(directory, name);
  const alternate = join(directory, `${name.slice(0, -1)}A`);
  const fd = openSync(path, "wx", 0o600);
  let original: ReturnType<typeof fstatSync> | undefined;
  let insensitive = false;
  let failure: unknown;
  let failed = false;
  try {
    original = fstatSync(fd);
    try {
      const other = lstatSync(alternate);
      insensitive = original.dev === other.dev && original.ino === other.ino;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT")
        throw error;
    }
  } catch (error) {
    failure = error;
    failed = true;
  }
  try {
    closeSync(fd);
  } catch (error) {
    if (!failed) {
      failure = error;
      failed = true;
    }
  }
  try {
    const current = lstatSync(path);
    if (original && current.dev === original.dev && current.ino === original.ino) unlinkSync(path);
  } catch (error) {
    if (
      (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") &&
      !failed
    ) {
      failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
  return insensitive;
}

export function sameChannelProfile(
  left: string,
  right: string,
  caseInsensitive = hasCaseInsensitiveLookup,
): boolean {
  const first = canonicalHostPath(left);
  const second = canonicalHostPath(right);
  if (first === second) return true;
  if (first.toLowerCase() !== second.toLowerCase()) return false;
  return caseInsensitive(dirname(second));
}

/**
 * Standalone nightly releases must not implicitly open a stable desktop's
 * profile. An explicit namespace remains an operator-selected override.
 */
export function defaultCliProfileNamespace(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
  home?: string,
): string {
  const explicit = env.PORACODE_BASE_DIR?.trim();
  if (explicit) return explicit;
  return resolvePoracodeBaseDir(isNightlyRelease(version) ? "nightly" : "stable", home);
}

/** Move only channel-default profiles; a custom profile is an explicit choice. */
export function serviceProfileForRelease(
  version: string,
  currentProfile: string,
  home = homedir(),
): string | undefined {
  const stable = canonicalHostPath(resolvePoracodeBaseDir("stable", home));
  const nightly = canonicalHostPath(resolvePoracodeBaseDir("nightly", home));
  if (!sameChannelProfile(currentProfile, stable) && !sameChannelProfile(currentProfile, nightly))
    return undefined;
  return isNightlyRelease(version) ? nightly : stable;
}

/** The opposite channel's default namespace is never a valid implicit target. */
export function assertChannelProfileNamespace(
  version: string,
  profile: string,
  home = homedir(),
): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) return;
  const other = canonicalHostPath(
    resolvePoracodeBaseDir(isNightlyRelease(version) ? "stable" : "nightly", home),
  );
  if (sameChannelProfile(profile, other)) {
    throw new Error(
      `This ${isNightlyRelease(version) ? "nightly" : "stable"} release cannot start or modify the other channel's default profile ${other}. Migrate the service to its own channel profile first.`,
    );
  }
}

export function legacyProfileNotice(
  version: string,
  selected: string,
  home = homedir(),
): string | undefined {
  if (!isNightlyRelease(version)) return undefined;
  const stable = resolvePoracodeBaseDir("stable", home);
  const nightly = resolvePoracodeBaseDir("nightly", home);
  if (!sameChannelProfile(selected, nightly) || existsSync(`${nightly}.host-v1`)) return undefined;
  if (!existsSync(`${stable}.host-v1`) && !existsSync(join(stable, "state.sqlite")))
    return undefined;
  return `The existing stable profile at ${stable} is preserved. Nightly uses the separate profile ${nightly}.`;
}
