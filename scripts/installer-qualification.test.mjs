import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { serveDirectory, stageLocalRelease } from "./installer-qualification.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "poracode-installer-qualify-test-")));
  tempDirs.push(dir);
  return dir;
}

/** Raw GET so `..` segments reach the server unnormalized. */
function get(url, path) {
  return new Promise((resolveGet, rejectGet) => {
    const { hostname, port } = new URL(url);
    const req = request({ hostname, port, path, method: "GET" }, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () =>
        resolveGet({ status: response.statusCode, type: response.headers["content-type"], body }),
      );
    });
    req.once("error", rejectGet);
    req.end();
  });
}

void test("the local release server serves only files inside its root", async () => {
  const root = tempDir();
  mkdirSync(join(root, "release", "v1.0.0"), { recursive: true });
  writeFileSync(join(root, "release", "install.sh"), "#!/bin/sh\n");
  writeFileSync(join(root, "release", "v1.0.0", "SHA256SUMS"), "sums\n");
  writeFileSync(join(root, "secret.txt"), "outside\n");
  const server = await serveDirectory(join(root, "release"));
  try {
    const script = await get(server.url, "/install.sh");
    assert.equal(script.status, 200);
    assert.match(script.type, /^text\/plain/u);
    assert.equal((await get(server.url, "/v1.0.0/SHA256SUMS")).body, "sums\n");
    assert.equal((await get(server.url, "/../secret.txt")).status, 404);
    assert.equal((await get(server.url, "/%2e%2e/secret.txt")).status, 404);
    assert.equal((await get(server.url, "/%")).status, 400, "malformed escapes are refused");
    assert.equal((await get(server.url, "/v1.0.0")).status, 404, "directories are not listed");
    assert.equal((await get(server.url, "/missing")).status, 404);
  } finally {
    await server.close();
  }
});

void test("stageLocalRelease lays out the archive, SHA256SUMS and both installers", () => {
  const root = tempDir();
  const archive = join(root, "poracode-1.0.0-linux-x64.tar.gz");
  writeFileSync(archive, "archive-bytes");
  const sha256 = createHash("sha256").update("archive-bytes").digest("hex");
  const release = stageLocalRelease(root, {
    archive,
    metadata: { version: "1.0.0", archive: { name: "poracode-1.0.0-linux-x64.tar.gz", sha256 } },
  });
  assert.equal(
    readFileSync(join(release, "v1.0.0", "SHA256SUMS"), "utf8"),
    `${sha256}  poracode-1.0.0-linux-x64.tar.gz\n`,
  );
  assert.equal(
    readFileSync(join(release, "v1.0.0", "poracode-1.0.0-linux-x64.tar.gz"), "utf8"),
    "archive-bytes",
  );
  assert.match(readFileSync(join(release, "install.sh"), "utf8"), /^#!\/bin\/sh/u);
  assert.match(
    readFileSync(join(release, "install.ps1"), "utf8"),
    /irm https:\/\/poracode\.com\/install\.ps1/u,
  );
});
