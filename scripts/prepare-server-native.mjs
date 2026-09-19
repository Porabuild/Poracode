import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(repoRoot, "dist", "server-native");

// docs/STANDALONE_SERVER.md §8: glibc and musl Linux targets are distinguished
// because the prebuild directory names differ (`linux-*` vs `linuxmusl-*`).
const platform =
  process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime
    ? "linuxmusl"
    : process.platform;

function stageBetterSqlite3() {
  const betterSqliteRoot = dirname(require.resolve("better-sqlite3/package.json"));
  const binding = join(betterSqliteRoot, "prebuilds", `${platform}-${process.arch}.node`);
  const outputFile = join(outputDir, "better_sqlite3.node");

  // Validate the installed binary before replacing any previous-generation artifact.
  const Database = require("better-sqlite3");
  new Database(":memory:", { nativeBinding: binding }).close();
  mkdirSync(outputDir, { recursive: true });
  copyFileSync(binding, outputFile);
  console.log(`[poracode-server] prepared better-sqlite3 N-API binding: ${outputFile}`);
}

/**
 * Stage the node-pty native assets for the server bundle (plan item 4.9,
 * finding H7). node-pty 1.1.0 resolves `pty.node` from `build/Release`, then
 * `build/Debug`, then `prebuilds/<platform>-<arch>/`, and loads `spawn-helper`
 * from the SAME directory as the binding it loaded (lib/utils.js). Its npm
 * install probe (`scripts/prebuild.js`) exits 0 — skipping the node-gyp
 * toolchain requirement — exactly when `prebuilds/<platform>-<arch>/` exists.
 *
 * The staged layout therefore mirrors that contract: an install prefix copies
 * `dist/server-native/node-pty/<platform>-<arch>/` into
 * `node_modules/node-pty/prebuilds/<platform>-<arch>/` BEFORE the package's
 * install probe, so the platform needs no C/C++ toolchain. `overlay.json`
 * records versions and hashes so an install can verify what it overlays.
 *
 * On a checked-out tree whose platform prebuild is absent (Linux without the
 * CI-built artifact), the local node-gyp build output is staged instead — the
 * same binary the install would have produced, just built here.
 */
function stageNodePty() {
  const nodePtyRoot = dirname(require.resolve("node-pty/package.json"));
  const version = require("node-pty/package.json").version;
  const prebuildDir = join(nodePtyRoot, "prebuilds", `${platform}-${process.arch}`);
  const prebuildBinding = join(prebuildDir, "pty.node");
  const builtBinding = join(nodePtyRoot, "build", "Release", "pty.node");
  const binding = existsSync(prebuildBinding) ? prebuildBinding : builtBinding;
  if (!existsSync(binding)) {
    throw new Error(
      `[poracode-server] node-pty binding not found for ${platform}-${process.arch} ` +
        `(checked ${prebuildBinding} and ${builtBinding}). Install dependencies with ` +
        "native builds approved (`pnpm approve-builds`), or provide the platform prebuild.",
    );
  }
  const spawnHelper = join(prebuildDir, "spawn-helper");
  const stagedDir = join(outputDir, "node-pty", `${platform}-${process.arch}`);
  const stagedBinding = join(stagedDir, "pty.node");

  // Validate the whole package loads (mirrors scripts/ensure-native-deps.mjs);
  // a binding that cannot be loaded by its own runtime must not be staged.
  require("node-pty");
  mkdirSync(stagedDir, { recursive: true });
  copyFileSync(binding, stagedBinding);
  const stagedFiles = ["pty.node"];
  if (existsSync(spawnHelper)) {
    copyFileSync(spawnHelper, join(stagedDir, "spawn-helper"));
    stagedFiles.push("spawn-helper");
  }
  const overlayManifest = {
    formatVersion: 1,
    package: "node-pty",
    version,
    platform,
    arch: process.arch,
    /** Copy these into node_modules/node-pty/prebuilds/<platform>-<arch>/
     * before node-pty's install probe (scripts/prebuild.js) so the package
     * skips node-gyp and its runtime loader finds them. */
    overlayTarget: `node_modules/node-pty/prebuilds/${platform}-${process.arch}`,
    /** sha256 per staged file, keyed by file name, so an install verifies the
     * overlay it applies. */
    stagedSha256: Object.fromEntries(
      stagedFiles.map((name) => [
        name,
        createHash("sha256")
          .update(readFileSync(join(stagedDir, name)))
          .digest("hex"),
      ]),
    ),
  };
  writeFileSync(
    join(outputDir, "node-pty", "overlay.json"),
    `${JSON.stringify(overlayManifest, null, 2)}\n`,
  );
  console.log(`[poracode-server] prepared node-pty ${version} assets: ${stagedDir}`);
}

try {
  stageBetterSqlite3();
  stageNodePty();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
