import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
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
  npmInstallRuntimeDependencies,
  RUNTIME_NPM_INSTALL_ARGS,
  RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS,
  UnsafeServerTarballError,
  writeCurrentSymlink,
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

void test("extractServerTarball drives the resolved Windows bsdtar for every tar call", () => {
  const root = tempDir("poracode-release-win-tar-");
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    return args[0] === "-tzf" ? "lib/server.cjs\n" : args[0] === "-tvzf" ? "-rw-r--r-- lib\n" : "";
  };
  extractServerTarball({
    tarball: "C:\\dl\\server.tar.gz",
    destination: join(root, "out"),
    run,
    tarResolution: {
      platform: "win32",
      env: { SystemRoot: "C:\\Windows" },
      exists: () => true,
    },
  });
  assert.deepEqual(
    calls.map((call) => call[0]),
    Array(3).fill("C:\\Windows\\System32\\tar.exe"),
  );
  assert.deepEqual(calls[2].slice(1), ["-xzf", "C:\\dl\\server.tar.gz", "-C", join(root, "out")]);
});

void test("extractServerTarball adds --force-local for a GNU tar on Windows", () => {
  const root = tempDir("poracode-release-win-gnu-");
  const calls = [];
  extractServerTarball({
    tarball: "C:\\dl\\server.tar.gz",
    destination: join(root, "out"),
    run: (command, args) => {
      calls.push([command, ...args]);
      return args.includes("-tzf") ? "lib/server.cjs\n" : args.includes("-tvzf") ? "-rw lib\n" : "";
    },
    tarResolution: {
      platform: "win32",
      env: {},
      exists: () => false,
      run: () => "tar (GNU tar) 1.35",
    },
  });
  for (const call of calls) assert.equal(call[1], "--force-local");
});

void test("an explicit tar override is used verbatim", () => {
  const root = tempDir("poracode-release-tar-override-");
  const commands = [];
  extractServerTarball({
    tarball: "x.tar.gz",
    destination: join(root, "out"),
    tar: "/custom/tar",
    run: (command, args) => {
      commands.push(command);
      return args.includes("-tzf") ? "a\n" : args.includes("-tvzf") ? "-rw a\n" : "";
    },
  });
  assert.deepEqual(commands, ["/custom/tar", "/custom/tar", "/custom/tar"]);
});

void test("npmInstallRuntimeDependencies runs node + npm-cli.js on Windows", () => {
  const calls = [];
  const cli = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
  npmInstallRuntimeDependencies("C:\\rel", {
    ignoreScripts: true,
    run: (command, args, options) => calls.push({ command, args, options }),
    npmResolution: {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      env: {},
      exists: (path) => path === cli,
    },
  });
  assert.equal(calls[0].command, "C:\\node\\node.exe");
  assert.deepEqual(calls[0].args, [cli, ...RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS]);
  assert.equal(calls[0].options.shell, undefined);
  assert.equal(calls[0].options.cwd, "C:\\rel");
});

void test("npmInstallRuntimeDependencies uses a validated shell only for the npm.cmd fallback", () => {
  const calls = [];
  npmInstallRuntimeDependencies("C:\\rel", {
    run: (command, args, options) => calls.push({ command, args, options }),
    npmResolution: { platform: "win32", execPath: "C:\\n\\node.exe", env: {}, exists: () => false },
  });
  assert.equal(calls[0].command, "npm.cmd");
  assert.equal(calls[0].options.shell, true);
});

void test("an explicit npm override is used verbatim without a shell", () => {
  const calls = [];
  npmInstallRuntimeDependencies("/rel", {
    npm: "/custom/npm",
    run: (command, args, options) => calls.push({ command, options }),
  });
  assert.equal(calls[0].command, "/custom/npm");
  assert.equal(calls[0].options.shell, undefined);
});

void test("writeCurrentSymlink replaces a POSIX link and creates a Windows junction on win32", () => {
  const prefix = tempDir("poracode-current-link-");
  mkdirSync(join(prefix, "releases", "a"), { recursive: true });
  mkdirSync(join(prefix, "releases", "b"), { recursive: true });
  writeCurrentSymlink(prefix, join(prefix, "releases", "a"));
  writeCurrentSymlink(prefix, join(prefix, "releases", "b"));
  assert.equal(readlinkSync(join(prefix, "current")), join("releases", "b"));

  const calls = [];
  writeCurrentSymlink("C:\\p", "C:\\p\\releases\\b", {
    platform: "win32",
    rm: () => {},
    symlink: (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [["C:\\p\\releases\\b", join("C:\\p", "current"), "junction"]]);
});

void test("writeCurrentSymlink rides out a transient lock on the old link", () => {
  let removals = 0;
  writeCurrentSymlink("C:\\p", "C:\\p\\releases\\b", {
    platform: "win32",
    retry: { sleep: () => {} },
    rm: () => {
      removals += 1;
      if (removals < 3) throw Object.assign(new Error("busy"), { code: "EBUSY" });
    },
    symlink: () => {},
  });
  assert.equal(removals, 3);
});
