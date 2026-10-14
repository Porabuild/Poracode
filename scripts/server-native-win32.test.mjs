import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { CROSS_TARGETS, crossTargetsForHost, WIN32_TARGETS } from "./prepare-server-native.mjs";
import {
  applyServerNativeOverlay,
  overlayTargets,
  runtimePlatformKey,
} from "./server-native-overlay.mjs";
import {
  assertConptyLoadable,
  bindingMarker,
  listWin32PrebuildFiles,
} from "./server-native-win32.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeTree(root, files) {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
}

const WIN_PREBUILD = {
  "conpty.node": "conpty",
  "conpty.pdb": "symbols",
  "conpty_console_list.node": "list",
  "pty.node": "pty",
  "pty.pdb": "symbols",
  "winpty.dll": "winpty",
  "winpty-agent.exe": "agent",
  "conpty/conpty.dll": "conpty-dll",
  "conpty/OpenConsole.exe": "console",
  "conpty/OpenConsole.PDB": "symbols",
};

void test("crossTargetsForHost stages the other Windows arch and never the host's own", () => {
  assert.deepEqual(crossTargetsForHost("win32", "x64"), ["win32-arm64"]);
  assert.deepEqual(crossTargetsForHost("win32", "arm64"), ["win32-x64"]);
  assert.deepEqual(WIN32_TARGETS, ["win32-x64", "win32-arm64"]);
  assert.ok(
    CROSS_TARGETS.every((target) => !target.startsWith("win32")),
    "Windows shapes must not leak into the Linux cross list",
  );
});

void test("bindingMarker is conpty.node on Windows and pty.node elsewhere", () => {
  assert.equal(bindingMarker("win32"), "conpty.node");
  assert.equal(bindingMarker("linux"), "pty.node");
  assert.equal(bindingMarker("darwin"), "pty.node");
});

void test("listWin32PrebuildFiles stages the whole tree with nested names and no .pdb", () => {
  const dir = tempDir("poracode-win-prebuild-");
  writeTree(dir, WIN_PREBUILD);
  assert.deepEqual(listWin32PrebuildFiles(dir), [
    "conpty.node",
    "conpty/OpenConsole.exe",
    "conpty/conpty.dll",
    "conpty_console_list.node",
    "pty.node",
    "winpty-agent.exe",
    "winpty.dll",
  ]);
});

void test("assertConptyLoadable loads the real conpty.node on a Windows host only", () => {
  const dir = tempDir("poracode-win-conpty-");
  writeTree(dir, WIN_PREBUILD);
  const loaded = [];
  assert.equal(
    assertConptyLoadable({
      sourceDir: dir,
      platform: "win32",
      arch: "x64",
      hostArch: "x64",
      load: (path) => loaded.push(path),
    }),
    true,
  );
  assert.deepEqual(loaded, [join(dir, "conpty.node")]);

  const skip = () => assert.fail("must not load");
  assert.equal(assertConptyLoadable({ sourceDir: dir, platform: "linux", load: skip }), false);
  assert.equal(
    assertConptyLoadable({
      sourceDir: dir,
      platform: "win32",
      arch: "arm64",
      hostArch: "x64",
      load: skip,
    }),
    false,
    "a non-host arch cannot be loaded and is not checked",
  );
});

void test("assertConptyLoadable fails closed on a missing or unloadable binding", () => {
  const dir = tempDir("poracode-win-conpty-bad-");
  assert.throws(
    () => assertConptyLoadable({ sourceDir: dir, platform: "win32", load: () => {} }),
    /ConPTY binding is missing/u,
  );
  writeTree(dir, { "conpty.node": "x" });
  assert.throws(
    () =>
      assertConptyLoadable({
        sourceDir: dir,
        platform: "win32",
        load: () => {
          throw new Error("not a valid Win32 application");
        },
      }),
    /failed to load .*not a valid Win32 application/u,
  );
});

// Overlay manifest boundary (.agents/docs/versioning.md): formatVersion 2 now
// carries nested member names for Windows; readers must still apply the old
// flat single-file shape.
function overlayFixture(files, layout) {
  const root = tempDir("poracode-overlay-fixture-");
  const overlayRoot = join(root, "native-overlay");
  const hostTarget = `${runtimePlatformKey()}-${process.arch}`;
  writeTree(join(overlayRoot, "node-pty", hostTarget), files);
  const stagedSha256 = Object.fromEntries(
    Object.entries(files).map(([name, content]) => [
      name,
      createHash("sha256").update(content).digest("hex"),
    ]),
  );
  const target = {
    platform: runtimePlatformKey(),
    arch: process.arch,
    dir: hostTarget,
    overlayTarget: `node_modules/node-pty/prebuilds/${hostTarget}`,
    stagedSha256,
  };
  const manifest =
    layout === "v1"
      ? { formatVersion: 1, package: "node-pty", version: "1.0.0", ...target }
      : { formatVersion: 2, package: "node-pty", version: "1.0.0", targets: [target] };
  writeFileSync(join(overlayRoot, "node-pty", "overlay.json"), JSON.stringify(manifest));
  return { prefix: join(root, "release"), overlayRoot, hostTarget };
}

void test("the overlay applies nested Windows member names (formatVersion 2)", () => {
  const { prefix, overlayRoot, hostTarget } = overlayFixture(winPrebuildWithoutSymbols(), "v2");
  applyServerNativeOverlay({ prefix, overlayRoot });
  const dest = join(prefix, "node_modules", "node-pty", "prebuilds", hostTarget);
  assert.equal(readFileSync(join(dest, "conpty", "conpty.dll"), "utf8"), "conpty-dll");
  assert.ok(existsSync(join(dest, "conpty", "OpenConsole.exe")));
  assert.ok(existsSync(join(dest, "conpty.node")));
});

void test("the overlay still applies the old single-file formatVersion 1 shape", () => {
  const { prefix, overlayRoot, hostTarget } = overlayFixture({ "pty.node": "binding" }, "v1");
  assert.equal(
    overlayTargets(JSON.parse(readFileSync(join(overlayRoot, "node-pty", "overlay.json"), "utf8")))
      .length,
    1,
  );
  applyServerNativeOverlay({ prefix, overlayRoot });
  assert.equal(
    readFileSync(
      join(prefix, "node_modules", "node-pty", "prebuilds", hostTarget, "pty.node"),
      "utf8",
    ),
    "binding",
  );
});

void test("the overlay refuses a nested member that escapes the prefix", () => {
  const { prefix, overlayRoot } = overlayFixture({ "pty.node": "x" }, "v2");
  const path = join(overlayRoot, "node-pty", "overlay.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.targets[0].stagedSha256 = { "conpty/../../escape.dll": "0".repeat(64) };
  writeFileSync(path, JSON.stringify(manifest));
  assert.throws(() => applyServerNativeOverlay({ prefix, overlayRoot }), /escapes/u);
});

function winPrebuildWithoutSymbols() {
  return Object.fromEntries(
    Object.entries(WIN_PREBUILD).filter(([name]) => !/\.pdb$/iu.test(name)),
  );
}
