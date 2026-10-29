#!/usr/bin/env node
// Stage-and-install packaging entrypoint.
//
// Why: building electron-builder against the project's workspace pulls in
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
import { prepareDesktopCli } from "./prepare-desktop-cli.mjs";
import { preparePackagedDeviceHub } from "./prepare-device-hub.mjs";
import { pinInstalledVersions, readRuntimeClosure } from "./runtime-closure.mjs";
import { npmInvocation } from "./server-host-tools.mjs";
import { verifyRuntimeResources } from "../src/shared/runtimeResourceInventory.ts";
import { readPtyJobOwnerArtifact } from "../src/shared/ptyJobOwnerArtifact.ts";
import { SUPPORTED_LOCALES } from "../src/shared/locale.ts";
import {
  MAC_NOTARIZE_VERSION,
  verifyMacNotarizationDependency,
} from "./mac-notarization-dependency.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const requireFromHere = createRequire(import.meta.url);
const channelTable = requireFromHere("./electron-builder.shared.cjs");
const {
  restoreMacUpdaterManifests,
  snapshotMacUpdaterManifests,
  setMacUpdaterMinimumSystemVersion,
} = requireFromHere("./mac-updater-manifest.cjs");
const { supportEmail } = requireFromHere("../branding/contact.json");

// Runtime externals — packages tsdown does NOT inline into dist/main/*.cjs.
// Regenerate with `node scripts/scan-runtime-externals.mjs`.
const RUNTIME_DEPS = [
  "@anthropic-ai/claude-agent-sdk",
  "@modelcontextprotocol/client",
  "@opencode-ai/sdk",
  "@opencode/client",
  "@sentry/electron",
  "@sentry/node",
  "better-sqlite3",
  "cron-parser",
  "json5",
  "jsonc-parser",
  "micromatch",
  "node-pty",
  "proper-lockfile",
  "qrcode",
  "sharp",
  "smol-toml",
  "vscode-jsonrpc",
  "ws",
  "yaml",
  "zod",
];

// devDependencies the stage needs to run electron-builder.
const STAGE_DEV_DEPS = ["electron", "electron-builder"];
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
  const shellCommands = new Set(["npm", "npx"]);
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
const DEFAULT_TARGET_ARCHES = { win: ["x64", "arm64"], mac: ["x64", "arm64"], linux: ["x64"] };

export function verifyDesktopPtyTargets(resourceRoot, arches) {
  for (const arch of arches)
    readPtyJobOwnerArtifact(join(resourceRoot, "pty-job-owner"), `win32-${arch}`);
}

