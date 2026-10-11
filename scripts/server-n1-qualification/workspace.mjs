/**
 * Workspace filesystem helpers for the N-1 qualification run: file hashing,
 * the outside-the-checkout prefix guard, scratch repo init, and the
 * platform-shaped project location.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function assertPrefixOutsideCheckout(prefix, repoRoot) {
  const resolvedPrefix = resolve(prefix);
  const resolvedRoot = resolve(repoRoot);
  const rel = relative(resolvedRoot, resolvedPrefix);
  if (!isAbsolute(resolvedPrefix) || rel === "" || !rel.startsWith(`..${sep}`)) {
    throw new Error(
      `install prefix must live outside the checkout: ${resolvedPrefix} is inside ${resolvedRoot}`,
    );
  }
}

export function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 60_000 });
  if (run(["init"]).status !== 0) throw new Error(`git init failed in ${dir}`);
  writeFileSync(join(dir, "README.md"), "n1 qualification\n");
  run(["add", "README.md"]);
  const commit = run([
    "-c",
    "user.email=n1qual@poracode.local",
    "-c",
    "user.name=n1qual",
    "commit",
    "-m",
    "init",
  ]);
  if (commit.status !== 0) throw new Error(`git commit failed in ${dir}`);
}

export function makeProjectLocation(cwd) {
  return process.platform === "win32"
    ? { kind: "windows", path: cwd }
    : { kind: "posix", path: cwd };
}
