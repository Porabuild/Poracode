#!/usr/bin/env node
// Stage-and-install packaging entrypoint.
//
// Why: building electron-builder against the project's pnpm workspace pulls in
// renderer-only transitive deps (mermaid, @adobe/react-spectrum, react-aria,
// cytoscape, ...) that Vite already bundles into dist/renderer/. Excluding them
// by glob is a moving target. Instead we copy the build artifacts into a clean
// staging directory, write a fresh package.json that lists ONLY the runtime
// externals reported by `scripts/scan-runtime-externals.mjs`, run a flat
// `npm install`, and run electron-builder there.

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanRuntimeExternals } from "./runtime-externals.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requireFromHere = createRequire(import.meta.url);
const channelTable = requireFromHere("./electron-builder.shared.cjs");
const { restoreMacUpdaterManifests, snapshotMacUpdaterManifests } = requireFromHere(
  "./mac-updater-manifest.cjs",
);
const { supportEmail } = requireFromHere("../branding/contact.json");

// Runtime externals — packages tsdown does NOT inline into dist/main/*.cjs.
// Regenerate with `node scripts/scan-runtime-externals.mjs`.
const RUNTIME_DEPS = [
  "@agentclientprotocol/sdk",
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/sdk",
  "@opencode-ai/sdk",
  "@sentry/electron",
  "@sentry/node",
  "better-sqlite3",
  "drizzle-orm",
  "json5",
  "micromatch",
  "node-pty",
  "smol-toml",
  "vscode-jsonrpc",
  "ws",
  "yaml",
];

// devDependencies the stage needs to run electron-builder + rebuild natives.
const STAGE_DEV_DEPS = ["electron", "electron-builder", "@electron/rebuild"];
const { PACKAGED_DIST_DIRS, PACKAGED_DIST_FILES } = channelTable;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq >= 0) {
      args[a.slice(2, eq)] = a.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        args[a.slice(2)] = true;
      } else {
        args[a.slice(2)] = next;
        i++;
      }
    }
  }
  return args;
}

