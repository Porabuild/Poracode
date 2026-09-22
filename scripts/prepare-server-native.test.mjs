import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  CROSS_TARGETS,
  crossTargetsForHost,
  hostPlatformKey,
  missingRequiredTargets,
  parseRequireTargets,
  stageBetterSqlite3,
} from "./prepare-server-native.mjs";

const hostTarget = `${hostPlatformKey()}-${process.arch}`;
const hostCrossTargets = crossTargetsForHost();

const tempDirs = [];

after(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A fake better-sqlite3 module root whose `prebuilds/` holds one file per target. */
function createFakeModuleRoot(targets) {
  const root = tempDir("poracode-sqlite-module-");
  mkdirSync(join(root, "prebuilds"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"better-sqlite3","version":"13.0.3"}\n');
  for (const target of targets) {
    writeFileSync(join(root, "prebuilds", `${target}.node`), `binding:${target}\n`);
  }
  return root;
}

void test("parseRequireTargets collects every --require-target value", () => {
  assert.deepEqual(
    parseRequireTargets(["--require-target", "linux-arm64", "--require-target", "linuxmusl-x64"]),
    ["linux-arm64", "linuxmusl-x64"],
  );
  assert.deepEqual(parseRequireTargets([]), []);
  assert.throws(() => parseRequireTargets(["--require-target"]), {
    message: "--require-target needs a <platform>-<arch> value",
  });
  assert.throws(() => parseRequireTargets(["--bogus"]), {
    message: "Unknown option: --bogus",
  });
});

void test("crossTargetsForHost stages the other macOS arch and the Linux cross set", () => {
  assert.deepEqual(crossTargetsForHost("darwin", "arm64"), ["darwin-x64"]);
  assert.deepEqual(crossTargetsForHost("darwin", "x64"), ["darwin-arm64"]);
  assert.deepEqual(crossTargetsForHost("linux", "x64"), CROSS_TARGETS);
  assert.deepEqual(crossTargetsForHost("linux", "arm64"), CROSS_TARGETS);
});

void test("a required target must be covered by every staged native module (V6 D.2)", () => {
  // The D.2 regression: node-pty staged a target but better-sqlite3 did not.
  assert.deepEqual(
    missingRequiredTargets(["linux-arm64"], {
      "node-pty": ["linux-x64", "linux-arm64"],
      "better-sqlite3": ["linux-x64"],
    }),
    ["better-sqlite3/linux-arm64"],
  );
  assert.deepEqual(
    missingRequiredTargets(["linux-arm64", "linuxmusl-x64"], {
      "node-pty": ["linux-arm64"],
      "better-sqlite3": ["linux-arm64", "linuxmusl-x64"],
    }),
    ["node-pty/linuxmusl-x64"],
  );
  assert.deepEqual(
    missingRequiredTargets(["linux-arm64"], {
      "node-pty": ["linux-arm64"],
      "better-sqlite3": ["linux-arm64"],
    }),
    [],
  );
  // Targets nobody required may stay unstaged (the warn+skip contract).
  assert.deepEqual(missingRequiredTargets([], { "node-pty": [], "better-sqlite3": [] }), []);
});

void test("stageBetterSqlite3 stages the host binding plus every present cross prebuild", () => {
  const moduleRoot = createFakeModuleRoot([hostTarget, ...hostCrossTargets]);
  const destinationDir = tempDir("poracode-sqlite-out-");
  const staged = stageBetterSqlite3({ moduleRoot, destinationDir, validateBinding: false });
  assert.ok(staged.includes(hostTarget), `host target ${hostTarget} must count as covered`);
  for (const target of hostCrossTargets) {
    assert.ok(
      existsSync(join(destinationDir, "better-sqlite3", `${target}.node`)),
      `${target} prebuild must be staged`,
    );
    assert.ok(staged.includes(target));
  }
  assert.ok(existsSync(join(destinationDir, "better_sqlite3.node")));
  // Plan D3: the staged wrapper version and per-target hashes are recorded so
  // an install can refuse bindings staged for another wrapper.
  const overlay = JSON.parse(
    readFileSync(join(destinationDir, "better-sqlite3", "overlay.json"), "utf8"),
  );
  assert.equal(overlay.version, "13.0.3");
  assert.equal(overlay.hostTarget, hostTarget);
  assert.deepEqual(
    overlay.targets.map((target) => target.dir).sort(),
    [hostTarget, ...hostCrossTargets].sort(),
  );
  for (const target of overlay.targets) {
    assert.match(target.sha256, /^[0-9a-f]{64}$/u);
  }
});

void test("stageBetterSqlite3 fails a --require-target whose better-sqlite3 prebuild is missing", () => {
  const missingTarget = hostCrossTargets[0] ?? "linux-arm64";
  const moduleRoot = createFakeModuleRoot(
    [hostTarget, ...hostCrossTargets].filter((target) => target !== missingTarget),
  );
  const destinationDir = tempDir("poracode-sqlite-out-");
  assert.throws(
    () =>
      stageBetterSqlite3({
        requiredTargets: [missingTarget],
        moduleRoot,
        destinationDir,
        validateBinding: false,
      }),
    new RegExp(`no better-sqlite3 prebuild for ${missingTarget}`, "u"),
  );
});

void test("stageBetterSqlite3 keeps warn+skip for a missing target nobody required", () => {
  const moduleRoot = createFakeModuleRoot([hostTarget]);
  const destinationDir = tempDir("poracode-sqlite-out-");
  const staged = stageBetterSqlite3({ moduleRoot, destinationDir, validateBinding: false });
  assert.deepEqual(staged, [hostTarget]);
  for (const target of hostCrossTargets) {
    assert.ok(!existsSync(join(destinationDir, "better-sqlite3", `${target}.node`)));
  }
  const overlay = JSON.parse(
    readFileSync(join(destinationDir, "better-sqlite3", "overlay.json"), "utf8"),
  );
  assert.deepEqual(
    overlay.targets.map((target) => target.dir),
    [hostTarget],
  );
});
