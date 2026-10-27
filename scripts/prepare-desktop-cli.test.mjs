import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";
import { prepareDesktopCli } from "./prepare-desktop-cli.mjs";
import { buildElectronBuilderConfig, verifyDesktopPtyTargets } from "./build-desktop-artifact.mjs";
import { parse as parseYaml } from "yaml";
import { PLATFORM_PATTERNS } from "../website/src/lib/releases.ts";
import {
  DESKTOP_CLI_BOOTSTRAP_VERSION,
  DESKTOP_CLI_PREFIX,
  readDesktopBundle,
  runDesktopBundle,
} from "../packages/poracode-cli/lib/desktopBundle.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = join(repoRoot, "tmp");
const roots = [];
const hooks = [];

void test("Windows packaging includes the verified owner and unpacked broker code for both entry layouts", () => {
  const config = parseYaml(buildElectronBuilderConfig("branded", "win", true));
  assert(
    config.extraResources.some(
      (entry) => entry.from === "resources/pty-job-owner" && entry.to === "pty-job-owner",
    ),
  );
  assert(config.asarUnpack.includes("dist/main/**/*.cjs"));
  assert(config.asarUnpack.includes("dist/cli-runtime/lib/**/*.cjs"));
  const without = parseYaml(buildElectronBuilderConfig("branded", "mac", false));
  assert(!without.extraResources.some((entry) => entry.from === "resources/pty-job-owner"));
});

