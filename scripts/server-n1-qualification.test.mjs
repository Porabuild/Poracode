import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  NoPublishedServerN1Error,
  assertTarballChecksum,
  classifyDowngradeRefusalPlan,
  compareSemver,
  pairingCredentialFromCliOutput,
  n1TarballAssetName,
  parsePlainSemver,
  parseTarget,
  redactSecrets,
  selectN1Release,
  serverArtifactAssetName,
  TYPED_EXIT_CODES,
} from "./server-n1-qualification.mjs";

void test("pairing credential extraction consumes raw CLI output before redaction", () => {
  const output = 'startup noise\n{"pairingUrl":"https://fixture.test/pair#token=fixture-secret"}\n';
  assert.equal(pairingCredentialFromCliOutput(output), "fixture-secret");
  assert.throws(() => pairingCredentialFromCliOutput(redactSecrets(output)));
  assert.doesNotThrow(() => JSON.parse(redactSecrets(output).trim().split("\n").at(-1)));
});

// Pure coverage for the published N-1 gate's selection, checksum, redaction,
// and downgrade-planning logic. Everything runs on local fixtures — the tests
// never open a network connection and never invoke a provider or server.

// ── Version parsing / comparison ─────────────────────────────────────────

void test("parsePlainSemver accepts only plain X.Y.Z (v-prefix tolerated)", () => {
  assert.deepEqual(parsePlainSemver("1.8.1"), { major: 1, minor: 8, patch: 1, raw: "1.8.1" });
  assert.deepEqual(parsePlainSemver("v2.0.0"), { major: 2, minor: 0, patch: 0, raw: "2.0.0" });
  assert.equal(parsePlainSemver("1.8.1-rc.1"), null);
  assert.equal(parsePlainSemver("1.8"), null);
  assert.equal(parsePlainSemver("01.8.1"), null);
  assert.equal(parsePlainSemver("release-draft-123"), null);
  assert.equal(parsePlainSemver(""), null);
  assert.equal(parsePlainSemver(undefined), null);
  assert.equal(parsePlainSemver(42), null);
});

void test("compareSemver orders major, minor, then patch", () => {
  assert.equal(compareSemver(parsePlainSemver("1.0.0"), parsePlainSemver("1.0.0")), 0);
  assert.equal(compareSemver(parsePlainSemver("2.0.0"), parsePlainSemver("1.9.9")), 1);
  assert.equal(compareSemver(parsePlainSemver("1.10.0"), parsePlainSemver("1.9.0")), 1);
  assert.equal(compareSemver(parsePlainSemver("1.8.2"), parsePlainSemver("1.8.10")), -1);
});

// ── Target / asset naming ─────────────────────────────────────────────────

void test("target helpers produce the published asset names", () => {
  assert.deepEqual(parseTarget("darwin-arm64"), { platform: "darwin", arch: "arm64" });
  assert.deepEqual(parseTarget("linux-x64"), { platform: "linux", arch: "x64" });
  assert.throws(() => parseTarget("darwin"), /invalid server target/u);
  assert.throws(() => parseTarget("-x64"), /invalid server target/u);
  assert.equal(serverArtifactAssetName("darwin-arm64"), "server-artifact-darwin-arm64.json");
  assert.equal(
    n1TarballAssetName("1.7.0", "darwin-arm64"),
    "poracode-server-1.7.0-darwin-arm64.tar.gz",
  );
});

// ── Release selection ─────────────────────────────────────────────────────

function release(tag, { draft = false, prerelease = false, assets = [] } = {}) {
  return {
    tag_name: tag,
    draft,
    prerelease,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `https://example.invalid/${name}`,
    })),
  };
}

const CANDIDATE = "1.8.1";
const TARGET = "darwin-arm64";
const META = serverArtifactAssetName(TARGET);

void test("selects the newest stable release strictly below the candidate", () => {
  const releases = [
    release("v1.8.1", { assets: [META] }), // equal: never an N-1
    release("v1.9.0", { prerelease: true, assets: [META] }), // prerelease: never stable
    release("v1.7.2", { assets: [META] }),
    release("v1.6.0", { assets: [META] }),
  ];
  const selected = selectN1Release({ releases, candidateVersion: CANDIDATE, target: TARGET });
  assert.equal(selected.version, "1.7.2");
  assert.equal(selected.tag, "v1.7.2");
  assert.equal(selected.metadataAssetName, META);
});

void test("prefers the highest qualifier and records every ignored release", () => {
  const releases = [
    release("v2.0.0", { assets: [META] }), // above candidate
    release("v1.9.0", { draft: true, assets: [META] }), // draft
    release("nightly-2026-09-01"), // unparseable tag
    release("v1.7.9", { assets: ["unrelated.zip"] }), // no metadata asset for the target
    release("v1.4.0", { assets: [META] }),
    release("v1.5.0", { assets: [META] }),
  ];
  const selected = selectN1Release({ releases, candidateVersion: CANDIDATE, target: TARGET });
  assert.equal(selected.version, "1.5.0");
  const byTag = new Map(selected.evidence.map((entry) => [entry.tag, entry]));
  assert.equal(byTag.get("v2.0.0").reason, "version 2.0.0 is not below candidate 1.8.1");
  assert.equal(byTag.get("v1.9.0").reason, "draft");
  assert.equal(byTag.get("nightly-2026-09-01").reason, "tag is not plain X.Y.Z");
  assert.match(byTag.get("v1.7.9").reason, /no server-artifact-darwin-arm64\.json asset/u);
  assert.equal(byTag.get("v1.5.0").decision, "selected");
});

