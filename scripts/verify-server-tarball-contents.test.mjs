import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyServerTarballContents } from "./verify-server-tarball-contents.mjs";

const execFileAsync = promisify(execFile);

void test("the command-line entrypoint fails closed", () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./verify-server-tarball-contents.mjs", import.meta.url)),
      "--tarball",
      join(tmpdir(), "poracode-definitely-missing.tar.gz"),
      "--overlay-root",
      tmpdir(),
      "--target",
      "darwin-arm64",
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(result.status, 0, "the CLI must execute verification rather than exit silently");
});

void test("tarball verification follows host and cross-target overlay manifest paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "poracode-tarball-verify-"));
  const stage = join(root, "stage");
  const overlay = join(stage, "native-overlay");
  const tarball = join(root, "server.tar.gz");
  try {
    await Promise.all([
      mkdir(join(stage, "renderer"), { recursive: true }),
      mkdir(join(overlay, "node-pty", "darwin-arm64"), { recursive: true }),
      mkdir(join(overlay, "node-pty", "darwin-x64"), { recursive: true }),
      mkdir(join(overlay, "better-sqlite3"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(stage, "npm-shrinkwrap.json"), "{}"),
      writeFile(join(stage, "renderer", "index.html"), "ok"),
      writeFile(join(overlay, "better_sqlite3.node"), "host"),
      writeFile(join(overlay, "better-sqlite3", "darwin-x64.node"), "cross"),
      writeFile(join(overlay, "node-pty", "darwin-arm64", "pty.node"), "host"),
      writeFile(join(overlay, "node-pty", "darwin-x64", "pty.node"), "cross"),
      writeFile(
        join(overlay, "node-pty", "overlay.json"),
        JSON.stringify({
          formatVersion: 2,
          targets: ["darwin-arm64", "darwin-x64"].map((dir) => ({
            platform: "darwin",
            arch: dir.endsWith("arm64") ? "arm64" : "x64",
            dir,
            overlayTarget: `node_modules/node-pty/prebuilds/${dir}`,
            stagedSha256: { "pty.node": "test" },
          })),
        }),
      ),
      writeFile(
        join(overlay, "better-sqlite3", "overlay.json"),
        JSON.stringify({
          formatVersion: 1,
          targets: [
            { dir: "darwin-arm64", file: "better_sqlite3.node" },
            { dir: "darwin-x64", file: "better-sqlite3/darwin-x64.node" },
          ],
        }),
      ),
    ]);
    await execFileAsync("tar", ["-czf", tarball, "-C", stage, "."]);
    assert.doesNotThrow(() =>
      verifyServerTarballContents({
        tarball,
        overlayRoot: overlay,
        targets: ["darwin-arm64", "darwin-x64"],
      }),
    );

    await rm(join(overlay, "better_sqlite3.node"));
    await execFileAsync("tar", ["-czf", tarball, "-C", stage, "."]);
    assert.throws(
      () =>
        verifyServerTarballContents({
          tarball,
          overlayRoot: overlay,
          targets: ["darwin-arm64"],
        }),
      /native-overlay\/better_sqlite3\.node/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