void test("Windows packaging requires the exact helper for every selected architecture", () => {
  const { root } = fixture();
  const ownerRoot = join(root, "pty-job-owner");
  mkdirSync(join(ownerRoot, "win32-x64"), { recursive: true });
  const bytes = Buffer.alloc(512);
  bytes.writeUInt16LE(0x5a4d, 0);
  bytes.writeUInt32LE(64, 0x3c);
  bytes.writeUInt32LE(0x00004550, 64);
  bytes.writeUInt16LE(0x8664, 68);
  bytes.writeUInt16LE(240, 84);
  bytes.writeUInt16LE(0x20b, 88);
  bytes.writeUInt16LE(2, 156);
  writeFileSync(join(ownerRoot, "win32-x64/pty-job-owner-v1.exe"), bytes);
  const manifest = {
    formatVersion: 1,
    protocolVersion: 1,
    helperVersion: "1.0.0",
    sourceSha256: "a".repeat(64),
    targets: {
      "win32-x64": {
        relativePath: "win32-x64/pty-job-owner-v1.exe",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    },
  };
  const manifestPath = join(ownerRoot, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  verifyDesktopPtyTargets(root, ["x64"]);
  assert.throws(() => verifyDesktopPtyTargets(root, ["x64", "arm64"]), /win32-arm64/);
  assert.deepEqual(JSON.parse(readFileSync(manifestPath, "utf8")), manifest);
  mkdirSync(join(ownerRoot, "win32-arm64"));
  const arm = Buffer.from(bytes);
  arm.writeUInt16LE(0xaa64, 68);
  writeFileSync(join(ownerRoot, "win32-arm64/pty-job-owner-v1.exe"), arm);
  manifest.targets["win32-arm64"] = {
    relativePath: "win32-arm64/pty-job-owner-v1.exe",
    bytes: arm.length,
    sha256: createHash("sha256").update(arm).digest("hex"),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  verifyDesktopPtyTargets(root, ["x64", "arm64"]);
});
after(() => {
  for (const handle of hooks) handle.deregister();
  for (const root of roots) {
    assert.ok(resolve(root).startsWith(`${resolve(scratch)}${sep}`));
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(platform = "win32", channel = "stable") {
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, "desktop-cli-fixture-"));
  roots.push(root);
  const main = join(root, "main"),
    renderer = join(root, "renderer"),
    stageRoot = join(root, "stage");
  mkdirSync(main);
  mkdirSync(renderer);
  writeFileSync(join(renderer, "index.html"), "<html>owned shared renderer</html>");
  const marker = `poracode-desktop-cli-fixture:${root}`;
  const source = `exports.DESKTOP_CLI_INTEGRATION_VERSION = 1; exports.runDesktopCli = () => { globalThis[Symbol.for(${JSON.stringify(marker)})] = require('./lazy.cjs').value; };\n`;
  const bodies = {
    "server.cjs": source,
    "supervisor.cjs": "// owned supervisor\n",
    "lazy.cjs": "exports.value = 'captured';\n",
  };
  const files = Object.entries(bodies).map(([path, bytes]) => {
    writeFileSync(join(main, path), bytes);
    return {
      path,
      format: "commonjs",
      bytes: Buffer.byteLength(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  writeFileSync(
    join(main, "server.ssh-runtime-manifest.json"),
    JSON.stringify({
      version: 4,
      entry: "server",
      sourceHash: "a".repeat(64),
      captureProtocolVersion: 1,
      settingsServiceVersion: 0,
      files,
      dependencies: [],
      resources: [],
    }),
  );
  const prepared = prepareDesktopCli({
    stageRoot,
    mainBundleDir: main,
    rendererDir: renderer,
    appVersion: "2.0.0",
  });
  const executableName =
    platform === "darwin"
      ? channel === "nightly"
        ? "Poracode Nightly"
        : "Poracode"
      : platform === "linux"
        ? channel === "nightly"
          ? "poracode-nightly-desktop"
          : "poracode-desktop"
        : channel === "nightly"
          ? "Poracode Nightly.exe"
          : "Poracode.exe";
  const manifest = prepared.writeManifest({
    platform,
    channel,
    executableName,
    electronVersion: "44.4.4",
  });
  const contents =
    platform === "darwin" ? join(root, "Selected.app", "Contents") : join(root, "selected install");
  const resources = join(contents, "resources");
  mkdirSync(resources, { recursive: true });
  // A normal directory models the archive's virtual filesystem. This is not
  // evidence that Electron's real ASAR/native loading has been qualified.
  cpSync(join(stageRoot, "dist"), join(resources, "app.asar", "dist"), { recursive: true });
  cpSync(join(stageRoot, "resources", "desktop-cli"), join(resources, "desktop-cli"), {
    recursive: true,
  });
  const executable = join(contents, ...(platform === "darwin" ? ["MacOS"] : []), executableName);
  mkdirSync(dirname(executable), { recursive: true });
  writeFileSync(executable, "owned executable fixture\n");
  return {
    root,
    main,
    stageRoot,
    prepared,
    manifest,
    resources,
    executable,
    marker,
    platform,
    entry: join(resources, ...DESKTOP_CLI_PREFIX.split("/"), "lib", "server.cjs"),
  };
}

void test("Linux packages include both the verified CLI and a separate GUI executable", () => {
  const config = parseYaml(buildElectronBuilderConfig("branded", "linux", false));
  assert.equal(config.linux.executableName, "poracode-desktop");
  assert.equal(config.appImage.artifactName, "Poracode-Linux-${arch}.${ext}");
  assert.match(
    config.appImage.artifactName.replace("${arch}", "x86_64").replace("${ext}", "AppImage"),
    PLATFORM_PATTERNS["linux-x64"],
  );
  assert(config.files.includes("dist/cli-runtime/**/*"));
  assert(config.extraResources.some((entry) => entry.from === "resources/desktop-cli"));
  for (const channel of ["stable", "nightly"]) {
    const input = fixture("linux", channel);
    const bundle = readDesktopBundle(input.resources);
    assert.equal(bundle.platform, "linux");
    assert.equal(bundle.commandName, channel === "nightly" ? "poracode-next" : "poracode");
    const launcher = readFileSync(join(input.prepared.helperDir, bundle.commandName), "utf8");
    assert.match(launcher, /app="\$dir\/\.\.\/\.\.\/"/u);
    assert.doesNotMatch(launcher, /MacOS/u);
  }
});

void test("AppImage Node entry bypasses GUI sandbox flags while the GUI keeps them", () => {
  if (process.platform === "win32") return;
  const require = createRequire(import.meta.url);
  const { createLinuxAppRun } = require("../build/linux-cli.cjs");
  const { root } = fixture("linux");
  const appDir = join(root, "mount");
  mkdirSync(appDir);
  writeFileSync(join(appDir, "unshare"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  writeFileSync(join(appDir, "poracode-desktop"), '#!/bin/sh\nprintf "%s\\n" "$@"\n', {
    mode: 0o755,
  });
  const appRun = join(appDir, "AppRun");
  writeFileSync(appRun, createLinuxAppRun("poracode-desktop"), { mode: 0o755 });
  const env = { PATH: "/usr/bin:/bin", APPDIR: appDir };
  assert.equal(
    execFileSync(appRun, ["-e", "bootstrap", "--", "poracode", "two words"], {
      encoding: "utf8",
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    }),
    "-e\nbootstrap\n--\nporacode\ntwo words\n",
  );
  assert.equal(
    execFileSync(appRun, ["gui-arg"], { encoding: "utf8", env }),
    "--no-sandbox\ngui-arg\n",
  );
});

void test("the actual AppImage updater preserves the CLI's stable image path", () => {
  if (process.platform === "win32") return;
  const require = createRequire(import.meta.url);
  const { AppImageUpdater } = require("electron-updater/out/AppImageUpdater");
  const { root } = fixture("linux");
  const config = parseYaml(buildElectronBuilderConfig("branded", "linux", false));
  const filename = config.appImage.artifactName
    .replace("${arch}", "x64")
    .replace("${ext}", "AppImage");
  const installed = join(root, filename);
  const downloaded = join(root, "download", filename);
  mkdirSync(dirname(downloaded));
  writeFileSync(installed, "old image");
  writeFileSync(downloaded, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const previous = process.env.APPIMAGE;
  try {
    process.env.APPIMAGE = installed;
    const renamed = [];
    assert.equal(
      AppImageUpdater.prototype.doInstall.call(
        { installerPath: downloaded, emit: (...args) => renamed.push(args) },
        { isForceRunAfter: false },
      ),
      true,
    );
    assert.equal(readFileSync(installed, "utf8"), "#!/bin/sh\nexit 0\n");
    assert.deepEqual(renamed, []);
  } finally {
    if (previous === undefined) delete process.env.APPIMAGE;
    else process.env.APPIMAGE = previous;
  }
});

await test("stages one supported prefix from the declared code closure and the exact shared renderer", () => {
  const input = fixture();
  const bundle = readDesktopBundle(input.resources);
  assert.equal(bundle.formatVersion, DESKTOP_CLI_BOOTSTRAP_VERSION);
  assert.equal(bundle.entry, input.entry);
  assert.equal(bundle.commandName, "poracode");
  assert.equal(bundle.appVersion, "2.0.0");
  assert.equal(
    readFileSync(join(input.prepared.prefix, "renderer", "index.html"), "utf8"),
    "<html>owned shared renderer</html>",
  );
  assert.ok(
    !existsSync(join(input.prepared.prefix, "node_modules")),
    "Native dependencies remain with the same packaged Electron app.",
  );
  const launcher = readFileSync(join(input.prepared.helperDir, "poracode.cmd"), "utf8");
  assert.match(launcher, /DisableDelayedExpansion/u);
  assert.match(launcher, /set "NODE_OPTIONS="/u);
  assert.match(launcher, /set "ELECTRON_RUN_AS_NODE=1"/u);
  assert.match(launcher, /"%~dp0bootstrap\.mjs" %\*/u);
  assert.doesNotMatch(launcher, /\bcall\b|\bchcp\b|npm|npx/u);
  const nsis = readFileSync(join(input.stageRoot, "build", "desktop-cli-config.nsh"), "utf8");
  assert.match(nsis, /PORACODE_CLI_CHANNEL "stable"/u);
  assert.match(nsis, /PORACODE_CLI_COMMAND "poracode"/u);
  assert.match(
    nsis,
    new RegExp(
      `PORACODE_CLI_LAUNCHER_SHA256 "${createHash("sha256").update(launcher).digest("hex")}"`,
      "u",
    ),
  );
});

await test("rerenders the two macOS executable-name variants without duplicate or stale file identities", () => {
  const input = fixture("darwin", "nightly");
  input.prepared.writeManifest({
    platform: "darwin",
    channel: "nightly",
    executableName: "Lightcode Nightly",
    electronVersion: "44.4.4",
  });
  const last = input.prepared.writeManifest({
    platform: "darwin",
    channel: "nightly",
    executableName: "Poracode Nightly",
    electronVersion: "44.4.4",
  });
  assert.equal(new Set(last.files.map((file) => file.path)).size, last.files.length);
  cpSync(input.prepared.helperDir, join(input.resources, "desktop-cli"), { recursive: true });
  assert.equal(readDesktopBundle(input.resources).executableName, "Poracode Nightly");
  const launcher = readFileSync(join(input.prepared.helperDir, "poracode-next"), "utf8");
  assert.match(launcher, /hops.*-lt 16/u);
  assert.match(launcher, /"\$@"/u);
  assert.match(launcher, /Poracode Nightly/u);
  assert.doesNotMatch(launcher, /Lightcode Nightly|npm|npx/u);
  if (process.platform !== "win32")
    assert.equal(statSync(join(input.prepared.helperDir, "poracode-next")).mode & 0o777, 0o755);
});

await test("pins the Nightly Windows registration to its own command and exact staged bytes", () => {
  const input = fixture("win32", "nightly");
  const launcher = readFileSync(join(input.prepared.helperDir, "poracode-next.cmd"));
  const configuration = readFileSync(
    join(input.stageRoot, "build", "desktop-cli-config.nsh"),
    "utf8",
  );
  assert.match(configuration, /PORACODE_CLI_CHANNEL "nightly"/u);
  assert.match(configuration, /PORACODE_CLI_COMMAND "poracode-next"/u);
  assert.match(
    configuration,
    new RegExp(
      `PORACODE_CLI_LAUNCHER_SHA256 "${createHash("sha256").update(launcher).digest("hex")}"`,
      "u",
    ),
  );
  assert.equal(readDesktopBundle(input.resources).commandName, "poracode-next");
});

await test("refuses old/future/unknown bootstrap metadata without loading code, changing environment, or replacing bytes", () => {
  const input = fixture();
  const path = join(input.resources, "desktop-cli", "manifest.json");
  for (const replacement of [
    { ...input.manifest, formatVersion: 0 },
    { ...input.manifest, formatVersion: 2 },
    { ...input.manifest, unknown: true },
    { ...input.manifest, serverPrefixRelative: "../other-install" },
    { ...input.manifest, commandName: "poracode-next" },
    { ...input.manifest, channel: "nightly", commandName: "poracode-nightly" },
  ]) {
    const bytes = JSON.stringify(replacement);
    writeFileSync(path, bytes);
    const env = { NODE_OPTIONS: "private preexisting option", PORACODE_BASE_DIR: "exact-profile" };
    assert.throws(
      () =>
        runDesktopBundle({
          resourcesDir: input.resources,
          env,
          loadServer() {
            assert.fail("Cannot load an unsupported bundle.");
          },
        }),
      /refused/u,
    );
    assert.deepEqual(env, {
      NODE_OPTIONS: "private preexisting option",
      PORACODE_BASE_DIR: "exact-profile",
    });
    assert.equal(readFileSync(path, "utf8"), bytes);
  }
});

await test("refuses a tampered declared source or ambiguous inventory before loading", () => {
  const input = fixture();
  writeFileSync(input.entry, "// substituted code\n");
  assert.throws(() => readDesktopBundle(input.resources), /differs|identity/u);
  cpSync(join(input.prepared.prefix, "lib", "server.cjs"), input.entry);
  const path = join(input.resources, "desktop-cli", "manifest.json");
  for (const files of [
    [...input.manifest.files, input.manifest.files[0]],
    input.manifest.files.filter((file) => file.path !== `${DESKTOP_CLI_PREFIX}/lib/supervisor.cjs`),
    [
      ...input.manifest.files,
      { path: `${DESKTOP_CLI_PREFIX}/lib/../other.cjs`, bytes: 1, sha256: "a".repeat(64) },
    ],
  ]) {
    writeFileSync(path, JSON.stringify({ ...input.manifest, files }));
    assert.throws(() => readDesktopBundle(input.resources), /invalid|duplicate|incomplete/u);
  }
});

await test("refuses linked first-party code without following it outside the package", (context) => {
  const input = fixture();
  const outside = join(input.root, "outside.cjs");
  writeFileSync(outside, readFileSync(input.entry));
  rmSync(input.entry);
  try {
    symlinkSync(outside, input.entry);
  } catch (error) {
    if (error.code === "EPERM") {
      context.skip("This account cannot create the owned symlink fixture.");
      return;
    }
    throw error;
  }
  assert.throws(() => readDesktopBundle(input.resources), /linked/u);
});

await test("pins selected Electron identity, channel namespace and explicit resource/profile overrides before delegation", () => {
  const input = fixture("darwin", "nightly");
  let calls = 0;
  const env = {
    node_options: "private",
    NODE_PATH: "private",
    electron_run_as_node: "0",
    PORACODE_BASE_DIR: "exact-profile",
    PORACODE_WSL_HELPERS_DIR: "explicit-assets",
    PROVIDER_TOKEN: "retained-on-own-host",
  };
  const options = {
    resourcesDir: input.resources,
    execPath: input.executable,
    platform: input.platform,
    electronVersion: "44.4.4",
    env,
    loadServer(entry) {
      calls += 1;
      assert.equal(entry, input.entry);
      return {
        DESKTOP_CLI_INTEGRATION_VERSION: 1,
        runDesktopCli(context) {
          assert.deepEqual(context, {
            formatVersion: 1,
            build: {
              version: "2.0.0",
              sourceRevision: null,
              root: join(input.resources, ...DESKTOP_CLI_PREFIX.split("/")),
              layoutKind: "prefix",
              entrypointSha256: input.manifest.files.find(
                (file) => file.path === `${DESKTOP_CLI_PREFIX}/lib/server.cjs`,
              ).sha256,
            },
          });
        },
      };
    },
  };
  const handle = runDesktopBundle(options);
  hooks.push(handle);
  assert.equal(calls, 1);
  assert.equal(env.PORACODE_BASE_DIR, "exact-profile");
  assert.equal(env.PORACODE_WSL_HELPERS_DIR, "explicit-assets");
  assert.equal(env.PORACODE_BUNDLED_PLUGINS_DIR, join(input.resources, "plugins"));
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.PORACODE_APP_VERSION, "2.0.0");
  assert.equal(env.PROVIDER_TOKEN, "retained-on-own-host");
  assert.ok(
    !Object.hasOwn(env, "node_options") &&
      !Object.hasOwn(env, "electron_run_as_node") &&
      !Object.hasOwn(env, "NODE_PATH"),
  );
  assert.throws(
    () => runDesktopBundle({ ...options, electronVersion: "99.0.0" }),
    /matching Electron/u,
  );
  const foreign = join(input.root, "other", "Poracode Nightly");
  mkdirSync(dirname(foreign));
  writeFileSync(foreign, "other executable");
  assert.throws(() => runDesktopBundle({ ...options, execPath: foreign }), /matching Electron/u);
  assert.equal(calls, 1);
  const defaultEnv = {};
  hooks.push(runDesktopBundle({ ...options, env: defaultEnv, home: input.root }));
  assert.equal(defaultEnv.PORACODE_BASE_DIR, join(input.root, ".poracode-nightly"));
});

await test("preserves exact CLI arguments and process stdio while delegating to the same server entry", () => {
  const input = fixture();
  const originalArgv = process.argv;
  const argv = [
    input.executable,
    join(input.resources, "desktop-cli", "bootstrap.mjs"),
    "serve",
    "--no-open",
    "--base-dir",
    "profile with ! and % characters",
  ];
  const stdout = process.stdout,
    stdin = process.stdin,
    stderr = process.stderr;
  try {
    process.argv = argv;
    hooks.push(
      runDesktopBundle({
        resourcesDir: input.resources,
        execPath: input.executable,
        platform: input.platform,
        electronVersion: "44.4.4",
        env: {},
        loadServer() {
          return {
            DESKTOP_CLI_INTEGRATION_VERSION: 1,
            runDesktopCli() {
              assert.equal(process.argv, argv);
              assert.equal(process.stdin, stdin);
              assert.equal(process.stdout, stdout);
              assert.equal(process.stderr, stderr);
            },
          };
        },
      }),
    );
    assert.equal(process.argv, argv);
  } finally {
    process.argv = originalArgv;
  }
});

await test("uses captured entry and lazy code when files are replaced after verification", () => {
  const input = fixture();
  const loadSelectedEntry = createRequire(import.meta.url);
  const handle = runDesktopBundle({
    resourcesDir: input.resources,
    execPath: input.executable,
    platform: input.platform,
    electronVersion: "44.4.4",
    env: {},
    loadServer(entry) {
      writeFileSync(
        entry,
        "exports.runDesktopCli = () => { throw new Error('replacement entry executed'); };\n",
      );
      writeFileSync(join(dirname(entry), "lazy.cjs"), "exports.value = 'replacement';\n");
      return loadSelectedEntry(entry);
    },
  });
  hooks.push(handle);
  assert.equal(globalThis[Symbol.for(input.marker)], "captured");
  delete globalThis[Symbol.for(input.marker)];
});

await test("fails packaging on a missing or changed declared runtime rather than creating a partial advertised CLI", () => {
  const input = fixture();
  writeFileSync(join(input.main, "server.cjs"), "// changed after declaration\n");
  assert.throws(
    () =>
      prepareDesktopCli({
        stageRoot: join(input.root, "other-stage"),
        mainBundleDir: input.main,
        rendererDir: join(input.root, "renderer"),
        appVersion: "2.0.0",
      }),
    /input hash differs/u,
  );
  assert.ok(
    !existsSync(join(input.root, "other-stage", "resources", "desktop-cli", "manifest.json")),
  );
});

await test("refuses legacy or future server entry versions before command delegation", () => {
  const input = fixture();
  for (const version of [undefined, 0, 2]) {
    assert.throws(
      () =>
        runDesktopBundle({
          resourcesDir: input.resources,
          execPath: input.executable,
          platform: input.platform,
          electronVersion: "44.4.4",
          env: {},
          loadServer() {
            return {
              DESKTOP_CLI_INTEGRATION_VERSION: version,
              runCli() {
                assert.fail("Cannot fall back to an unversioned entry.");
              },
              runDesktopCli() {
                assert.fail("Cannot delegate to another entry version.");
              },
            };
          },
        }),
      /versioned packaged entry/u,
    );
  }
  assert.match(
    readFileSync(join(repoRoot, "src", "server", "cli.ts"), "utf8"),
    new RegExp(
      `export const DESKTOP_CLI_INTEGRATION_VERSION = ${DESKTOP_CLI_BOOTSTRAP_VERSION};`,
      "u",
    ),
  );
  assert.match(
    readFileSync(join(repoRoot, "packages", "poracode-cli", "lib", "desktopBundle.d.mts"), "utf8"),
    new RegExp(`readonly formatVersion: ${DESKTOP_CLI_BOOTSTRAP_VERSION};`, "u"),
  );
});