void test("fails closed with typed NO_PUBLISHED_SERVER_N1 and per-release evidence", () => {
  const releases = [
    release("v1.8.1", { assets: [META] }),
    release("v1.9.0", { prerelease: true, assets: [META] }),
  ];
  try {
    selectN1Release({ releases, candidateVersion: CANDIDATE, target: TARGET });
    assert.fail("expected a NoPublishedServerN1Error");
  } catch (error) {
    assert.ok(error instanceof NoPublishedServerN1Error);
    assert.equal(error.code, "NO_PUBLISHED_SERVER_N1");
    assert.match(error.message, /no compatible server N-1/u);
    assert.equal(error.evidence.candidateVersion, CANDIDATE);
    assert.equal(error.evidence.target, TARGET);
    assert.equal(error.evidence.releasesConsidered, 2);
    assert.ok(error.evidence.releases.every((entry) => entry.reason !== null));
  }
});

void test("the no-N-1 verdict also fires when there are no releases at all", () => {
  assert.throws(
    () => selectN1Release({ releases: [], candidateVersion: CANDIDATE, target: TARGET }),
    NoPublishedServerN1Error,
  );
});

void test("an invalid candidate version refuses to select anything", () => {
  assert.throws(
    () =>
      selectN1Release({
        releases: [release("v1.0.0", { assets: [META] })],
        candidateVersion: "main",
        target: TARGET,
      }),
    /not plain X\.Y\.Z/u,
  );
});

// ── Checksum verification ────────────────────────────────────────────────

const GOOD_SHA = "a".repeat(64);

void test("checksum verification passes on matching bytes and fails on any drift", () => {
  const dir = mkdtempSync(join(tmpdir(), "n1-qual-test-"));
  try {
    const tarball = join(dir, "poracode-server-1.7.2-darwin-arm64.tar.gz");
    writeFileSync(tarball, "published bytes");
    const actualSha = createHash("sha256").update("published bytes").digest("hex");

    assert.doesNotThrow(() =>
      assertTarballChecksum({ tarballPath: tarball, expectedSha256: actualSha }),
    );

    assert.throws(
      () => assertTarballChecksum({ tarballPath: tarball, expectedSha256: GOOD_SHA }),
      (error) => {
        assert.match(error.message, /checksum mismatch/u);
        assert.match(error.message, new RegExp(GOOD_SHA));
        assert.match(error.message, new RegExp(actualSha));
        return true;
      },
    );

    assert.throws(
      () =>
        assertTarballChecksum({
          tarballPath: join(dir, "missing.tar.gz"),
          expectedSha256: actualSha,
        }),
      /downloaded tarball is missing/u,
    );

    assert.throws(
      () => assertTarballChecksum({ tarballPath: tarball, expectedSha256: "deadbeef" }),
      /no valid sha256/u,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Redaction ────────────────────────────────────────────────────────────

void test("redaction covers pairing URLs, query tokens, bearers, and token fields", () => {
  const dirty = [
    '{"pairingUrl":"https://pair.poracode.dev/join#token=supersecret"}',
    "pairingUrl = https://pair.poracode.dev/join#token=supersecret trailing",
    "https://host/ws?ticket=abc123def456",
    "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.secret.part",
    '{"accessToken":"secret-value","refreshToken":"other","credential":"cred-1"}',
  ].join("\n");
  const clean = redactSecrets(dirty);
  assert.doesNotMatch(clean, /supersecret/u);
  assert.doesNotMatch(clean, /abc123def456/u);
  assert.doesNotMatch(clean, /eyJhbGciOiJIUzI1NiJ9\.secret/u);
  assert.doesNotMatch(clean, /secret-value|other|cred-1/u);
  assert.match(clean, /\[redacted-pairing-url\]/u);
  assert.match(clean, /ticket=\[redacted\]/u);
  assert.match(clean, /Bearer \[redacted\]/u);
  assert.match(clean, /"accessToken":"\[redacted\]"/u);
});

void test("redaction leaves ordinary text untouched", () => {
  const plain = "upgraded to 1.8.1 (pre-migration backup at /tmp/backup)";
  assert.equal(redactSecrets(plain), plain);
});

// ── Downgrade-refusal planning ───────────────────────────────────────────

void test("downgrade refusal is asserted exactly when the candidate advanced the schema", () => {
  assert.deepEqual(
    classifyDowngradeRefusalPlan({ candidateLatestSchema: 48, n1LatestSchema: 47 }),
    {
      assertRefusal: true,
      reason: "candidate schema 48 is above the N-1 registry 47",
    },
  );
  const equal = classifyDowngradeRefusalPlan({ candidateLatestSchema: 47, n1LatestSchema: 47 });
  assert.equal(equal.assertRefusal, false);
  assert.match(equal.reason, /nothing to refuse by design/u);
  const unreadable = classifyDowngradeRefusalPlan({
    candidateLatestSchema: null,
    n1LatestSchema: 47,
  });
  assert.equal(unreadable.assertRefusal, false);
  assert.match(unreadable.reason, /unreadable/u);
});

// ── Fail-closed exit contract ────────────────────────────────────────────

void test("every typed failure exits nonzero and NO_PUBLISHED_SERVER_N1 is its own code", () => {
  for (const [code, value] of Object.entries(TYPED_EXIT_CODES)) {
    assert.ok(value > 0, `${code} must exit nonzero`);
  }
  assert.equal(TYPED_EXIT_CODES.NO_PUBLISHED_SERVER_N1, 3);
  assert.notEqual(
    TYPED_EXIT_CODES.NO_PUBLISHED_SERVER_N1,
    TYPED_EXIT_CODES.RELEASE_LIST_UNAVAILABLE,
    "infrastructure unavailability must not be mistakable for the no-predecessor verdict",
  );
});
