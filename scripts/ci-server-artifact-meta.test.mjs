import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { copyAggregateLeg, verifyNativeTarget } from "./ci-server-artifact-meta.mjs";
import { standaloneArchiveName, STANDALONE_TARGETS } from "./standalone-runtime.mjs";

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

function standaloneLeg({ version = "2.1.0", target = "linux-x64", tamper = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "standalone-meta-"));
  roots.push(root);
  const name = standaloneArchiveName(version, target);
  const bytes = Buffer.from(`archive-${target}`);
  writeFileSync(join(root, name), tamper ? Buffer.from("tampered") : bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(join(root, `${name}.sha256`), `${sha256}  ${name}\n`);
  writeFileSync(
    join(root, `standalone-${target}.json`),
    JSON.stringify({
      formatVersion: 1,
      kind: "poracode-standalone-archive",
      version,
      target,
      archive: { name, sha256, bytes: bytes.length },
      runtime: { kind: "poracode-standalone-runtime", node: { version: "26.13.0" } },
    }),
  );
  return { root, name };
}

void test("standalone helpers verify sidecars, copy legs and list release sidecars", async () => {
  const { copyStandaloneLeg, locateStandaloneArchive, verifyStandaloneRelease } =
    await import("./ci-server-artifact-meta.mjs");
  const { root, name } = standaloneLeg();
  const located = locateStandaloneArchive({ STANDALONE_DIR: root, TARGET: "linux-x64" });
  assert.equal(located.archive, join(root, name));
  assert.throws(
    () =>
      locateStandaloneArchive({
        STANDALONE_DIR: root,
        TARGET: "linux-x64",
        RELEASE_VERSION: "9.9.9",
      }),
    /expected 9\.9\.9/u,
  );
  const out = join(root, "out");
  const { destination } = copyStandaloneLeg({
    METADATA_FILE: join(root, "standalone-linux-x64.json"),
    OUT_DIR: out,
  });
  assert.equal(destination, join(out, "standalone-linux-x64.json"));
  assert.ok(existsSync(join(out, name)) && existsSync(join(out, `${name}.sha256`)));
  const sidecars = [destination];
  for (const target of STANDALONE_TARGETS.filter((entry) => entry !== "linux-x64")) {
    const peer = standaloneLeg({ target });
    for (const file of [peer.name, `${peer.name}.sha256`, `standalone-${target}.json`]) {
      copyFileSync(join(peer.root, file), join(out, file));
    }
    sidecars.push(join(out, `standalone-${target}.json`));
  }
  sidecars.sort();
  assert.deepEqual(verifyStandaloneRelease({ ASSETS: out }), sidecars);

  const partial = mkdtempSync(join(tmpdir(), "standalone-partial-"));
  roots.push(partial);
  for (const file of readdirSync(out)) {
    if (file !== "standalone-win32-x64.json") copyFileSync(join(out, file), join(partial, file));
  }
  assert.throws(() => verifyStandaloneRelease({ ASSETS: partial }), /missing win32-x64/u);
  const extra = standaloneLeg({ target: "plan9-x64" });
  for (const file of [extra.name, `${extra.name}.sha256`, "standalone-plan9-x64.json"]) {
    copyFileSync(join(extra.root, file), join(out, file));
  }
  assert.throws(() => verifyStandaloneRelease({ ASSETS: out }), /unexpected plan9-x64/u);

  const tampered = standaloneLeg({ tamper: true });
  assert.throws(
    () => locateStandaloneArchive({ STANDALONE_DIR: tampered.root, TARGET: "linux-x64" }),
    /hash mismatch/u,
  );
  const empty = mkdtempSync(join(tmpdir(), "standalone-empty-"));
  roots.push(empty);
  assert.throws(() => verifyStandaloneRelease({ ASSETS: empty }), /no qualified standalone/u);
});

void test("release checksums cover every top-level asset except themselves", async () => {
  const { writeReleaseChecksums } = await import("./release-checksums.mjs");
  const root = mkdtempSync(join(tmpdir(), "release-checksums-"));
  roots.push(root);
  writeFileSync(join(root, "b.zip"), "b");
  writeFileSync(join(root, "a.tar.gz"), "a");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "SHA256SUMS"), "stale\n");
  const { entries } = writeReleaseChecksums(root);
  assert.equal(entries, 2);
  const sha = (text) => createHash("sha256").update(text).digest("hex");
  assert.equal(
    readFileSync(join(root, "SHA256SUMS"), "utf8"),
    `${sha("a")}  a.tar.gz\n${sha("b")}  b.zip\n`,
  );
});
