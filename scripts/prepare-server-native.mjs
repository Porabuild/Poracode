import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(repoRoot, "dist", "server-native");

/**
 * Overlay manifest boundary (docs/.agents/docs/versioning.md): formatVersion 2
 * carries one staged prebuild per TARGET so one tarball can serve several
 * machine shapes (V6 D.2: Linux x64 and arm64). Readers
 * (`serverNativeOverlay.ts`, `install-server-prefix.mjs`) still accept
 * formatVersion 1 — a single host-shaped target — so an older staged tree
 * keeps applying.
 */
const OVERLAY_FORMAT_VERSION = 2;

// docs/STANDALONE_SERVER.md §8: glibc and musl Linux targets are distinguished
// because the prebuild directory names differ (`linux-*` vs `linuxmusl-*`).
const platformKey =
  process.platform === "linux" && !process.report.getReport().header.glibcVersionRuntime
    ? "linuxmusl"
    : process.platform;

/** V6 D.2 machine shapes carried in addition to the packaging host's own. */
export const CROSS_TARGETS = ["linux-x64", "linux-arm64", "linuxmusl-x64", "linuxmusl-arm64"];

/** The packaging host's own `platform-arch` key (docs/STANDALONE_SERVER.md §8). */
export function hostPlatformKey() {
  return platformKey;
}

/** Directory a CI job can drop cross-built bindings into: `<target>/pty.node`. */
function crossBindingsDir() {
  return (
    process.env.PORACODE_NODE_PTY_CROSS_BINDINGS?.trim() ||
    join(repoRoot, "dist", "server-native-cross")
  );
}

/** Optional published-prebuild download: `PORACODE_NODE_PTY_PREBUILD_URL_LINUX_ARM64`. */
function prebuildDownloadUrl(target) {
  const variable = `PORACODE_NODE_PTY_PREBUILD_URL_${target.toUpperCase().replaceAll("-", "_")}`;
  return process.env[variable]?.trim() || null;
}

function crossSourcesConfigured() {
  return (
    existsSync(crossBindingsDir()) || CROSS_TARGETS.some((target) => prebuildDownloadUrl(target))
  );
}

export function parseRequireTargets(argv) {
  const required = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--require-target") {
      const value = argv[++index];
      if (!value) throw new Error("--require-target needs a <platform>-<arch> value");
      required.push(value);
    } else if (argv[index]?.startsWith("--")) {
      throw new Error(`Unknown option: ${argv[index]}`);
    }
  }
  return required;
}

/**
 * V6 D.2: `--require-target` is satisfied only when EVERY staged native module
 * covers the target — node-pty coverage alone does not make the overlay
 * installable, the better-sqlite3 prebuild must ship too. Returns the
 * `<module>/<target>` pairs that are missing; the caller fails the build when
 * any are.
 */
export function missingRequiredTargets(requiredTargets, stagedByModule) {
  const missing = [];
  for (const target of requiredTargets) {
    for (const [moduleName, stagedTargets] of Object.entries(stagedByModule)) {
      if (!stagedTargets.includes(target)) missing.push(`${moduleName}/${target}`);
    }
  }
  return missing;
}

/**
 * Stage the better-sqlite3 N-API bindings: the host binding next to the server
 * bundle (`better_sqlite3.node`, load-validated) plus one prebuild per D.2
 * cross target into `better-sqlite3/<target>.node` (the layout
 * `install-server-prefix.mjs` picks up from the tarball's `native-overlay/`).
 * Parameterized (`moduleRoot`/`destinationDir`/`validateBinding`) so tests can
 * stage hermetically. Returns every target the overlay now covers.
 */