function run(command, commandArgs, options = {}) {
  const printable = [command, ...commandArgs].join(" ");
  const shellCommands = new Set(["pnpm", "npm", "npx"]);
  const commandLower = command.toLowerCase();
  const usesShellOnWindows =
    process.platform === "win32" &&
    (shellCommands.has(basename(command)) ||
      commandLower.endsWith(".cmd") ||
      commandLower.endsWith(".bat"));
  console.log(`\n[stage] $ ${printable}${options.cwd ? `  (cwd=${options.cwd})` : ""}`);
  const result = spawnSync(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
    shell: usesShellOnWindows,
    ...options,
  });
  if (result.error) {
    throw new Error(`Command failed to start (${result.error.message}): ${printable}`);
  }
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? "signal"}): ${printable}`);
  }
}

function detectHostPlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  if (process.platform === "win32") return "win";
  throw new Error(`Unsupported host platform: ${process.platform}`);
}

const PLATFORM_FLAG = { mac: "--mac", linux: "--linux", win: "--win" };

// Arches each platform ships when the caller does not pin --arch. Must mirror
// the per-platform `target.arch` lists emitted by buildElectronBuilderConfig().
// Drives the per-arch native rebuild below so every installer carries a
// better_sqlite3.node compiled for its own arch (better-sqlite3 builds from
// source and is arch-specific; node-pty ships per-arch prebuilds and is fine).
const DEFAULT_TARGET_ARCHES = { win: ["x64", "arm64"], mac: ["x64", "arm64"], linux: ["x64"] };

// A missing peer of a runtime external surfaces as `ERR_MODULE_NOT_FOUND` deep
// inside SDK code at app launch. Walk each external's installed package.json
// and pull in any non-optional peer that the root itself declares as a dep —
// this stays explicit regardless of the installer's auto-peer behavior.
function expandPeerDeps(externals, rootPkg) {
  const expanded = new Set();
  const rootHasDep = (name) =>
    Boolean(rootPkg.dependencies?.[name] ?? rootPkg.devDependencies?.[name]);

  for (const name of externals) {
    const pkgPath = resolve(repoRoot, "node_modules", name, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const peers = pkg.peerDependencies ?? {};
    const optionalPeers = pkg.peerDependenciesMeta ?? {};
    for (const peer of Object.keys(peers)) {
      if (optionalPeers[peer]?.optional) continue;
      if (!rootHasDep(peer)) continue;
      if (externals.includes(peer)) continue;
      expanded.add(peer);
    }
  }
  return [...expanded];
}

function buildStagePackageJson(rootPkg) {
  const pick = (name) => rootPkg.dependencies?.[name] ?? rootPkg.devDependencies?.[name] ?? null;

  const dependencies = {};
  const peerDeps = expandPeerDeps(RUNTIME_DEPS, rootPkg);
  const allRuntime = [...RUNTIME_DEPS, ...peerDeps];
  for (const name of allRuntime) {
    const version = pick(name);
    if (!version) {
      throw new Error(`Runtime dep ${name} not found in root package.json`);
    }
    dependencies[name] = version;
  }
  if (peerDeps.length > 0) {
    console.log(`[stage] pulled in peer deps: ${peerDeps.join(", ")}`);
  }

  const devDependencies = {};
  for (const name of STAGE_DEV_DEPS) {
    const version = pick(name);
    if (!version) {
      throw new Error(`Stage dev dep ${name} not found in root package.json`);
    }
    devDependencies[name] = version;
  }

  return {
    name: rootPkg.name,
    version: rootPkg.version,
    description: rootPkg.description ?? "",
    homepage: rootPkg.homepage,
    license: rootPkg.license,
    author: rootPkg.author,
    repository: rootPkg.repository,
    private: true,
    type: rootPkg.type ?? "module",
    main: rootPkg.main ?? "dist/main/main.cjs",
    dependencies,
    devDependencies,
    engines: rootPkg.engines,
  };
}

function validateRuntimeDeps() {
  const emittedExternals = scanRuntimeExternals(repoRoot);
  const staged = new Set(RUNTIME_DEPS);
  const missing = emittedExternals.filter((name) => !staged.has(name));
  const emitted = new Set(emittedExternals);
  const stale = RUNTIME_DEPS.filter((name) => !emitted.has(name));
  if (missing.length > 0 || stale.length > 0) {
    const details = [
      missing.length > 0 ? `missing from RUNTIME_DEPS: ${missing.join(", ")}` : "",
      stale.length > 0 ? `not present in bundled output: ${stale.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    throw new Error(
      `Runtime dependency staging is out of sync (${details}). ` +
        "Regenerate RUNTIME_DEPS with scripts/scan-runtime-externals.mjs before packaging.",
    );
  }
  console.log(`[stage] validated ${emittedExternals.length} emitted runtime dependencies`);
}

