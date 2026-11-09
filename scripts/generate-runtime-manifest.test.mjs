import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRuntimeManifest,
  releaseDownloadBaseUrl,
  verifyRuntimeManifest,
} from "./generate-runtime-manifest.mjs";

const sha = (letter) => letter.repeat(64);

function artifact(version, targets, tarballName, sha256) {
  return {
    formatVersion: 1,
    kind: "poracode-server-artifact",
    version,
    targets,
    tarball: { name: tarballName, sha256, bytes: 1 },
    runtime: { nodePty: "1.1.0", betterSqlite3: "13.0.3" },
  };
}

const linux = artifact(
  "1.8.1",
  ["linux-x64", "linux-arm64"],
  "poracode-server-1.8.1-linux-x64.tar.gz",
  sha("a"),
);
const darwin = artifact(
  "1.8.1",
  ["darwin-arm64", "darwin-x64"],
  "poracode-server-1.8.1-darwin-arm64.tar.gz",
  sha("b"),
);

void test("buildRuntimeManifest merges every qualified artifact into one target table", () => {
  const base = releaseDownloadBaseUrl("1.8.1");
  const manifest = buildRuntimeManifest([linux, darwin], base);
  assert.deepEqual(Object.keys(manifest.targets).sort(), [
    "darwin-arm64",
    "darwin-x64",
    "linux-arm64",
    "linux-x64",
  ]);
  assert.equal(manifest.version, "1.8.1");
  assert.equal(
    manifest.targets["darwin-x64"].url,
    `${base}/poracode-server-1.8.1-darwin-arm64.tar.gz`,
  );
  assert.equal(manifest.targets["darwin-x64"].sha256, sha("b"));
  assert.equal(manifest.targets["linux-arm64"].sha256, sha("a"));
  assert.equal(verifyRuntimeManifest([linux, darwin], manifest), true);
});

void test("a single artifact keeps working (legacy call shape)", () => {
  const manifest = buildRuntimeManifest(linux, releaseDownloadBaseUrl("1.8.1"));
  assert.deepEqual(Object.keys(manifest.targets).sort(), ["linux-arm64", "linux-x64"]);
  assert.equal(verifyRuntimeManifest(linux, manifest), true);
});

void test("duplicate target claims fail closed instead of silently dropping a tarball", () => {
  const duplicate = artifact(
    "1.8.1",
    ["linux-x64"],
    "poracode-server-1.8.1-linux-x64-retry.tar.gz",
    sha("c"),
  );
  assert.throws(
    () => buildRuntimeManifest([linux, duplicate], releaseDownloadBaseUrl("1.8.1")),
    /claim the target linux-x64 more than once/u,
  );
  const manifest = buildRuntimeManifest(linux, releaseDownloadBaseUrl("1.8.1"));
  assert.throws(
    () => verifyRuntimeManifest([linux, duplicate], manifest),
    /claim the target linux-x64 more than once/u,
  );
});

void test("verifyRuntimeManifest refuses version, hash, url, and target mismatches", () => {
  const manifest = buildRuntimeManifest([linux, darwin], releaseDownloadBaseUrl("1.8.1"));

  assert.throws(
    () =>
      verifyRuntimeManifest(
        [artifact("1.8.2", ["linux-x64"], linux.tarball.name, sha("a"))],
        manifest,
      ),
    /does not match artifact 1\.8\.2/u,
  );

  const wrongHash = structuredClone(manifest);
  wrongHash.targets["linux-x64"].sha256 = sha("d");
  assert.throws(() => verifyRuntimeManifest([linux, darwin], wrongHash), /sha256/u);

  const wrongUrl = structuredClone(manifest);
  wrongUrl.targets["linux-x64"].url = "https://example.invalid/other.tar.gz";
  assert.throws(() => verifyRuntimeManifest([linux, darwin], wrongUrl), /does not point at/u);

  const droppedTarget = structuredClone(manifest);
  delete droppedTarget.targets["darwin-x64"];
  assert.throws(
    () => verifyRuntimeManifest([linux, darwin], droppedTarget),
    /do not match the qualified artifacts/u,
  );
});

void test("format 2 pins one standalone archive per target and verifies it", async () => {
  const { buildStandaloneRuntimeManifest, verifyStandaloneRuntimeManifest } =
    await import("./generate-runtime-manifest.mjs");
  const standalone = (target, letter) => ({
    formatVersion: 1,
    kind: "poracode-standalone-archive",
    version: "2.1.0",
    target,
    archive: {
      name: `poracode-2.1.0-${target}.${target.startsWith("win32-") ? "zip" : "tar.gz"}`,
      sha256: letter.repeat(64),
      bytes: 1,
    },
    runtime: { kind: "poracode-standalone-runtime", node: { version: "26.13.0" } },
  });
  const list = [standalone("linux-x64", "a"), standalone("win32-x64", "b")];
  const base = "https://github.com/Porabuild/Poracode/releases/download/v2.1.0";
  const manifest = buildStandaloneRuntimeManifest(list, base);
  assert.equal(manifest.formatVersion, 2);
  assert.deepEqual(manifest.targets["win32-x64"], {
    url: `${base}/poracode-2.1.0-win32-x64.zip`,
    sha256: "b".repeat(64),
    kind: "standalone",
    archive: "zip",
  });
  assert.equal(verifyStandaloneRuntimeManifest(list, manifest), true);
  assert.throws(
    () => buildStandaloneRuntimeManifest([...list, standalone("linux-x64", "c")], base),
    /more than once/u,
  );
  const tampered = structuredClone(manifest);
  tampered.targets["linux-x64"].sha256 = "c".repeat(64);
  assert.throws(() => verifyStandaloneRuntimeManifest(list, tampered), /does not pin/u);
  assert.throws(
    () => verifyStandaloneRuntimeManifest(list, { ...manifest, formatVersion: 1 }),
    /unsupported/u,
  );
  assert.throws(
    () => verifyStandaloneRuntimeManifest([list[0]], manifest),
    /do not match the standalone archives/u,
  );
});
