import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  buildToolchainFreePath,
  envWithPath,
  findExecutable,
  findSingleTarball,
} from "./ci-install-no-toolchain.mjs";

const roots = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), "no-toolchain-"));
  roots.push(dir);
  return dir;
}
after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

void test("findExecutable honours PATHEXT on win32", () => {
  const present = new Set(["C:\\tools\\tar.EXE"]);
  const isFile = (path) => present.has(path);
  assert.equal(
    findExecutable("tar", "C:\\nope;C:\\tools", { platform: "win32", isFile }),
    "C:\\tools\\tar.EXE",
  );
  assert.equal(findExecutable("make", "C:\\tools", { platform: "win32", isFile }), null);
});

void test(
  "the POSIX install PATH carries the needed tools and no toolchain",
  {
    skip: process.platform === "win32",
  },
  () => {
    const root = tempDir();
    const tools = join(root, "tools");
    mkdirSync(tools);
    for (const name of ["node", "tar", "python3", "make", "git"]) {
      writeFileSync(join(tools, name), "#!/bin/sh\n", { mode: 0o755 });
    }
    const binDir = join(root, "bin");
    // python3/make exist only on the source PATH; the symlink dir never links them.
    const { directories } = buildToolchainFreePath({
      platform: "linux",
      env: { PATH: tools },
      binDir,
    });
    assert.deepEqual(directories, [binDir]);
    assert.equal(findExecutable("python3", binDir), null);
    assert.equal(findExecutable("make", binDir), null);
    assert.ok(findExecutable("git", binDir));
  },
);

void test(
  "a required tool missing from the source PATH fails closed",
  {
    skip: process.platform === "win32",
  },
  () => {
    const root = tempDir();
    assert.throws(
      () =>
        buildToolchainFreePath({
          platform: "linux",
          env: { PATH: root },
          binDir: join(root, "bin"),
        }),
      /not reachable/u,
    );
  },
);

void test("envWithPath leaves exactly one PATH-named entry", () => {
  const env = envWithPath({ Path: "C:\\a", PATH: "C:\\b", KEEP: "1" }, "C:\\only");
  assert.deepEqual(env, { KEEP: "1", PATH: "C:\\only" });
});

void test("findSingleTarball requires exactly one assembled tarball", () => {
  const root = tempDir();
  assert.throws(() => findSingleTarball(root), /found 0/u);
  writeFileSync(join(root, "poracode-server-1.0.0-linux.tar.gz"), "");
  assert.match(findSingleTarball(root), /poracode-server-1\.0\.0-linux\.tar\.gz$/u);
  writeFileSync(join(root, "poracode-server-1.0.0-other.tar.gz"), "");
  assert.throws(() => findSingleTarball(root), /found 2/u);
});