function copyDir(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Required directory missing: ${from}`);
  }
  cpSync(from, to, { recursive: true });
}

function copyPackagedDist(stageRoot) {
  const stageDistRoot = join(stageRoot, "dist");
  mkdirSync(stageDistRoot, { recursive: true });
  for (const dir of PACKAGED_DIST_DIRS) {
    copyDir(resolve(repoRoot, "dist", dir), join(stageDistRoot, dir));
  }
}

// The Claude Agent SDK lists `@anthropic-ai/claude-agent-sdk-<plat>-<arch>` as
// optionalDependencies — each platform pack contains a ~200 MB precompiled
// SEA binary of the `claude` CLI. The asar exclusion in the staged
// electron-builder.yml keeps them out of the shipped app; this prune shrinks
// the stage tmpdir and speeds up electron-builder's file walk.
//
// Safe to delete after `pnpm install` returned: the platform packs are pure
// binary blobs with no postinstall hooks, and the SDK only `require`s them
// lazily at runtime (when `pathToClaudeCodeExecutable` is unset) — which we
// always set on posix and route through wsl.exe on WSL.
function pruneStageBinaries(stageRoot) {
  const anthropicDir = join(stageRoot, "node_modules", "@anthropic-ai");
  if (!existsSync(anthropicDir)) return;
  let pruned = 0;
  for (const entry of readdirSync(anthropicDir)) {
    if (entry.startsWith("claude-agent-sdk-") && entry !== "claude-agent-sdk") {
      rmSync(join(anthropicDir, entry), { recursive: true, force: true });
      pruned += 1;
    }
  }
  if (pruned > 0) {
    console.log(`[stage] pruned ${pruned} @anthropic-ai/claude-agent-sdk-* platform pack(s)`);
  }
}

// electron-builder's pnpm node-module collector copies each dependency using
// that package's own package.json "files" allowlist. better-sqlite3's allowlist
// is ["binding.gyp","src/**/*.[ch]pp","lib/**","deps/**"] -- it OMITS build/,
// the directory where electron-rebuild writes the compiled better_sqlite3.node.
// So the collector drops the native binary and packs better-sqlite3 source-only
// INTO app.asar (asarUnpack cannot unpack a file that was never collected),
// which crashes the app at launch with "Could not locate the bindings file".
// Widen the staged package's allowlist to include its build output so the whole
// module (binary included) is collected and the existing asarUnpack glob moves
// it to app.asar.unpacked. node-pty is unaffected: its binaries live under
// prebuilds/, which is already in node-pty's "files" allowlist.
function ensureNativeBuildCollected(stageRoot) {
  const pkgLink = join(stageRoot, "node_modules", "better-sqlite3", "package.json");
  if (!existsSync(pkgLink)) {
    throw new Error(`better-sqlite3 not found in stage; cannot widen files allowlist: ${pkgLink}`);
  }
  // Resolve through pnpm's hoisted junction to patch the real package.json that
  // electron-builder's collector reads.
  const pkgPath = realpathSync(pkgLink);
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  if (Array.isArray(pkg.files) && !pkg.files.includes("build/**")) {
    pkg.files.push("build/**");
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    console.log("[stage] widened better-sqlite3 files allowlist to include build/**");
  }
}

function copyArtifactsBack(stageReleaseDir, outputDir) {
  mkdirSync(outputDir, { recursive: true });
  const copied = [];
  if (!existsSync(stageReleaseDir)) {
    throw new Error(`electron-builder produced no output at ${stageReleaseDir}`);
  }
  for (const entry of readdirSync(stageReleaseDir)) {
    const from = join(stageReleaseDir, entry);
    const stat = statSync(from);
    const to = join(outputDir, entry);
    if (stat.isFile()) {
      cpSync(from, to);
    } else if (stat.isDirectory()) {
      rmSync(to, { recursive: true, force: true });
      // verbatimSymlinks preserves the original (often relative) symlink
      // targets. Without it, macOS .framework bundles get their internal
      // symlinks rewritten to point back into the now-deleted stage tmpdir.
      cpSync(from, to, { recursive: true, verbatimSymlinks: true });
    } else {
      continue;
    }
    copied.push(to);
  }
  return copied;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const platform = args.platform ?? detectHostPlatform();
  const arch = args.arch;
  const target = args.target; // optional, e.g. dmg/zip/nsis/AppImage/deb
  const skipBuild = Boolean(args["skip-build"]);
  const checkRuntimeDeps = Boolean(args["check-runtime-deps"]);
  const publish = args.publish ?? "never";
  const outputDir = resolve(repoRoot, args["output-dir"] ?? "release");
  const keepStage = Boolean(args["keep-stage"]);

  if (!PLATFORM_FLAG[platform]) {
    throw new Error(`Unknown platform "${platform}". Expected mac/linux/win.`);
  }

  // 1. Build dist artifacts unless caller already did it.
  if (!skipBuild) {
    run("pnpm", ["run", "build"], { cwd: repoRoot });
    run("pnpm", ["run", "clean:sourcemaps"], { cwd: repoRoot });
    run("pnpm", ["run", "prepare:package-assets"], { cwd: repoRoot });
  }

  // Fail before the expensive clean install/rebuild if tsdown emitted a new
  // external that the curated staging package would otherwise omit.
  validateRuntimeDeps();
  if (checkRuntimeDeps) {
    return;
  }

  // 2. Create the stage in tmp (outside the pnpm workspace).
  const stageRoot = mkdtempSync(join(tmpdir(), "poracode-stage-"));
  console.log(`[stage] root: ${stageRoot}`);

  try {
    // 3. Copy build artifacts.
    copyPackagedDist(stageRoot);
    copyDir(resolve(repoRoot, "build"), join(stageRoot, "build"));
    copyDir(resolve(repoRoot, "resources"), join(stageRoot, "resources"));

    // 4. Generate stage package.json.
    const rootPkg = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8"));
    const stagePkg = buildStagePackageJson(rootPkg);
    writeFileSync(join(stageRoot, "package.json"), `${JSON.stringify(stagePkg, null, 2)}\n`);

    // 5. Stage the initial electron-builder config.
    const initialMacArtifactKind = macArtifactKindFor(platform, target);
    writeFileSync(
      join(stageRoot, "electron-builder.yml"),
      buildElectronBuilderConfig(initialMacArtifactKind),
    );

    // 6. Install prod + stage devdeps with a genuinely flat npm layout.
    //    electron-builder's file walker (and our asar globs) expect this.
    //    npm runs electron's postinstall and the native dependency build
    //    scripts by default. The stage's deps are pinned to versions the root
    //    project already trusts.
    //    We DON'T disable optionals because electron-builder's dmg-builder
    //    requires the `dmg-license` optionalDependency unconditionally at
    //    import time. Instead we install optionals normally, then surgically
    //    delete the only optional we actually want gone: the Claude SDK's
    //    platform-specific `claude` SEA binary (~200 MB).
    //    The stage tmpdir is fresh each run, so any generated pnpm-lock.yaml
    //    is ephemeral and gets discarded with the stage.
    //    We install with npm, not pnpm, here. pnpm's hoisted layout still keeps
    //    packages behind a node_modules/.pnpm virtual store with Windows
    //    junctions; on CI runners electron-builder's own grandchild dependency
    //    async-exit-hook (electron-builder -> builder-util -> temp-file ->
    //    async-exit-hook) fails to resolve through those junctions, crashing the
    //    first electron-builder pass. The pnpm .cmd NODE_PATH fallback then
    //    re-invokes it, and that second pass packs better-sqlite3 incorrectly
    //    (source-only, inside the asar, native binary dropped) -> the app
    //    crashes at launch with "Could not locate the bindings file".
    //    --config.shamefully-hoist=true did NOT fix it. npm produces a genuinely
    //    flat node_modules (no .pnpm, no junctions) where every transitive
    //    resolves, and electron-builder then uses its well-trodden npm collector.
    //    npm runs native build scripts by default, so electron/better-sqlite3/
    //    node-pty all build without pnpm's build-gating flags.
    run("npm", ["install", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: stageRoot });

    pruneStageBinaries(stageRoot);
    ensureNativeBuildCollected(stageRoot);

    // 6b. Rebuild better-sqlite3 against Electron's V8 ABI, ONCE PER TARGET ARCH,
    //     staging each arch's binary under native/<arch>/. A single multi-arch
    //     electron-builder pass (kept below to preserve a combined latest.yml
    //     updater manifest) packs whatever single binary is in node_modules into
    //     BOTH the x64 and arm64 installers, so the off-host arch would ship a
    //     wrong-arch better_sqlite3.node and crash. after-pack.cjs injects the
    //     correct staged binary per arch instead. (We skip electron-builder's
    //     bundled @electron/rebuild via npmRebuild:false in the staged YAML
    //     because it would also try to compile node-pty from source, which fails:
    //     node-pty 1.1.0's npm tarball omits the winpty submodule. node-pty ships
    //     N-API prebuilds per arch, so it stays ABI-correct without a rebuild.)
    const electronRebuildBin = join(
      stageRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "electron-rebuild.cmd" : "electron-rebuild",
    );
    const builtBinary = join(
      stageRoot,
      "node_modules",
      "better-sqlite3",
      "build",
      "Release",
      "better_sqlite3.node",
    );
    const targetArches = arch ? [arch] : DEFAULT_TARGET_ARCHES[platform];
    for (const targetArch of targetArches) {
      // electron-rebuild rebuilds in place; cross-building for a non-host arch is
      // supported on CI runners (Win has the MSVC ARM64 cross tools, mac has both
      // SDK slices). A failure here aborts the build rather than shipping a broken
      // binary.
      run(electronRebuildBin, ["--only", "better-sqlite3", "--arch", targetArch], {
        cwd: stageRoot,
      });
      if (!existsSync(builtBinary)) {
        throw new Error(`electron-rebuild produced no better_sqlite3.node for arch ${targetArch}`);
      }
      const archStageDir = join(stageRoot, "native", targetArch);
      mkdirSync(archStageDir, { recursive: true });
      cpSync(builtBinary, join(archStageDir, "better_sqlite3.node"));
      console.log(`[stage] staged better_sqlite3.node for ${targetArch}`);
    }

    // 7. Run electron-builder against the stage.
    const electronBuilderBin = join(
      stageRoot,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
    );
    const runElectronBuilder = (
      selectedTarget,
      macArtifactKind = macArtifactKindFor(platform, selectedTarget),
    ) => {
      if (platform === "mac") {
        writeFileSync(
          join(stageRoot, "electron-builder.yml"),
          buildElectronBuilderConfig(macArtifactKind),
        );
      }
      const electronBuilderArgs = [PLATFORM_FLAG[platform]];
      if (selectedTarget) {
        electronBuilderArgs.push(arch ? `${selectedTarget}:${arch}` : selectedTarget);
      } else if (arch) {
        electronBuilderArgs.push(`--${arch}`);
      }
      electronBuilderArgs.push("--publish", publish);
      run(electronBuilderBin, electronBuilderArgs, { cwd: stageRoot });
    };

    if (platform === "mac" && !target) {
      // Build updater ZIPs first with the legacy technical executable name so
      // Lightcode -> Poracode does not trigger Squirrel's broken outer-bundle
      // rename. Then build branded DMGs for fresh/manual installs. The second
      // pass overwrites the channel manifest with DMG metadata, so preserve the
      // updater ZIP manifest around it and restore that as the published feed.
      runElectronBuilder("zip", "updater");
      const updaterManifests = snapshotMacUpdaterManifests(join(stageRoot, "release"));
      if (updaterManifests.size === 0) {
        throw new Error("macOS updater ZIP build produced no channel manifest");
      }
      runElectronBuilder("dmg", "branded");
      restoreMacUpdaterManifests(join(stageRoot, "release"), updaterManifests);
    } else {
      runElectronBuilder(target);
    }

    // 8. Copy artifacts back to release/.
    const copied = copyArtifactsBack(join(stageRoot, "release"), outputDir);
    console.log(`\n[stage] artifacts:`);
    for (const a of copied) console.log(`  ${a}`);
  } finally {
    if (keepStage) {
      console.log(`[stage] kept staging dir at ${stageRoot}`);
    } else {
      rmSync(stageRoot, { recursive: true, force: true });
    }
  }
}

// macOS ZIP updates ship under the legacy executable name as a Squirrel.Mac
// migration bridge; DMGs and every other platform stay fully Poracode-branded.
function macArtifactKindFor(platform, target) {
  return platform === "mac" && target === "zip" ? "updater" : "branded";
}

function buildElectronBuilderConfig(macArtifactKind = "branded") {
  // Generate the staged electron-builder config with a drastically simplified
  // `files:` block — the stage's node_modules contains only the runtime
  // externals we listed, so we can include all of node_modules without dragging
  // renderer-only transitive peers along.
  //
  // Channel-keyed values come from scripts/electron-builder.shared.cjs.
  const channel = channelTable.normalizeChannel(process.env.PORACODE_CHANNEL);
  const appId = channelTable.appIdFor(channel);
  const productName = channelTable.productNameFor(channel);
  const updaterChannel = channelTable.updaterChannelFor(channel);
  const prefix = channelTable.artifactPrefixFor(channel);
  const iconSuffix = channel === "nightly" ? "-nightly" : "";
  const runtimeIconSuffix = channel === "nightly" ? "-nightly-mac" : "-mac";
  const macExecutableName = channelTable.macExecutableNameFor(channel, macArtifactKind);
  const publishChannelLine = updaterChannel ? `\n  channel: ${updaterChannel}` : "";
  const macEntitlements = "build/entitlements.mac.plist";
  const macEntitlementsInherit = "build/entitlements.mac.plist";
  const packagedDistFilesYaml = PACKAGED_DIST_FILES.map((glob) =>
    glob.startsWith("!") ? `  - "${glob}"` : `  - ${glob}`,
  ).join("\n");

  return `appId: ${appId}
productName: ${productName}
copyright: Copyright (C) 2026 Poracode

directories:
  output: release
  buildResources: build

files:
${packagedDistFilesYaml}
  - package.json
  - node_modules/**/*
  # The SDK's optionalDependencies include a 200+MB precompiled \`claude\` SEA
  # binary per platform. We ship without it; users provide \`claude\` via PATH.
  - "!node_modules/@anthropic-ai/claude-agent-sdk-*/**/*"

extraResources:
  - from: resources/wsl-helpers
    to: wsl-helpers
    filter:
      - "**/*"
  - from: resources/agent-plugins
    to: agent-plugins
    filter:
      - "**/*"
  - from: resources/skills
    to: skills
    filter:
      - "**/*"
  - from: resources/plugins
    to: plugins
    filter:
      - "**/*"
  - from: build/icon${runtimeIconSuffix}.png
    to: app-icon.png
  - from: build/tray-icon${iconSuffix}.ico
    to: tray-icon.ico
  - from: build/tray-icon${iconSuffix}-dark.ico
    to: tray-icon-dark.ico
  - from: build/tray-icon-mac.png
    to: tray-icon-mac.png
  - from: build/tray-icon-mac@2x.png
    to: tray-icon-mac@2x.png

extraMetadata:
  main: dist/main/main.cjs

asar: true
asarUnpack:
  - node_modules/node-pty/**/*
  - node_modules/better-sqlite3/**/*
  - dist/main/claudeSdkProbeWorker.mjs
  - dist/main/cursorSdkWorker.mjs
  - node_modules/@anthropic-ai/claude-agent-sdk/**/*

afterPack: build/after-pack.cjs

publish:
  provider: github
  owner: Porabuild
  repo: Poracode${publishChannelLine}

win:
  target:
    - target: nsis
      arch:
        - x64
        - arm64
  icon: build/icon${iconSuffix}.ico

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  buildUniversalInstaller: false
  artifactName: ${prefix}-Setup-\${version}-\${arch}.\${ext}

linux:
  target:
    - target: AppImage
      arch:
        - x64
    - target: deb
      arch:
        - x64
  icon: build/icon${iconSuffix}.png
  category: Development
  maintainer: Porabuild <${supportEmail}>
  artifactName: ${prefix}-\${version}-\${arch}.\${ext}

mac:
  executableName: ${macExecutableName}
  target:
    - target: dmg
      arch:
        - x64
        - arm64
    - target: zip
      arch:
        - x64
        - arm64
  icon: build/icon${iconSuffix}.icns
  category: public.app-category.developer-tools
  artifactName: ${prefix}-\${version}-\${arch}.\${ext}
  hardenedRuntime: true
  gatekeeperAssess: false
  extendInfo:
    NSMicrophoneUsageDescription: Poracode uses the microphone for local voice input in the composer.
  entitlements: ${macEntitlements}
  entitlementsInherit: ${macEntitlementsInherit}
  notarize: true

npmRebuild: false
`;
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
