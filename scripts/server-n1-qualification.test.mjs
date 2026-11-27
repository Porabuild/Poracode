import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { test } from "node:test";
import {
  NoPublishedServerN1Error,
  assertTarballChecksum,
  classifyDowngradeRefusalPlan,
  compareSemver,
  fingerprintPayloads,
  pairingCredentialFromCliOutput,
  n1TarballAssetName,
  parsePlainSemver,
  parseTarget,
  prepareN1FixtureProvider,
  readRunningStatus,
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

void test("the first stable server release can qualify from the latest eligible published nightly", () => {
  const candidateVersion = "2.0.0";
  const nightly = "2.0.0-nightly.202611261547";
  const assetNames = (version) => [META, n1TarballAssetName(version, TARGET)];
  const releases = [
    release("v1.8.2", { assets: ["Poracode-1.8.2-arm64.dmg"] }),
    release(`v${nightly}`, { prerelease: true, assets: assetNames(nightly) }),
    release("v2.0.0-nightly.202611270000", { prerelease: true, assets: [META] }),
    release("v2.0.0-nightly.202611280000", {
      draft: true,
      prerelease: true,
      assets: assetNames("2.0.0-nightly.202611280000"),
    }),
    release("v2.0.0-nightly.202611250745", {
      prerelease: true,
      assets: assetNames("2.0.0-nightly.202611250745"),
    }),
    release("v2.0.1-nightly.202611300000", {
      prerelease: true,
      assets: assetNames("2.0.1-nightly.202611300000"),
    }),
  ];

  const selected = selectN1Release({ releases, candidateVersion, target: TARGET });
  assert.equal(selected.tag, `v${nightly}`);
  assert.equal(selected.version, nightly);
  assert.equal(selected.evidence.find((entry) => entry.tag === selected.tag).decision, "selected");
  assert.throws(
    () => selectN1Release({ releases, candidateVersion: "2.0.1", target: TARGET }),
    NoPublishedServerN1Error,
  );
  assert.throws(
    () => selectN1Release({ releases, candidateVersion, target: "win32-x64" }),
    NoPublishedServerN1Error,
  );

  releases.push(release("v1.9.0", { assets: assetNames("1.9.0") }));
  assert.equal(selectN1Release({ releases, candidateVersion, target: TARGET }).tag, "v1.9.0");
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
  assert.ok(TYPED_EXIT_CODES.STATUS_DETAILS_UNAVAILABLE > 0);
  assert.ok(TYPED_EXIT_CODES.STATUS_CONTRACT_INVALID > 0);
});

// ── Authenticated running-owner status (versioned detailed view) ──────────

void test("readRunningStatus reads formatVersion 1 running-owner .status.build", () => {
  let capturedArgs = null;
  const reply = {
    formatVersion: 1,
    view: "running-owner",
    status: {
      build: {
        version: "2.0.0-nightly.1",
        entrypointSha256: "a".repeat(64),
        root: "/p",
        layoutKind: "prefix",
      },
      dataRoot: "/p/data",
    },
  };
  const runCli = (_entry, args) => {
    capturedArgs = args;
    return { stdout: `${JSON.stringify(reply)}\n` };
  };
  const status = readRunningStatus(runCli, "entry", {});
  assert.deepEqual(capturedArgs, ["status", "--details", "--json"]);
  assert.equal(status.build.version, "2.0.0-nightly.1");
  assert.equal(status.dataRoot, "/p/data");
});

void test("readRunningStatus fails closed on any basic, legacy or malformed status", () => {
  const withReply = (reply) => () =>
    readRunningStatus(() => ({ stdout: `${JSON.stringify(reply)}\n` }), "e", {});
  const contractInvalid = (reply) =>
    assert.throws(withReply(reply), { code: "STATUS_CONTRACT_INVALID" });
  // Plain `status --json` describe reply: no build identity at all.
  contractInvalid({ requestId: "r", ownerGeneration: "g", description: { state: "ready" } });
  // The raw host-control `.result.build` shape the CLI never emits: no fallback.
  contractInvalid({ result: { build: { version: "1.0.0" }, dataRoot: "/d" } });
  contractInvalid({
    formatVersion: 2,
    view: "running-owner",
    status: { build: { version: "x" }, dataRoot: "/d" },
  });
  contractInvalid({
    formatVersion: 1,
    view: "other",
    status: { build: { version: "x" }, dataRoot: "/d" },
  });
  contractInvalid({
    formatVersion: 1,
    view: "running-owner",
    status: { build: {}, dataRoot: "/d" },
  });
  contractInvalid({ formatVersion: 1, view: "running-owner", status: { build: { version: "x" } } });
  // CLI failure and non-JSON output.
  assert.throws(
    () =>
      readRunningStatus(
        () => {
          throw new Error("status not supported");
        },
        "e",
        {},
      ),
    { code: "STATUS_DETAILS_UNAVAILABLE" },
  );
  assert.throws(() => readRunningStatus(() => ({ stdout: "not json" }), "e", {}), {
    code: "STATUS_CONTRACT_INVALID",
  });
});

// ── Persisted terminal scrollback fingerprint (real layout, chunked bytes) ─

void test("fingerprintPayloads finds the marker in legacy and chunked scrollback", () => {
  const require = createRequire(import.meta.url);
  const Database = require("better-sqlite3");
  const db = new Database(":memory:");
  const MARKER = "n1q-86-turn";
  const THREAD = "n1-qual-shell";
  try {
    db.exec(`
      CREATE TABLE app_state (key TEXT, value TEXT);
      CREATE TABLE projects (id TEXT, name TEXT, location_path TEXT);
      CREATE TABLE threads (id TEXT, agent_kind TEXT, status TEXT);
      CREATE TABLE thread_terminal_scrollback
        (thread_id TEXT, transcript TEXT, output_length INTEGER, chunked INTEGER,
         stored_chars INTEGER, next_seq INTEGER);
      CREATE TABLE thread_terminal_scrollback_chunks
        (thread_id TEXT, seq INTEGER, chars INTEGER, data BLOB);
      CREATE TABLE remote_command_receipts
        (command_id TEXT, route TEXT, state TEXT, response TEXT, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE thread_runtime_items
        (item_id TEXT, type TEXT, state TEXT, thread_id TEXT, payload TEXT);
    `);
    db.prepare("INSERT INTO threads (id, agent_kind, status) VALUES (?, ?, ?)").run(
      THREAD,
      "claude",
      "inactive",
    );
    const insertChunk = (seq, text) =>
      db
        .prepare(
          "INSERT INTO thread_terminal_scrollback_chunks (thread_id, seq, chars, data) VALUES (?, ?, ?, ?)",
        )
        .run(THREAD, seq, text.length, Buffer.from(text, "utf16le"));
    const insertRow = (transcript, chunked) =>
      db
        .prepare(
          "INSERT INTO thread_terminal_scrollback (thread_id, transcript, chunked) VALUES (?, ?, ?)",
        )
        .run(THREAD, transcript, chunked);
    const reset = () => {
      db.prepare("DELETE FROM thread_terminal_scrollback").run();
      db.prepare("DELETE FROM thread_terminal_scrollback_chunks").run();
    };
    const fingerprint = (marker) =>
      fingerprintPayloads({
        database: db,
        shellId: THREAD,
        projectPath: "/p",
        receiptId: "r",
        goalMarker: null,
        scrollbackMarker: marker,
      }).scrollbackMarker;

    // (a) Legacy layout: marker in the plain transcript column.
    insertRow(`# echo ${MARKER}\r\n`, 0);
    assert.ok(fingerprint(MARKER), "legacy transcript marker must be found");

    // (b) Chunked, single chunk (the published N-1 run shape).
    reset();
    insertRow("", 1);
    insertChunk(0, `# sh -c 'echo n1q-$((84+2))-turn'\r\nn1q-86-turn\r\n# `);
    assert.ok(fingerprint(MARKER), "single-chunk marker must be found");

    // (c) Chunked with the marker deliberately SPLIT across two UTF-16LE chunks.
    reset();
    insertRow("", 1);
    insertChunk(0, "# n1q-"); // ends mid-marker
    insertChunk(1, "86-turn\r\n# "); // resumes mid-marker
    assert.ok(fingerprint(MARKER), "marker split across chunks must be found by joining first");

    // (d) Fail-closed: chunked bytes without the marker.
    reset();
    insertRow("", 1);
    insertChunk(0, "no marker here");
    assert.equal(fingerprint(MARKER), null, "an absent marker must fail closed");

    // (e) Fail-closed: chunked row with no chunks at all.
    reset();
    insertRow("", 1);
    assert.equal(fingerprint(MARKER), null, "a chunked row with no bytes must fail closed");

    // (f) Fail-closed: a chunked header with a STALE marker in the legacy
    // transcript column and empty/absent chunk storage must NOT fall back to
    // that column (production reads only chunks).
    reset();
    insertRow(`# echo ${MARKER}\r\n`, 1); // stale legacy transcript, no chunks
    assert.equal(fingerprint(MARKER), null, "stale legacy marker must never satisfy a chunked row");
  } finally {
    db.close();
  }
});

// ── Fixture provider isolation ───────────────────────────────────────────

void test(
  "prepareN1FixtureProvider resolves the fixture ahead of inherited PATH and login init",
  { skip: process.platform === "win32" },
  () => {
    const root = mkdtempSync(join(tmpdir(), "n1-fixture-"));
    try {
      const fixtureHome = join(root, "fixture-home");
      const sentinelBin = join(root, "sentinel-bin");
      mkdirSync(sentinelBin, { recursive: true });
      mkdirSync(fixtureHome, { recursive: true });

      // Inert stand-in for a real provider earlier on the inherited PATH: any
      // resolution that reaches it records the run in SENTINEL_MARKER.
      const sentinel = join(sentinelBin, "claude");
      writeFileSync(
        sentinel,
        '#!/bin/sh\n[ -n "${SENTINEL_MARKER:-}" ] && echo ran >> "$SENTINEL_MARKER"\n' +
          'echo "9.9.9-sentinel-provider"\n',
      );
      chmodSync(sentinel, 0o755);

      // Startup files a login shell would read, plus the $ENV/$BASH_ENV hooks
      // non-interactive shells honor: all prepend the sentinel dir and record
      // that they ran, so a leaked login flag or unset guard fails loudly.
      const pathTrap =
        `PATH="${sentinelBin}:$PATH"\nexport PATH\n` +
        '[ -n "${PROFILE_MARKER:-}" ] && echo ran >> "$PROFILE_MARKER"\n';
      for (const name of [".profile", ".bash_profile", ".bash_login"]) {
        writeFileSync(join(fixtureHome, name), pathTrap);
      }
      const envTrap = join(root, "env-trap.sh");
      writeFileSync(envTrap, pathTrap);

      const inheritedPath = [sentinelBin, process.env.PATH].filter(Boolean).join(delimiter);
      const overlay = prepareN1FixtureProvider(fixtureHome, inheritedPath);
      const binDir = join(fixtureHome, ".local", "bin");
      const fixtureClaude = join(binDir, "claude");
      const sentinelMarker = join(root, "sentinel-ran");
      const profileMarker = join(root, "profile-ran");

      assert.equal(overlay.HOME, fixtureHome);
      assert.equal(overlay.PATH, `${binDir}${delimiter}${inheritedPath}`);
      assert.ok(overlay.SHELL.startsWith(fixtureHome));
      assert.ok(existsSync(fixtureClaude));
      assert.ok(existsSync(overlay.SHELL));
      assert.ok(statSync(fixtureClaude).mode & 0o111, "fixture provider must be executable");
      assert.ok(statSync(overlay.SHELL).mode & 0o111, "fixture shell must be executable");

      const probeEnv = {
        ...overlay,
        SENTINEL_MARKER: sentinelMarker,
        PROFILE_MARKER: profileMarker,
        ENV: envTrap,
        BASH_ENV: envTrap,
      };
      const probe = (args, options = {}) =>
        spawnSync(overlay.SHELL, args, { encoding: "utf8", env: probeEnv, ...options });

      // Released login-arg forms: `-l -c` (Linux), `-l -i -c` (macOS), and the
      // native Node probe's combined `-lic`.
      for (const loginArgs of [["-l", "-c"], ["-l", "-i", "-c"], ["-lic"]]) {
        const which = probe([...loginArgs, "command -v claude"]);
        assert.equal(which.status, 0, which.stderr);
        assert.equal(which.stdout.trim(), fixtureClaude);

        const version = probe([...loginArgs, "claude --version"]);
        assert.equal(version.status, 0, version.stderr);
        assert.equal(version.stdout.trim(), "2.0.0 (poracode-n1-fixture)");
      }

      // The probe environment reports the fixture HOME, and no login startup
      // file or shell-init hook ran while resolving the fixture.
      const home = probe(["-l", "-c", 'echo "$HOME"']);
      assert.equal(home.stdout.trim(), fixtureHome);
      assert.equal(existsSync(sentinelMarker), false, "an inherited provider must never run");
      assert.equal(existsSync(profileMarker), false, "login init must not run for command probes");

      // A bare -l drops the login flag too: the shim still accepts commands on
      // stdin, but no login profile or host startup file ever runs — nothing
      // in the qualification needs login startup.
      const interactive = probe(["-l"], { input: "echo n1-bare-ok\nexit\n" });
      assert.equal(interactive.status, 0, interactive.stderr);
      assert.match(interactive.stdout, /n1-bare-ok/u);
      assert.equal(
        existsSync(profileMarker),
        false,
        "bare -l must not source login profiles or host startup files",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
