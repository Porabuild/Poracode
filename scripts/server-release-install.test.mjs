import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  assertSafeTarballEntries,
  extractServerTarball,
  installServerRelease,
  RUNTIME_NPM_INSTALL_ARGS,
  RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS,
  UnsafeServerTarballError,
} from "./server-release-install.mjs";
import { runtimePlatformKey } from "./server-native-overlay.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

void test("assertSafeTarballEntries refuses traversal paths", () => {
  assert.throws(() => assertSafeTarballEntries(["../escape"], []), UnsafeServerTarballError);
  assert.throws(() => assertSafeTarballEntries(["/absolute"], []), UnsafeServerTarballError);
  assert.throws(() => assertSafeTarballEntries(["a/../../b"], []), UnsafeServerTarballError);
  assert.doesNotThrow(() => assertSafeTarballEntries(["lib/server.cjs", "./resources/"], []));
});

void test("assertSafeTarballEntries refuses link entries", () => {
  assert.throws(
    () =>
      assertSafeTarballEntries(["link"], ["lrwxrwxrwx 0 0 0 0 Jan 1 00:00 link -> /etc/passwd"]),
    /link entry is not allowed/u,
  );
  assert.throws(
    () =>
      assertSafeTarballEntries(
        ["hard"],
        ["hrw-r--r-- 0 0 0 0 Jan 1 00:00 hard link to lib/server.cjs"],
      ),
    /link entry is not allowed/u,
  );
});

void test("extractServerTarball refuses a real archive carrying a symlink", () => {
  const root = tempDir("poracode-release-link-");
  mkdirSync(join(root, "stage"), { recursive: true });
  symlinkSync("/etc/hostname", join(root, "stage", "escape-link"));
  const tarball = join(root, "link.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", join(root, "stage"), "escape-link"], {
    stdio: "pipe",
  });
  assert.throws(
    () => extractServerTarball({ tarball, destination: join(root, "out") }),
    UnsafeServerTarballError,
  );
  assert.equal(existsSync(join(root, "out", "escape-link")), false);
});

void test("installServerRelease extracts, applies the overlay, and skips npm when asked", () => {
  const root = tempDir("poracode-release-install-");
  const stage = join(root, "stage");
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(join(stage, "resources", "wsl-helpers"), { recursive: true });
  writeFileSync(join(stage, "package.json"), '{"name":"poracode-server","version":"1.0.0"}\n');
  writeFileSync(join(stage, "lib", "server.cjs"), "module.exports = {};\n");
  writeFileSync(join(stage, "resources", "wsl-helpers", "README.md"), "helpers\n");
  const tarball = join(root, "runtime.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "pipe" });

  const releaseDir = join(root, "release");
  const result = installServerRelease({ tarball, releaseDir, skipNpmInstall: true });
  assert.equal(result.releaseDir, releaseDir);
  assert.equal(result.overlayApplied, false);
  assert.equal(
    readFileSync(join(releaseDir, "lib", "server.cjs"), "utf8"),
    "module.exports = {};\n",
  );

  const commands = [];
  installServerRelease({
    tarball,
    releaseDir: join(root, "release-npm"),
    run: (command, args, options) => {
      commands.push({ command, args: [...args], cwd: options?.cwd });
      return Buffer.from("");
    },
  });
  assert.deepEqual(
    commands.filter((entry) => entry.command === "npm"),
    [
      {
        command: "npm",
        args: [...RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS],
        cwd: join(root, "release-npm"),
      },
    ],
  );
});

void test("installServerRelease installs with --ignore-scripts before a surviving node-pty overlay", () => {
  // D4 keeps the overlay-first order with the shared array; the launcher/prefix
  // contract must not change that array, only add the explicit flag.
  assert.ok(!RUNTIME_NPM_INSTALL_ARGS.includes("--ignore-scripts"));
  assert.ok(RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS.includes("--ignore-scripts"));

  const root = tempDir("poracode-release-overlay-");
  const hostTarget = `${runtimePlatformKey()}-${process.arch}`;
  const stage = join(root, "stage");
  const stagedDir = join(stage, "native-overlay", "node-pty", hostTarget);
  mkdirSync(join(stage, "lib"), { recursive: true });
  mkdirSync(stagedDir, { recursive: true });
  writeFileSync(join(stage, "package.json"), '{"name":"poracode-server","version":"1.0.0"}\n');
  writeFileSync(join(stage, "lib", "server.cjs"), "module.exports = {};\n");
  const binding = Buffer.from("node-pty-prebuilt-binding");
  writeFileSync(join(stagedDir, "pty.node"), binding);
  writeFileSync(
    join(stage, "native-overlay", "node-pty", "overlay.json"),
    `${JSON.stringify({
      formatVersion: 2,
      package: "node-pty",
      version: "1.1.0",
      targets: [
        {
          platform: runtimePlatformKey(),
          arch: process.arch,
          dir: hostTarget,
          overlayTarget: `node_modules/node-pty/prebuilds/${hostTarget}`,
          stagedSha256: {
            "pty.node": createHash("sha256").update(binding).digest("hex"),
          },
        },
      ],
    })}\n`,
  );
  const tarball = join(root, "runtime.tar.gz");
  execFileSync("tar", ["-czf", tarball, "-C", stage, "."], { stdio: "pipe" });

  const releaseDir = join(root, "release");
  const prebuildDir = join(releaseDir, "node_modules", "node-pty", "prebuilds", hostTarget);
  const npmCalls = [];
  const result = installServerRelease({
    tarball,
    releaseDir,
    run: (command, args, options) => {
      if (command !== "npm") return execFileSync(command, args, options);
      npmCalls.push([...args]);
      // npm's reify replaces the package tree: any overlay planted before this
      // point is gone. A correct installer re-applies the verified overlay
      // after this call.
      rmSync(join(releaseDir, "node_modules", "node-pty"), { recursive: true, force: true });
      mkdirSync(prebuildDir, { recursive: true });
      return Buffer.from("");
    },
  });
  assert.equal(result.overlayApplied, true);
  assert.deepEqual(npmCalls, [[...RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS]]);
  assert.deepEqual(readFileSync(join(prebuildDir, "pty.node")), binding);
});
