#!/usr/bin/env node
/**
 * Assemble the published standalone-server tarball (docs/STANDALONE_SERVER.md §3.2).
 *
 * One recipe used by qualification and release (plan D3): copies the union of
 * `*.ssh-runtime-manifest.json` files into `lib/`, layout resources, the
 * compatible web client into `renderer/`, the native overlay from
 * `dist/server-native`, the shared install/overlay scripts, the thin prefix
 * installer operators bootstrap from the verified artifact, the shipped
 * systemd unit, the license, and a pinned `package.json` plus a generated
 * `npm-shrinkwrap.json` (frozen transitive closure). It then emits immutable
 * `server-artifact.json` provenance next to the tarball.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateNpmShrinkwrap,
  pinInstalledVersions,
  readRuntimeClosure,
  sha256File,
  writeStagePackageJson,
} from "./runtime-closure.mjs";
import { writeServerArtifactMetadata } from "./server-artifact-metadata.mjs";
import {
  overlayTargets,
  readBetterSqlite3Overlay,
  readNodePtyOverlay,
  runtimePlatformKey,
} from "./server-native-overlay.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * V6 F.1 build-time assertion: the standalone server bundle must never import
 * Electron. Catches static and dynamic imports plus bare `require("electron")`
 * in any staged JavaScript file.
 */
const ELECTRON_IMPORT_PATTERN =
  /(?:from\s+["']electron(?:\/[^"']*)?["']|import\s+["']electron["']|import\s*\(\s*["']electron["']\s*\)|require\s*\(\s*["']electron["']\s*\)|require\s*\(\s*["']electron\/[^"']+["']\s*\))/u;

function assertNoElectronImport(path, bytes) {
  if (!/\.(?:js|cjs|mjs)$/u.test(path)) return;
  if (ELECTRON_IMPORT_PATTERN.test(bytes.toString("utf8"))) {
    throw new Error(
      `Server bundle file ${path} imports electron — the standalone host must stay Electron-free (V6 F.1).`,
    );
  }
}

function parseArgs(argv) {
  let outDir = join(repoRoot, "dist");
  let mainBundleDir = join(repoRoot, "dist", "main");
  let overlaySource = join(repoRoot, "dist", "server-native");
  let webDir = join(repoRoot, "dist", "web");
  const targets = [];
  let apiOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out-dir") {
      outDir = resolve(argv[++index]);
    } else if (argument === "--main-bundle-dir") {
      mainBundleDir = resolve(argv[++index]);
    } else if (argument === "--overlay-source") {
      overlaySource = resolve(argv[++index]);
    } else if (argument === "--web-dir") {
      webDir = resolve(argv[++index]);
    } else if (argument === "--target") {
      const value = argv[++index];
      if (!value) throw new Error("--target needs a <platform>-<arch> value");
      targets.push(value);
    } else if (argument === "--api-only") {
      apiOnly = true;
    } else {
      throw new Error(`Unknown option: ${argument}`);
    }
  }
  return { outDir, mainBundleDir, overlaySource, webDir, targets, apiOnly };
}

/**
 * Every advertised target must be covered by BOTH staged native modules. The
 * overlay records its own targets; a missing shape fails the build instead of
 * publishing an artifact that cannot install there.
 */
