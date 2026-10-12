import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { copyAggregateLeg, verifyNativeTarget } from "./ci-server-artifact-meta.mjs";

const roots = [];
function leg(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), "artifact-meta-"));
  roots.push(root);
  const legDir = join(root, "leg with space");
  mkdirSync(legDir);
  const bytes = Buffer.from("tarball");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const version = overrides.version ?? "1.2.3";
  const name = `poracode-server-${version}-win32-x64.tar.gz`;
  writeFileSync(join(legDir, name), bytes);
  writeFileSync(join(legDir, `${name}.sha256`), `${sha256}\n`);
  writeFileSync(
    join(legDir, "server-artifact.json"),
    JSON.stringify({
      version,
      platform: "win32",
      arch: "x64",
      targets: ["win32-x64"],
      tarball: { name, sha256 },
      ...overrides,
    }),
  );
  return { root, legDir };
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

void test("native-target checks the nightly version before exporting artifact paths", () => {
  const version = "2.0.0-nightly.202610120050";
  const { root, legDir } = leg({ version });
  const githubEnv = join(root, "github-env");
  const env = { QUALIFIED_DIR: legDir, TARGET: "win32-x64", GITHUB_ENV: githubEnv };
  assert.throws(
    () => verifyNativeTarget({ ...env, RELEASE_VERSION: "2.0.0" }),
    /expected 2\.0\.0/u,
  );
  assert.equal(existsSync(githubEnv), false);
  assert.equal(
    verifyNativeTarget({ ...env, RELEASE_VERSION: version }).meta,
    join(legDir, "server-artifact.json"),
  );
  // Ordinary CI has no release pin and verifies the source-version artifact.
  assert.doesNotThrow(() => verifyNativeTarget({ ...env, RELEASE_VERSION: "" }));
});

void test("native-target verifies advertisement and hash and exports TARBALL/META", () => {
  const { root, legDir } = leg();
  const githubEnv = join(root, "github-env");
  const result = verifyNativeTarget({
    QUALIFIED_DIR: legDir,
    TARGET: "win32-x64",
    GITHUB_ENV: githubEnv,
  });
  assert.equal(result.tarball, join(legDir, "poracode-server-1.2.3-win32-x64.tar.gz"));
  assert.match(readFileSync(githubEnv, "utf8"), /^TARBALL=.*\nMETA=.*\n$/u);
  assert.throws(
    () => verifyNativeTarget({ QUALIFIED_DIR: legDir, TARGET: "linux-x64" }),
    /not advertised/u,
  );
});

void test("native-target rejects a tampered tarball", () => {
  const { legDir } = leg({
    tarball: { name: "poracode-server-1.2.3-win32-x64.tar.gz", sha256: "0" },
  });
  assert.throws(
    () => verifyNativeTarget({ QUALIFIED_DIR: legDir, TARGET: "win32-x64" }),
    /hash mismatch/u,
  );
});

void test("aggregate-leg copies the leg under the platform-arch metadata name", () => {
  const { root, legDir } = leg();
  const outDir = join(root, "out");
  const result = copyAggregateLeg({
    METADATA_FILE: join(legDir, "server-artifact.json"),
    OUT_DIR: outDir,
    RELEASE_VERSION: "1.2.3",
  });
  assert.equal(result.destination, join(outDir, "server-artifact-win32-x64.json"));
  assert.ok(existsSync(join(outDir, "poracode-server-1.2.3-win32-x64.tar.gz.sha256")));
  assert.throws(
    () =>
      copyAggregateLeg({
        METADATA_FILE: join(legDir, "server-artifact.json"),
        OUT_DIR: outDir,
        RELEASE_VERSION: "9.9.9",
      }),
    /expected 9\.9\.9/u,
  );
});