// A missing peer of a runtime external surfaces as `ERR_MODULE_NOT_FOUND` deep
// inside SDK code at app launch. Walk each external's installed package.json
// and pull in any non-optional peer that the root itself declares as a dep —
// this stays explicit regardless of the installer's auto-peer behavior.
function expandPeerDeps(externals, rootPkg, nodeModulesDir) {
  const expanded = new Set();
  const rootHasDep = (name) =>
    Boolean(rootPkg.dependencies?.[name] ?? rootPkg.devDependencies?.[name]);

  for (const name of externals) {
    const pkgPath = join(nodeModulesDir, name, "package.json");
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

export function buildStagePackageJson(rootPkg, nodeModulesDir = join(repoRoot, "node_modules")) {
  const pinOptions = {
    rootPackage: {
      ...rootPkg,
      dependencies: { ...rootPkg.devDependencies, ...rootPkg.dependencies },
    },
    nodeModulesDir,
  };
  const peerDeps = expandPeerDeps(RUNTIME_DEPS, rootPkg, nodeModulesDir);
  const allRuntime = [...RUNTIME_DEPS, ...peerDeps];
  const dependencies = pinInstalledVersions(allRuntime, pinOptions);
  if (peerDeps.length > 0) {
    console.log(`[stage] pulled in peer deps: ${peerDeps.join(", ")}`);
  }

  const devDependencies = pinInstalledVersions(STAGE_DEV_DEPS, pinOptions);

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
    ...(rootPkg.overrides ? { overrides: rootPkg.overrides } : {}),
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

// These optional SEA binaries are never used by our provider launcher. Keep
// the other optionals: dmg-builder requires dmg-license even during import.
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
  if (pruned > 0)
    console.log(`[stage] pruned ${pruned} @anthropic-ai/claude-agent-sdk-* platform pack(s)`);
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
  if (platform === "mac" && publish !== "never") {
    throw new Error(
      "macOS update metadata is finalized after packaging. Use --publish never and upload the completed release artifacts separately.",
    );
  }

  // 1. Build dist artifacts unless caller already did it.
  if (!skipBuild) {
    run("bun", ["run", "build"], { cwd: repoRoot });
    run("bun", ["run", "clean:sourcemaps"], { cwd: repoRoot });
    const helperArgs = [
      "scripts/prepare-computer-use-helper.mjs",
      "--require",
      "--platform",
      platform,
    ];
    if (arch && platform !== "mac") helperArgs.push("--arch", arch);
    run("node", helperArgs, { cwd: repoRoot });
    run("bun", ["run", "prepare:package-assets"], { cwd: repoRoot });
  }

  // Fail before the expensive clean install/rebuild if tsdown emitted a new
  // external that the curated staging package would otherwise omit.
  validateRuntimeDeps();
  if (checkRuntimeDeps) {
    return;
  }
  const runtimeClosure = readRuntimeClosure(join(repoRoot, "dist/main"));
  if (
    platform === "win" &&
    !runtimeClosure.resources.some((resource) => resource.kind === "pty-job-owner")
  )
    throw new Error(
      "Windows packaging requires a runtime built with the prepared PTY job owner. Rebuild before packaging.",
    );
  verifyRuntimeResources(runtimeClosure.resources, {
    agentPlugins: { path: join(repoRoot, "resources/agent-plugins"), layout: "staged" },
    bundledPlugins: join(repoRoot, "resources/plugins"),
    ptyJobOwner: join(repoRoot, "resources/pty-job-owner"),
  });
  if (platform === "win")
    verifyDesktopPtyTargets(join(repoRoot, "resources"), arch ? [arch] : DEFAULT_TARGET_ARCHES.win);

  // 2. Create the stage in tmp (outside the workspace).
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
    if (platform === "mac") {
      stagePkg.overrides = { ...stagePkg.overrides, "@electron/notarize": MAC_NOTARIZE_VERSION };
    }
    writeFileSync(join(stageRoot, "package.json"), `${JSON.stringify(stagePkg, null, 2)}\n`);

    const desktopCli = prepareDesktopCli({
      stageRoot,
      mainBundleDir: join(repoRoot, "dist", "main"),
      rendererDir: join(repoRoot, "dist", "renderer"),
      appVersion: rootPkg.version,
    });

    // 5. Stage the initial electron-builder config.
    const initialMacArtifactKind = macArtifactKindFor(platform, target);
    writeFileSync(
      join(stageRoot, "electron-builder.yml"),
      buildElectronBuilderConfig(
        initialMacArtifactKind,
        platform,
        existsSync(join(stageRoot, "resources/pty-job-owner")),
      ),
    );

    // 6. Use a fresh flat npm layout: electron-builder's dependency collector
    // cannot reliably walk the workspace's virtual-store links on Windows.
    const npm = npmInvocation([
      "install",
      "--include=dev",
      "--ignore-scripts=false",
      "--no-audit",
      "--no-fund",
      "--loglevel=error",
    ]);
    run(npm.command, npm.args, { cwd: stageRoot, shell: npm.shell });
    if (platform === "mac") {
      const notarizeVersion = verifyMacNotarizationDependency(stageRoot);
      console.log(
        `[stage] verified macOS notarization dependency: @electron/notarize@${notarizeVersion}`,
      );
    }

    pruneStageBinaries(stageRoot);
    // SQLite and node-pty ship N-API prebuilds; afterPack keeps the target architecture.
    const targetArches = arch ? [arch] : DEFAULT_TARGET_ARCHES[platform];
    await preparePackagedDeviceHub(stageRoot, { platform, arches: targetArches });

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
      desktopCli.writeManifest({
        platform: platform === "mac" ? "darwin" : platform === "win" ? "win32" : "linux",
        channel: channelTable.normalizeChannel(process.env.PORACODE_CHANNEL),
        executableName:
          platform === "mac"
            ? channelTable.macExecutableNameFor(
                channelTable.normalizeChannel(process.env.PORACODE_CHANNEL),
                macArtifactKind,
              )
            : platform === "linux"
              ? linuxDesktopExecutableName(
                  channelTable.normalizeChannel(process.env.PORACODE_CHANNEL),
                )
              : `${channelTable.productNameFor(channelTable.normalizeChannel(process.env.PORACODE_CHANNEL))}.exe`,
        electronVersion: rootPkg.devDependencies.electron,
      });
      if (platform === "mac") {
        writeFileSync(
          join(stageRoot, "electron-builder.yml"),
          buildElectronBuilderConfig(
            macArtifactKind,
            platform,
            existsSync(join(stageRoot, "resources/pty-job-owner")),
          ),
        );
      }
      const electronBuilderArgs = [PLATFORM_FLAG[platform]];
      if (selectedTarget) {
        electronBuilderArgs.push(
          ...targetArches.map((targetArch) => `${selectedTarget}:${targetArch}`),
        );
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

    if (platform === "mac") {
      setMacUpdaterMinimumSystemVersion(join(stageRoot, "release"));
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

export function buildElectronBuilderConfig(
  macArtifactKind = "branded",
  platform,
  includePtyOwner = platform === "win",
) {
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
  const includeDesktopCli = ["win", "mac", "linux"].includes(platform);
  const desktopCliFiles = includeDesktopCli
    ? '\n  - dist/cli-runtime/**/*\n  - "!dist/cli-runtime/**/*.map"'
    : "";
  const desktopCliResources = includeDesktopCli
    ? '\n  - from: resources/desktop-cli\n    to: desktop-cli\n    filter:\n      - "**/*"'
    : "";
  const ptyOwnerResources = includePtyOwner
    ? '\n  - from: resources/pty-job-owner\n    to: pty-job-owner\n    filter:\n      - "**/*"'
    : "";
  // The broker is a real child entry. Its captured CJS chunks must be readable
  // by both the desktop and desktop-CLI Node children outside app.asar.
  const ptyBrokerUnpack = includePtyOwner
    ? "\n  - dist/main/**/*.cjs\n  - dist/cli-runtime/lib/**/*.cjs"
    : "";
  const desktopCliUnpack = includeDesktopCli
    ? [
        "claudeSdkProbeWorker.mjs",
        "cursorSdkWorker.mjs",
        "remoteHttpBridge.cjs",
        "sshEnvironmentWorker.cjs",
      ]
        .map((file) => `\n  - dist/cli-runtime/lib/${file}`)
        .join("")
    : "";
  const macEntitlements = "build/entitlements.mac.plist";
  const macEntitlementsInherit = "build/entitlements.mac.plist";
  const electronLanguages = [
    ...new Set(
      SUPPORTED_LOCALES.flatMap((locale) =>
        locale === "en" ? ["en-US", "en-GB"] : [locale, locale.replaceAll("-", "_")],
      ),
    ),
  ];
  const packagedDistFilesYaml = PACKAGED_DIST_FILES.map((glob) =>
    glob.startsWith("!") ? `  - "${glob}"` : `  - ${glob}`,
  ).join("\n");

  return `appId: ${appId}
productName: ${productName}
copyright: Copyright (C) 2026 Poracode
electronLanguages: ${JSON.stringify(electronLanguages)}

directories:
  output: release
  buildResources: build

files:
${packagedDistFilesYaml}${desktopCliFiles}
  - package.json
  - node_modules/**/*
  - "!node_modules/**/*.map"
  - "!node_modules/effect/src/**/*"
  # The SDK's optionalDependencies include a 200+MB precompiled \`claude\` SEA
  # binary per platform. We ship without it; users provide \`claude\` via PATH.
  - "!node_modules/@anthropic-ai/claude-agent-sdk-*/**/*"
  # Native modules load their compiled binaries; compiler inputs and link/debug
  # outputs are only needed while building the stage.
  - "!node_modules/better-sqlite3/{src,deps}/**/*"
  - "!node_modules/{better-sqlite3,node-pty}/build/**/obj/**/*"
  - "!node_modules/{better-sqlite3,node-pty}/build/**/*.{iobj,ipdb,lib,pdb,exp}"

extraResources:${desktopCliResources}${ptyOwnerResources}
  - from: resources/device-hub
    to: device-hub
    filter:
      - "**/*"
  - from: resources/computer-use-helper
    to: computer-use-helper
    filter:
      - "**/*"
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
  # Immutable preassembled SSH runtime archive (C3/S3). Built by
  # scripts/build-ssh-runtime-archive.mjs from the frozen closure before
  # packaging; the desktop loader prefers it and only stages a bundle when it
  # is absent or built from different sources.
  - from: resources/ssh-runtime-archive
    to: ssh-runtime-archive
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
  # The remote HTTP bridge is the utility-process module path main forks; keep
  # it outside the archive so packaged startup never depends on asar module
  # resolution inside a utility child.
  - dist/main/remoteHttpBridge.cjs
  # Same rule for the SSH environment utility: main forks this file path.
  - dist/main/sshEnvironmentWorker.cjs
  - node_modules/@anthropic-ai/claude-agent-sdk/**/*${desktopCliUnpack}${ptyBrokerUnpack}

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
  oneClick: false${platform === "win" ? "\n  include: build/desktop-cli.nsh" : ""}
  perMachine: false
  allowToChangeInstallationDirectory: true
  buildUniversalInstaller: false
  artifactName: ${prefix}-Setup-\${version}-\${arch}.\${ext}

appImage:
  # A stable outer filename keeps the installed CLI binding valid through updates.
  artifactName: ${prefix}-Linux-\${arch}.\${ext}

linux:
  executableName: ${linuxDesktopExecutableName(channel)}
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
  minimumSystemVersion: "13.0.0"
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

function linuxDesktopExecutableName(channel) {
  // Keep the package manager's GUI symlink separate from the terminal command.
  return channel === "nightly" ? "poracode-nightly-desktop" : "poracode-desktop";
}

if (
  process.argv[1] &&
  realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  });
}
