import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTar, tarCommand } from "../../scripts/server-host-tools.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Run one tar operation with the host's resolved tar (bsdtar on Windows, never Git-bash GNU tar). */
export function runTar(
  args: readonly string[],
  options: { encoding?: "utf8"; maxBuffer?: number; stdio?: "pipe" } = {},
) {
  const [command, commandArgs] = tarCommand(resolveTar(), [...args]) as [string, string[]];
  return execFileSync(command, commandArgs, options as never) as unknown as string;
}

/** Test hook so the required-mode failure is verifiable without touching dist/. */
function defaultDistDir() {
  return process.env.PORACODE_SERVER_DIST_DIR?.trim() || join(repoRoot, "dist");
}

/**
 * The current assembly recipe ships `scripts/server-release-install.mjs`, and
 * the install path refuses archives carrying symlink entries. A stale tarball
 * from an older recipe cannot be installed by design, so skip instead of
 * failing on unrelated dist/ leftovers.
 */
export function findTarball(distDir: string = defaultDistDir()): string | null {
  if (!existsSync(distDir)) return null;
  const tarballs = readdirSync(distDir)
    .filter((name) => name.startsWith("poracode-server-") && name.endsWith(".tar.gz"))
    .sort()
    .reverse();
  for (const name of tarballs) {
    const path = join(distDir, name);
    try {
      const listing = runTar(["-tzf", path], { encoding: "utf8" });
      if (listing.includes("scripts/server-release-install.mjs")) return path;
    } catch {
      // Unreadable candidate; try the next one.
    }
  }
  return null;
}

/**
 * A pre-D4 bundle cannot answer the authenticated status/admit operations.
 * The bundler assigns the ownership server to whichever lib/ chunk the
 * production build needs (minified builds split it out of the entrypoint),
 * so scan the shipped lib/ closure instead of only lib/server.cjs.
 */
export function tarballSupportsD4(path: string): boolean {
  let stage: string | null = null;
  try {
    const members = runTar(["-tzf", path], { encoding: "utf8" }).split(/\r?\n/u);
    if (!members.some((member) => member.replace(/^\.\//u, "") === "lib/server.cjs")) return false;
    stage = mkdtempSync(join(tmpdir(), "poracode-d4-sniff-"));
    runTar(["-xzf", path, "-C", stage], { stdio: "pipe" });
    const libDir = join(stage, "lib");
    return readdirSync(libDir)
      .filter((name) => name.endsWith(".cjs"))
      .some((name) => {
        const chunk = readFileSync(join(libDir, name), { encoding: "utf8" });
        return chunk.includes("not-staging") && chunk.includes("identity-mismatch");
      });
  } catch {
    return false;
  } finally {
    if (stage) rmSync(stage, { recursive: true, force: true });
  }
}