export function stageBetterSqlite3({
  requiredTargets = [],
  moduleRoot = dirname(require.resolve("better-sqlite3/package.json")),
  destinationDir = outputDir,
  validateBinding = true,
} = {}) {
  const prebuildDir = join(moduleRoot, "prebuilds");
  const binding = join(prebuildDir, `${platformKey}-${process.arch}.node`);
  const outputFile = join(destinationDir, "better_sqlite3.node");

  // Validate the installed binary before replacing any previous-generation artifact.
  if (validateBinding) {
    const Database = require("better-sqlite3");
    new Database(":memory:", { nativeBinding: binding }).close();
  }
  mkdirSync(destinationDir, { recursive: true });
  copyFileSync(binding, outputFile);

  const stagedTargets = [`${platformKey}-${process.arch}`];
  for (const target of CROSS_TARGETS) {
    const source = join(prebuildDir, `${target}.node`);
    if (!existsSync(source)) {
      const message = `[poracode-server] no better-sqlite3 prebuild for ${target}: checked ${source}.`;
      if (requiredTargets.includes(target)) throw new Error(message);
      console.warn(`[poracode-server] WARNING ${message} The overlay will not cover it.`);
      continue;
    }
    const destDir = join(destinationDir, "better-sqlite3");
    mkdirSync(destDir, { recursive: true });
    copyFileSync(source, join(destDir, `${target}.node`));
    stagedTargets.push(target);
    console.log(`[poracode-server] staged better-sqlite3 ${target}.node`);
  }
  console.log(`[poracode-server] prepared better-sqlite3 N-API binding: ${outputFile}`);
  return stagedTargets;
}

/**
 * Stage the node-pty native assets for the server bundle (plan item 4.9,
 * finding H7). node-pty 1.1.0 resolves `pty.node` from `build/Release`, then
 * `build/Debug`, then `prebuilds/<platform>-<arch>/`, and loads `spawn-helper`
 * from the SAME directory as the binding it loaded (lib/utils.js). Its npm
 * install probe (`scripts/prebuild.js`) exits 0 — skipping the node-gyp
 * toolchain requirement — exactly when `prebuilds/<platform>-<arch>/` exists.
 *
 * The staged layout therefore mirrors that contract: an install copies
 * `dist/server-native/node-pty/<platform>-<arch>/` into
 * `node_modules/node-pty/prebuilds/<platform>-<arch>/` BEFORE the package's
 * install probe, so the platform needs no C/C++ toolchain. `overlay.json`
 * (formatVersion 2) records one entry per staged target with per-file sha256
 * so an install verifies the target it applies.
 *
 * Upstream node-pty publishes no Linux prebuilds (docs/STANDALONE_SERVER.md
 * §8), so beyond the host target — prebuild when present, otherwise the local
 * node-gyp build output — each D.2 cross target is staged from, in order:
 *   1. the package's own `prebuilds/<target>/` (future upstream releases),
 *   2. `PORACODE_NODE_PTY_CROSS_BINDINGS/<target>/pty.node` (a CI job builds
 *      it via `docker run --platform linux/arm64` or a cross toolchain),
 *   3. a published prebuild download via
 *      `PORACODE_NODE_PTY_PREBUILD_URL_<TARGET>` (`.sha256` sidecar honored).
 * A cross target that cannot be obtained is skipped with a warning unless
 * `--require-target <platform>-<arch>` names it (CI passes that to fail the
 * build when the shipped overlay would not cover an advertised shape).
 * Returns the staged target directories for the require-target coverage check.
 */