export function assertTargetCoverage(overlayRoot, targets) {
  const nodePtyDirs = overlayTargets(readNodePtyOverlay(overlayRoot)).map((target) => target.dir);
  const sqliteOverlay = readBetterSqlite3Overlay(overlayRoot);
  const sqliteDirs = sqliteOverlay
    ? (sqliteOverlay.targets ?? []).map((target) => target.dir)
    : legacyBetterSqlite3Targets(overlayRoot);
  const missing = [];
  for (const target of targets) {
    if (!nodePtyDirs.includes(target)) missing.push(`node-pty/${target}`);
    if (!sqliteDirs.includes(target)) missing.push(`better-sqlite3/${target}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `native overlay does not cover advertised target(s): ${missing.join(", ")}. ` +
        "Run `pnpm run prepare:server-native --require-target <target>` for every advertised shape.",
    );
  }
  return { nodePtyDirs, sqliteDirs };
}

function legacyBetterSqlite3Targets(overlayRoot) {
  const targets = [];
  if (existsSync(join(overlayRoot, "better_sqlite3.node"))) {
    targets.push(`${runtimePlatformKey()}-${process.arch}`);
  }
  const crossDir = join(overlayRoot, "better-sqlite3");
  if (existsSync(crossDir)) {
    for (const name of readdirSync(crossDir)) {
      if (name.endsWith(".node")) targets.push(name.slice(0, -".node".length));
    }
  }
  return targets;
}

function copyResourceDir(resourceRoot, stageResources, name, required) {
  const source = join(resourceRoot, name);
  if (!existsSync(source)) {
    if (required) throw new Error(`Required resource directory missing: ${source}`);
    return;
  }
  cpSync(source, join(stageResources, name), { recursive: true });
}

function listFilesRecursive(root) {
  const files = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (lstatSync(path).isDirectory()) files.push(...listFilesRecursive(path));
    else files.push(path);
  }
  return files.sort();
}

/**
 * The tarball contract forbids link entries: every installer (launcher,
 * prefix, upgrade, Docker) refuses them before extraction, so a staged link
 * would produce an artifact that can never install. This also catches stale
 * overlay-source leftovers (e.g. a `build/` tree with node_modules symlinks)
 * before they are packed.
 */
export function assertNoLinkEntries(root) {
  for (const file of listFilesRecursive(root)) {
    if (lstatSync(file).isSymbolicLink()) {
      throw new Error(
        `Refusing to pack a symbolic link into the server tarball: ${relative(root, file)}`,
      );
    }
  }
}

/** Copy only the native-overlay layout the installers consume. */
export function copyNativeOverlay(overlaySource, destination) {
  for (const entry of ["node-pty", "better-sqlite3", "better_sqlite3.node"]) {
    const source = join(overlaySource, entry);
    if (existsSync(source)) cpSync(source, join(destination, entry), { recursive: true });
  }
}

/** Content identity of the bundled web client, recorded in the metadata. */
export function webClientIdentity(rendererDir) {
  const files = listFilesRecursive(rendererDir);
  const hash = createHash("sha256");
  let bytes = 0;
  for (const path of files) {
    const contents = readFileSync(path);
    bytes += contents.length;
    hash.update(relative(rendererDir, path).split(sep).join("/"));
    hash.update("\0");
    hash.update(contents);
    hash.update("\0");
  }
  const serviceWorkerPath = join(rendererDir, "service-worker.js");
  const serviceWorker = existsSync(serviceWorkerPath)
    ? readFileSync(serviceWorkerPath, "utf8")
    : "";
  const buildVersion = /const BUILD_VERSION = "([^"]+)"/u.exec(serviceWorker)?.[1];
  return {
    present: true,
    files: files.length,
    bytes,
    sha256: hash.digest("hex"),
    ...(buildVersion ? { buildVersion } : {}),
  };
}

function copyWebClient(stage, webDir, apiOnly) {
  const indexPath = join(webDir, "index.html");
  if (!existsSync(indexPath)) {
    if (apiOnly) return { present: false };
    throw new Error(
      `Compatible web client build is missing at ${indexPath}. Run \`pnpm run build:web\` ` +
        "before assembling, or pass --api-only to build an explicit API-only artifact.",
    );
  }
  const rendererDir = join(stage, "renderer");
  cpSync(webDir, rendererDir, { recursive: true });
  return webClientIdentity(rendererDir);
}

function sourceRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

