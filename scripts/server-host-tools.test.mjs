import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  defaultServerPrefix,
  npmInvocation,
  removeDirectoryLink,
  renameWithRetry,
  resolveTar,
  retryTransientFsSync,
  scratchId,
  tarCommand,
  writeDirectoryLink,
} from "./server-host-tools.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const fsError = (code) => Object.assign(new Error(code), { code });
const noSleep = () => {};

void test("resolveTar leaves POSIX PATH tar untouched and never probes", () => {
  const probe = () => assert.fail("must not probe on POSIX");
  assert.deepEqual(resolveTar({ platform: "linux", run: probe }), {
    command: "tar",
    baseArgs: [],
  });
});

void test("resolveTar prefers the System32 bsdtar on Windows", () => {
  const tool = resolveTar({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    exists: (path) => path === "C:\\Windows\\System32\\tar.exe",
    run: () => assert.fail("no probe once bsdtar is found"),
  });
  assert.deepEqual(tool, { command: "C:\\Windows\\System32\\tar.exe", baseArgs: [] });
});

void test("resolveTar adds --force-local only for a GNU PATH tar on Windows", () => {
  const base = { platform: "win32", env: {}, exists: () => false };
  assert.deepEqual(
    resolveTar({ ...base, run: () => "tar (GNU tar) 1.35\n" }),
    { command: "tar", baseArgs: ["--force-local"] },
    "GNU tar reads C:\\x as host:file without --force-local",
  );
  assert.deepEqual(resolveTar({ ...base, run: () => "bsdtar 3.7.2 - libarchive 3.7.2" }), {
    command: "tar",
    baseArgs: [],
  });
  assert.deepEqual(
    resolveTar({
      ...base,
      run: () => {
        throw new Error("tar not on PATH");
      },
    }),
    { command: "tar", baseArgs: [] },
  );
});

void test("resolveTar falls back to C:\\Windows when SystemRoot is unset", () => {
  const seen = [];
  resolveTar({
    platform: "win32",
    env: {},
    exists: (path) => (seen.push(path), false),
    run: () => "bsdtar",
  });
  assert.deepEqual(seen, ["C:\\Windows\\System32\\tar.exe"]);
});

void test("tarCommand puts base args before the operation", () => {
  assert.deepEqual(tarCommand({ command: "tar", baseArgs: ["--force-local"] }, ["-xzf", "a.tgz"]), [
    "tar",
    ["--force-local", "-xzf", "a.tgz"],
  ]);
});

void test("npmInvocation is plain npm on POSIX", () => {
  assert.deepEqual(npmInvocation(["install"], { platform: "darwin" }), {
    command: "npm",
    args: ["install"],
    shell: false,
  });
});

void test("npmInvocation runs node + npm-cli.js on Windows without a shell", () => {
  const cli = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
  const viaEnv = npmInvocation(["install", "--omit=dev"], {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
    env: { npm_execpath: cli },
    exists: (path) => path === cli,
  });
  assert.deepEqual(viaEnv, {
    command: "C:\\node\\node.exe",
    args: [cli, "install", "--omit=dev"],
    shell: false,
  });
  const viaNodeDir = npmInvocation(["install"], {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
    env: {},
    exists: (path) => path === cli,
  });
  assert.equal(viaNodeDir.command, "C:\\node\\node.exe");
  assert.equal(viaNodeDir.args[0], cli);
});

void test("npmInvocation ignores a non-npm npm_execpath such as pnpm's entry", () => {
  const pnpm = "C:\\pnpm\\pnpm.cjs";
  const fallback = "C:\\node\\node_modules\\npm\\bin\\npm-cli.js";
  const invocation = npmInvocation(["install"], {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
    env: { npm_execpath: pnpm },
    exists: (path) => path === pnpm || path === fallback,
  });
  assert.equal(invocation.args[0], fallback);
});

void test("npmInvocation falls back to npm.cmd through a shell with validated arguments", () => {
  const options = {
    platform: "win32",
    execPath: "C:\\node\\node.exe",
    env: {},
    exists: () => false,
  };
  assert.deepEqual(npmInvocation(["install", "--loglevel=error"], options), {
    command: "npm.cmd",
    args: ["install", "--loglevel=error"],
    shell: true,
  });
  for (const unsafe of ["a&calc", "a b", 'a"b', "a|b", "%PATH%", "a^b", "$(x)"]) {
    assert.throws(() => npmInvocation([unsafe], options), /unsafe argument/u, unsafe);
  }
});

