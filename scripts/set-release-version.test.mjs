import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { setReleaseVersion } from "./set-release-version.mjs";

const tempDirs = [];
after(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "poracode-release-version-"));
  tempDirs.push(root);
  mkdirSync(join(root, "packages", "poracode-cli"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"poracode","version":"1.8.1"}\n');
  writeFileSync(
    join(root, "packages", "poracode-cli", "package.json"),
    '{"name":"poracode","version":"1.8.1"}\n',
  );
  writeFileSync(
    join(root, "packages", "poracode-cli", "runtime-manifest.json"),
    `${JSON.stringify({
      formatVersion: 1,
      version: "1.8.1",
      targets: {
        "linux-x64": { url: "https://example.invalid/old.tar.gz", sha256: "a".repeat(64) },
      },
    })}\n`,
  );
  return root;
}

void test("setReleaseVersion keeps the package and launcher manifest versions equal", () => {
  const root = fixtureRoot();
  const written = setReleaseVersion("1.9.0", root);
  assert.equal(written.length, 3);
  for (const path of written) {
    assert.ok(readFileSync(path, "utf8").includes("1.9.0"), `${path} must carry 1.9.0`);
  }
  const manifest = JSON.parse(
    readFileSync(join(root, "packages", "poracode-cli", "runtime-manifest.json"), "utf8"),
  );
  assert.equal(manifest.version, "1.9.0");
  // A new version must not keep advertising the previous release's bytes.
  assert.deepEqual(manifest.targets, {});
});

void test("setReleaseVersion refuses a non-semver version", () => {
  const root = fixtureRoot();
  assert.throws(() => setReleaseVersion("latest", root), /non-semver/u);
});