export function assembleServerTarball(options = {}) {
  const mainBundleDir = options.mainBundleDir ?? join(repoRoot, "dist", "main");
  const outDir = options.outDir ?? join(repoRoot, "dist");
  const overlaySource = options.overlaySource ?? join(repoRoot, "dist", "server-native");
  const webDir = options.webDir ?? join(repoRoot, "dist", "web");
  // Resource trees are generated + gitignored in a real checkout, so tests
  // inject a fixture root; production still reads the repository `resources/`.
  const resourceRoot = options.resourceRoot ?? join(repoRoot, "resources");
  const apiOnly = options.apiOnly === true;
  const targets =
    options.targets && options.targets.length > 0
      ? [...options.targets]
      : [`${runtimePlatformKey()}-${process.arch}`];
  if (!existsSync(overlaySource)) {
    throw new Error(
      `native-overlay missing at ${overlaySource}. Run \`pnpm run prepare:server-native\` before assembling the tarball.`,
    );
  }
  const coverage = assertTargetCoverage(overlaySource, targets);
  const closure = readRuntimeClosure(mainBundleDir);
  const rootPackage = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const stage = join(outDir, "poracode-server-stage");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources"), { recursive: true });

  for (const file of closure.files) {
    const source = join(mainBundleDir, file.path);
    const bytes = readFileSync(source);
    assertNoElectronImport(file.path, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    if (file.sha256 && sha !== file.sha256) {
      throw new Error(`Hash mismatch for ${file.path}`);
    }
    const destination = join(stage, "lib", file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, bytes);
  }
  for (const name of closure.manifestFiles) {
    cpSync(join(mainBundleDir, name), join(stage, "lib", name));
  }

  copyResourceDir(resourceRoot, join(stage, "resources"), "wsl-helpers", true);
  copyResourceDir(resourceRoot, join(stage, "resources"), "skills", false);
  copyResourceDir(resourceRoot, join(stage, "resources"), "plugins", false);
  copyResourceDir(resourceRoot, join(stage, "resources"), "agent-plugins", true);
  copyResourceDir(resourceRoot, join(stage, "resources"), "computer-use-helper", true);

  copyNativeOverlay(overlaySource, join(stage, "native-overlay"));
  mkdirSync(join(stage, "scripts"), { recursive: true });
  cpSync(
    join(repoRoot, "scripts", "server-native-overlay.mjs"),
    join(stage, "scripts", "server-native-overlay.mjs"),
  );
  cpSync(
    join(repoRoot, "scripts", "server-release-install.mjs"),
    join(stage, "scripts", "server-release-install.mjs"),
  );
  // The target-host recipe must run from the verified artifact alone: ship the
  // thin prefix installer (its two imports above are its full module closure)
  // and the systemd unit at their documented artifact paths.
  cpSync(
    join(repoRoot, "scripts", "install-server-prefix.mjs"),
    join(stage, "scripts", "install-server-prefix.mjs"),
  );
  mkdirSync(join(stage, "packaging", "systemd"), { recursive: true });
  cpSync(
    join(repoRoot, "packaging", "systemd", "poracode-server.service"),
    join(stage, "packaging", "systemd", "poracode-server.service"),
  );
  cpSync(join(repoRoot, "packaging", "Dockerfile"), join(stage, "Dockerfile"));
  cpSync(join(repoRoot, "LICENSE"), join(stage, "LICENSE"));

  const webClient = copyWebClient(stage, webDir, apiOnly);

  const extra = ["node-pty", "better-sqlite3"].filter(
    (name) => !closure.dependencies.includes(name),
  );
  const dependencies = pinInstalledVersions([...closure.dependencies, ...extra], {
    rootPackage,
    nodeModulesDir: join(repoRoot, "node_modules"),
  });
  writeStagePackageJson(stage, {
    version: rootPackage.version,
    engines: rootPackage.engines,
    dependencies,
  });

  if (options.shrinkwrap !== false) {
    generateNpmShrinkwrap(stage, options.npmRun ? { run: options.npmRun } : {});
  }

  assertNoLinkEntries(stage);
  mkdirSync(outDir, { recursive: true });
  const tarballName = `poracode-server-${rootPackage.version}-${process.platform}-${process.arch}.tar.gz`;
  const tarballPath = join(outDir, tarballName);
  execFileSync("tar", ["-czf", tarballPath, "-C", stage, "."], { stdio: "pipe" });
  const tarballBytes = readFileSync(tarballPath);
  const sha256 = createHash("sha256").update(tarballBytes).digest("hex");
  writeFileSync(join(outDir, `${tarballName}.sha256`), `${sha256}  ${tarballName}\n`);

  const trackedFiles = [
    "package.json",
    "npm-shrinkwrap.json",
    "lib/server.cjs",
    "renderer/index.html",
    "native-overlay/node-pty/overlay.json",
    "native-overlay/better-sqlite3/overlay.json",
    "scripts/install-server-prefix.mjs",
    "scripts/server-release-install.mjs",
    "scripts/server-native-overlay.mjs",
    "packaging/systemd/poracode-server.service",
  ].filter((path) => existsSync(join(stage, path)));
  const revision = options.sourceRevision ?? sourceRevision();
  const metadataPath = writeServerArtifactMetadata(outDir, {
    version: rootPackage.version,
    ...(revision ? { sourceRevision: revision } : {}),
    builtAt: new Date().toISOString(),
    platform: runtimePlatformKey(),
    arch: process.arch,
    targets,
    node: {
      minimum: rootPackage.engines?.node ?? null,
      packaging: process.versions.node,
    },
    runtime: {
      nodePty: dependencies["node-pty"],
      betterSqlite3: dependencies["better-sqlite3"],
      dependencies,
      overlayTargets: { nodePty: coverage.nodePtyDirs, betterSqlite3: coverage.sqliteDirs },
    },
    webClient,
    tarball: { name: tarballName, sha256, bytes: tarballBytes.length },
    files: Object.fromEntries(trackedFiles.map((path) => [path, sha256File(join(stage, path))])),
  });
  return { tarballPath, sha256, stageDir: stage, metadataPath, webClient };
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = assembleServerTarball(options);
    process.stdout.write(`${result.tarballPath}\n${result.sha256}\n${result.metadataPath}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