void test("defaultServerPrefix is /opt/poracode on POSIX and LOCALAPPDATA on Windows", () => {
  assert.equal(defaultServerPrefix("linux", {}), "/opt/poracode");
  assert.equal(defaultServerPrefix("darwin", { LOCALAPPDATA: "C:\\ignored" }), "/opt/poracode");
  assert.equal(
    defaultServerPrefix("win32", { LOCALAPPDATA: "C:\\Users\\Ada\\AppData\\Local" }),
    "C:\\Users\\Ada\\AppData\\Local\\Poracode\\server",
  );
  assert.equal(
    defaultServerPrefix("win32", { USERPROFILE: "C:\\Users\\Ada" }),
    "C:\\Users\\Ada\\AppData\\Local\\Poracode\\server",
  );
});

void test("scratchId is short on Windows and a UUID elsewhere", () => {
  assert.match(scratchId("win32"), /^[0-9a-f]{8}$/u);
  assert.match(scratchId("linux"), /^[0-9a-f-]{36}$/u);
});

void test("retryTransientFsSync retries EBUSY/EPERM/EACCES with bounded backoff", () => {
  for (const code of ["EBUSY", "EPERM", "EACCES"]) {
    let calls = 0;
    const delays = [];
    const result = retryTransientFsSync(
      () => {
        calls += 1;
        if (calls < 3) throw fsError(code);
        return "ok";
      },
      { sleep: (ms) => delays.push(ms) },
    );
    assert.equal(result, "ok");
    assert.equal(calls, 3);
    assert.deepEqual(delays, [25, 50]);
  }
});

void test("retryTransientFsSync gives up after the retry bound and on other codes", () => {
  let calls = 0;
  assert.throws(
    () =>
      retryTransientFsSync(
        () => {
          calls += 1;
          throw fsError("EBUSY");
        },
        { retries: 3, sleep: noSleep },
      ),
    { code: "EBUSY" },
  );
  assert.equal(calls, 4);
  calls = 0;
  assert.throws(
    () =>
      retryTransientFsSync(
        () => {
          calls += 1;
          throw fsError("ENOENT");
        },
        { sleep: noSleep },
      ),
    { code: "ENOENT" },
  );
  assert.equal(calls, 1);
});

void test("renameWithRetry retries only while the destination is absent", () => {
  let calls = 0;
  renameWithRetry("a", "b", {
    sleep: noSleep,
    exists: () => false,
    rename: () => {
      calls += 1;
      if (calls < 3) throw fsError("EPERM");
    },
  });
  assert.equal(calls, 3);

  calls = 0;
  assert.throws(
    () =>
      renameWithRetry("a", "b", {
        sleep: noSleep,
        exists: () => true,
        rename: () => {
          calls += 1;
          throw fsError("EPERM");
        },
      }),
    { code: "EPERM" },
    "a present destination is an adoption case, not a lock to wait out",
  );
  assert.equal(calls, 1);
});

void test("writeDirectoryLink creates a junction with an absolute target on Windows", () => {
  const calls = [];
  writeDirectoryLink("C:\\p\\current", "C:\\p\\releases\\r1", {
    platform: "win32",
    symlink: (...args) => calls.push(args),
  });
  assert.deepEqual(calls, [["C:\\p\\releases\\r1", "C:\\p\\current", "junction"]]);
});

void test("writeDirectoryLink creates a relative directory symlink on POSIX", () => {
  const prefix = mkdtempSync(join(tmpdir(), "poracode-link-"));
  tempDirs.push(prefix);
  mkdirSync(join(prefix, "releases", "r1"), { recursive: true });
  writeDirectoryLink(join(prefix, "current"), join(prefix, "releases", "r1"));
  assert.equal(readlinkSync(join(prefix, "current")), join("releases", "r1"));
  removeDirectoryLink(join(prefix, "current"));
  removeDirectoryLink(join(prefix, "current"));
  writeFileSync(join(prefix, "sentinel"), "");
});

void test("removeDirectoryLink falls back to rmdir for a Windows junction seen as a directory", () => {
  const removed = [];
  removeDirectoryLink("C:\\p\\current", {
    platform: "win32",
    rm: () => {
      throw fsError("EPERM");
    },
    rmdir: (path) => removed.push(path),
  });
  assert.deepEqual(removed, ["C:\\p\\current"]);
  assert.throws(
    () =>
      removeDirectoryLink("/p/current", {
        platform: "linux",
        rm: () => {
          throw fsError("EPERM");
        },
        rmdir: () => assert.fail("POSIX must not rmdir"),
      }),
    { code: "EPERM" },
  );
});