async function stageNodePty(requiredTargets) {
  const nodePtyRoot = dirname(require.resolve("node-pty/package.json"));
  const version = require("node-pty/package.json").version;
  const stagedTargets = [];
  const hostTarget = `${platformKey}-${process.arch}`;

  const staged = (target, files) => {
    stagedTargets.push({
      platform: target.split("-")[0],
      arch: target.split("-")[1],
      dir: target,
      /** Copy these into node_modules/node-pty/prebuilds/<target>/ before
       * node-pty's install probe (scripts/prebuild.js) so the package skips
       * node-gyp and its runtime loader finds them. */
      overlayTarget: `node_modules/node-pty/prebuilds/${target}`,
      stagedSha256: Object.fromEntries(
        files.map((name) => [
          name,
          createHash("sha256")
            .update(readFileSync(join(outputDir, "node-pty", target, name)))
            .digest("hex"),
        ]),
      ),
    });
  };

  const stageFrom = (target, sourceDir) => {
    const binding = join(sourceDir, "pty.node");
    if (!existsSync(binding)) return false;
    const stagedDir = join(outputDir, "node-pty", target);
    mkdirSync(stagedDir, { recursive: true });
    copyFileSync(binding, join(stagedDir, "pty.node"));
    const files = ["pty.node"];
    const spawnHelper = join(sourceDir, "spawn-helper");
    if (existsSync(spawnHelper)) {
      copyFileSync(spawnHelper, join(stagedDir, "spawn-helper"));
      files.push("spawn-helper");
    }
    staged(target, files);
    console.log(`[poracode-server] staged node-pty ${version} ${target}: ${stagedDir}`);
    return true;
  };

  const download = async (target, destinationDir) => {
    const url = prebuildDownloadUrl(target);
    if (!url) return false;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`prebuild download for ${target} failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const checksumResponse = await fetch(`${url}.sha256`).catch(() => undefined);
    if (checksumResponse?.ok) {
      const expected = (await checksumResponse.text()).trim().split(/\s+/u)[0];
      const actual = createHash("sha256").update(bytes).digest("hex");
      if (actual !== expected) {
        throw new Error(`prebuild download for ${target} failed its .sha256 sidecar`);
      }
    }
    mkdirSync(destinationDir, { recursive: true });
    writeFileSync(join(destinationDir, "pty.node"), bytes);
    return true;
  };

  // Host target first: required, and load-validated like ensure-native-deps.
  const hostPrebuildDir = join(nodePtyRoot, "prebuilds", hostTarget);
  const hostBuiltDir = join(nodePtyRoot, "build", "Release");
  if (
    !existsSync(join(hostPrebuildDir, "pty.node")) &&
    !existsSync(join(hostBuiltDir, "pty.node"))
  ) {
    throw new Error(
      `[poracode-server] node-pty binding not found for ${hostTarget} ` +
        `(checked ${join(hostPrebuildDir, "pty.node")} and ${join(hostBuiltDir, "pty.node")}). ` +
        "Install dependencies with native builds approved (`pnpm approve-builds`), or provide " +
        "the platform prebuild.",
    );
  }
  require("node-pty"); // A binding the host runtime cannot load must not be staged.
  stageFrom(
    hostTarget,
    existsSync(join(hostPrebuildDir, "pty.node")) ? hostPrebuildDir : hostBuiltDir,
  );

  // Cross targets: optional unless --require-target names them.
  if (platformKey.toString().startsWith("linux") || crossSourcesConfigured()) {
    for (const target of CROSS_TARGETS) {
      if (target === hostTarget || stagedTargets.some((entry) => entry.dir === target)) continue;
      const crossSource = join(crossBindingsDir(), target);
      if (existsSync(join(crossSource, "pty.node"))) {
        stageFrom(target, crossSource);
        continue;
      }
      if (await download(target, join(outputDir, "node-pty", target))) {
        staged(target, ["pty.node"]);
        console.log(
          `[poracode-server] staged node-pty ${version} ${target} from ${prebuildDownloadUrl(target)}`,
        );
        continue;
      }
      const message =
        `[poracode-server] no node-pty prebuild for ${target}: checked ` +
        `${join(nodePtyRoot, "prebuilds", target)}, ${crossSource}, and ` +
        `${prebuildDownloadUrl(target) ?? "no download URL"}.`;
      if (requiredTargets.includes(target)) throw new Error(message);
      console.warn(`[poracode-server] WARNING ${message} The overlay will not cover it.`);
    }
  }

  const overlayManifest = {
    formatVersion: OVERLAY_FORMAT_VERSION,
    package: "node-pty",
    version,
    targets: stagedTargets,
  };
  writeFileSync(
    join(outputDir, "node-pty", "overlay.json"),
    `${JSON.stringify(overlayManifest, null, 2)}\n`,
  );
  console.log(
    `[poracode-server] prepared node-pty ${version} overlay targets: ` +
      `${stagedTargets.map((entry) => entry.dir).join(", ")}`,
  );
  return stagedTargets.map((entry) => entry.dir);
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  try {
    const requiredTargets = parseRequireTargets(process.argv.slice(2));
    const stagedByModule = {
      "better-sqlite3": stageBetterSqlite3({ requiredTargets }),
      "node-pty": await stageNodePty(requiredTargets),
    };
    const missing = missingRequiredTargets(requiredTargets, stagedByModule);
    if (missing.length > 0) {
      throw new Error(
        `[poracode-server] required native target(s) were not staged: ${missing.join(", ")}.`,
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
