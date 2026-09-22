#!/usr/bin/env node
/**
 * Fail-closed published N-1 server upgrade qualification.
 *
 * Proves the supplied candidate tarball upgrades a REAL published predecessor
 * release without losing persisted payloads:
 *
 *  1. Resolve the newest stable published GitHub release strictly below the
 *     candidate version that publishes a `server-artifact-<platform>-<arch>.json`
 *     metadata file for the running target.
 *  2. Download that release's metadata + tarball, validate the metadata, and
 *     verify the published sha256 checksum. No checksum, no gate.
 *  3. Install the N-1 release into a prefix OUTSIDE this checkout, start it,
 *     and seed representative real persisted payloads through its
 *     authenticated HTTP surface: a project (catalog), a terminal thread with
 *     a genuinely executed turn, a thread goal where the release supports it,
 *     and an interrupted command receipt written into the release's own
 *     database. Every seeded row is fingerprinted from sqlite before the
 *     upgrade so the post-upgrade comparison is against real N-1-written
 *     bytes, never assumptions.
 *  4. Upgrade the same prefix in place to the candidate tarball with the
 *     server's own `upgrade` CLI, then reopen and assert: every seeded
 *     payload survived, the running build identity is the exact candidate
 *     bytes, the recorded schema advanced to the candidate's migration
 *     registry, and (once the schema advanced past the N-1 registry)
 *     downgrading back to the N-1 artifact is refused.
 *
 * Failure is the only honest answer when no published compatible server N-1
 * exists: the script exits nonzero with a typed `NO_PUBLISHED_SERVER_N1`
 * result and per-release evidence, never a pass or a not-applicable.
 * Infrastructure failures that leave the question undecided (GitHub API
 * unavailable) get their own typed codes so they cannot be mistaken for the
 * no-predecessor verdict. Secrets (pairing URLs, tokens, tickets) are
 * redacted from every printed byte.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { installServerPrefix } from "./install-server-prefix.mjs";
import { readServerArtifactMetadata } from "./server-artifact-metadata.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── Typed failures ───────────────────────────────────────────────────────

export class NoPublishedServerN1Error extends Error {
  constructor(message, evidence) {
    super(message);
    this.name = "NoPublishedServerN1Error";
    this.code = "NO_PUBLISHED_SERVER_N1";
    this.evidence = evidence;
  }
}

export const TYPED_EXIT_CODES = {
  QUALIFICATION_FAILED: 1,
  NO_PUBLISHED_SERVER_N1: 3,
  RELEASE_LIST_UNAVAILABLE: 4,
  N1_ARTIFACT_INVALID: 5,
  CANDIDATE_INVALID: 6,
  SQLITE_UNAVAILABLE: 7,
};

// ── Pure selection / version logic (unit-tested, no network, no fs) ─────

const PLAIN_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Plain X.Y.Z only — the repo's only published version shape. Null otherwise. */
export function parsePlainSemver(value) {
  if (typeof value !== "string") return null;
  const raw = value.startsWith("v") ? value.slice(1) : value;
  if (!PLAIN_SEMVER.test(raw)) return null;
  const [major, minor, patch] = raw.split(".").map(Number);
  return { major, minor, patch, raw };
}

/** -1 / 0 / 1 on plain X.Y.Z versions. */
export function compareSemver(a, b) {
  for (const field of ["major", "minor", "patch"]) {
    if (a[field] !== b[field]) return a[field] > b[field] ? 1 : -1;
  }
  return 0;
}

export function parseTarget(target) {
  const index = target.indexOf("-");
  if (index <= 0) throw new Error(`invalid server target "${target}" (expected <platform>-<arch>)`);
  return { platform: target.slice(0, index), arch: target.slice(index + 1) };
}

export function serverArtifactAssetName(target) {
  return `server-artifact-${target}.json`;
}

export function n1TarballAssetName(version, target) {
  return `poracode-server-${version}-${target}.tar.gz`;
}

/**
 * Pick the N-1 release: the newest stable (non-draft, non-prerelease, plain
 * X.Y.Z tag) published release STRICTLY below the candidate version whose
 * asset list carries the target's `server-artifact-<target>.json`. Releases
 * that fail any requirement are recorded in the evidence with the reason, so
 * a `NO_PUBLISHED_SERVER_N1` verdict is auditable rather than a shrug.
 */
export function selectN1Release({ releases, candidateVersion, target }) {
  const candidate = parsePlainSemver(candidateVersion);
  if (!candidate) throw new Error(`candidate version is not plain X.Y.Z: "${candidateVersion}"`);
  const wantedMetadata = serverArtifactAssetName(target);

  const evidence = [];
  let best = null;
  for (const release of releases ?? []) {
    const tag =
      typeof release?.tag_name === "string" ? release.tag_name : String(release?.tag_name);
    const entry = { tag, decision: null, reason: null };
    const ignore = (reason) => {
      entry.decision = "ignored";
      entry.reason = reason;
      evidence.push(entry);
    };
    if (release?.draft === true) {
      ignore("draft");
      continue;
    }
    if (release?.prerelease === true) {
      ignore("prerelease");
      continue;
    }
    const version = parsePlainSemver(tag);
    if (!version) {
      ignore("tag is not plain X.Y.Z");
      continue;
    }
    entry.version = version.raw;
    if (compareSemver(version, candidate) >= 0) {
      ignore(`version ${version.raw} is not below candidate ${candidate.raw}`);
      continue;
    }
    const assetNames = (release.assets ?? []).map((asset) => asset?.name).filter(Boolean);
    if (!assetNames.includes(wantedMetadata)) {
      ignore(`no ${wantedMetadata} asset (assets: ${assetNames.join(", ") || "none"})`);
      continue;
    }
    entry.decision = "candidate";
    evidence.push(entry);
    if (best === null || compareSemver(version, best) > 0) best = { ...version, release };
  }

  if (best === null) {
    throw new NoPublishedServerN1Error(
      `No published stable release strictly below ${candidate.raw} publishes ` +
        `${wantedMetadata} — there is no compatible server N-1 to upgrade from.`,
      {
        candidateVersion: candidate.raw,
        target,
        wantedMetadataAsset: wantedMetadata,
        releasesConsidered: evidence.length,
        releases: evidence,
      },
    );
  }
  const chosen = evidence.find((entry) => entry.version === best.raw);
  chosen.decision = "selected";
  return {
    tag: best.release.tag_name,
    version: best.raw,
    metadataAssetName: wantedMetadata,
    evidence,
  };
}

/**
 * Fail-closed checksum verification: the published metadata is the only
 * authority for what the N-1 bytes must hash to. A missing file or a
 * mismatch throws with both digests; a release without usable checksum
 * metadata must never qualify.
 */
export function assertTarballChecksum({ tarballPath, expectedSha256 }) {
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(expectedSha256)) {
    throw new Error(`published metadata carries no valid sha256 (got ${expectedSha256})`);
  }
  if (!existsSync(tarballPath)) throw new Error(`downloaded tarball is missing: ${tarballPath}`);
  const actual = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `published N-1 tarball checksum mismatch: expected ${expectedSha256}, got ${actual} ` +
        `(${tarballPath})`,
    );
  }
}

// ── Secret redaction ─────────────────────────────────────────────────────

const PAIRING_URL_PATTERN = /(pairingUrl["']?\s*[:=]\s*["']?)(https?:\/\/[^\s"',}\]]+)/gi;
const QUERY_SECRET_PATTERN = /([?&#](?:token|ticket|credential)=)[^\s&"',}\]]+/gi;
const BEARER_PATTERN = /(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi;
const JSON_SECRET_PATTERN =
  /("(?:accessToken|refreshToken|token|credential|password|api[_-]?key)"\s*:\s*")([^"]+)(")/gi;

/** Redact pairing URLs, query-token values, bearer tokens, and token fields. */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(PAIRING_URL_PATTERN, "$1[redacted-pairing-url]")
    .replace(QUERY_SECRET_PATTERN, "$1[redacted]")
    .replace(BEARER_PATTERN, "$1[redacted]")
    .replace(JSON_SECRET_PATTERN, "$1[redacted]$3");
}

// ── Downgrade-refusal planning ───────────────────────────────────────────

/**
 * The candidate refuses a downgrade only through the schema registry: an
 * install whose recorded schema advanced past the N-1 artifact's registry
 * must refuse the N-1 bytes. When the candidate did not advance the schema
 * there is nothing to refuse by design, so the assertion is recorded as
 * planned-out instead of being silently dropped.
 */
export function classifyDowngradeRefusalPlan({ candidateLatestSchema, n1LatestSchema }) {
  if (!Number.isSafeInteger(candidateLatestSchema) || !Number.isSafeInteger(n1LatestSchema)) {
    return {
      assertRefusal: false,
      reason: `schema registries unreadable (candidate=${candidateLatestSchema}, n1=${n1LatestSchema})`,
    };
  }
  if (candidateLatestSchema > n1LatestSchema) {
    return {
      assertRefusal: true,
      reason: `candidate schema ${candidateLatestSchema} is above the N-1 registry ${n1LatestSchema}`,
    };
  }
  return {
    assertRefusal: false,
    reason:
      `candidate schema ${candidateLatestSchema} did not advance past the N-1 registry ` +
      `${n1LatestSchema}; the schema downgrade guard has nothing to refuse by design`,
  };
}

// ── Impure orchestration (network, processes, fs) ────────────────────────

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function assertPrefixOutsideCheckout(prefix, repoRoot) {
  const resolvedPrefix = resolve(prefix);
  const resolvedRoot = resolve(repoRoot);
  const rel = relative(resolvedRoot, resolvedPrefix);
  if (!isAbsolute(resolvedPrefix) || rel === "" || !rel.startsWith(`..${sep}`)) {
    throw new Error(
      `install prefix must live outside the checkout: ${resolvedPrefix} is inside ${resolvedRoot}`,
    );
  }
}

/** Run an installed-server CLI command; every failure output is redacted. */
function runServerCli(entry, args, env, { timeoutMs = 300_000 } = {}) {
  const run = spawnSync(process.execPath, [entry, ...args], {
    encoding: "utf8",
    env,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });
  const stdout = run.stdout ?? "";
  const stderr = run.stderr ?? "";
  if (run.status !== 0) {
    throw new Error(
      `server CLI ${args[0]} exited ${run.status}: ${redactSecrets(stdout).trim()} ${redactSecrets(stderr).trim()}`.trim(),
    );
  }
  return { status: run.status, stdout, stderr };
}

function parseLastJsonLine(output) {
  const line = output.trim().split("\n").at(-1);
  return JSON.parse(line);
}

/** Extract the one-use pairing credential from raw `pair --json` output. */
export function pairingCredentialFromCliOutput(output) {
  const pairing = parseLastJsonLine(output);
  const credential = new URLSearchParams(new URL(pairing.pairingUrl).hash.replace(/^#/, "")).get(
    "token",
  );
  if (!credential) throw new Error("pair --json output carries no credential token");
  return credential;
}

function allocateLoopbackPort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate port"));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

/** Environment for a spawned server/CLI step. `port === null` selects a
 * read-only one-shot command (doctor, pair, status) that must not bind. */
function serverEnv(profile, port) {
  const inherited = { ...process.env };
  // The qualification process needs these for GitHub release downloads; the
  // installed server and the real PTY it launches do not. Keep workflow
  // credentials out of child environments entirely.
  delete inherited.GH_TOKEN;
  delete inherited.GITHUB_TOKEN;
  return {
    ...inherited,
    PORACODE_BASE_DIR: profile,
    PORACODE_HEADLESS_SERVER: "1",
    PORACODE_SECRET_STORAGE_KEY:
      process.env.PORACODE_SECRET_STORAGE_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    ...(port === null
      ? {}
      : { PORACODE_REMOTE_ACCESS_HOST: "127.0.0.1", PORACODE_REMOTE_ACCESS_PORT: String(port) }),
  };
}

async function jsonRequest(fetchImpl, url, { method = "GET", token, body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetchImpl(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30_000),
  });
  const text = redactSecrets(await response.text());
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function downloadAsset(fetchImpl, asset, destination, token) {
  // Authenticated downloads must go through the API asset URL with an
  // octet-stream accept; unauthenticated ones use the browser URL. The token
  // only travels in headers and is never logged.
  const useApiUrl = Boolean(token) && Number.isSafeInteger(asset.id);
  const url = useApiUrl
    ? `https://api.github.com/repos/${asset.repo}/releases/assets/${asset.id}`
    : asset.browser_download_url;
  if (!url) throw new Error(`release asset ${asset.name} has no downloadable URL`);
  const response = await fetchImpl(url, {
    headers: {
      "user-agent": "poracode-n1-qualification",
      ...(useApiUrl ? { accept: "application/octet-stream" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(600_000),
  });
  if (!response.ok || !response.body) {
    throw new Error(
      `download of ${asset.name} failed: HTTP ${response.status} (repo asset, not an auth echo)`,
    );
  }
  await pipeline(response.body, createWriteStream(destination));
  return destination;
}

async function fetchAllReleases(fetchImpl, repo, token) {
  const pages = [];
  for (let page = 1; page <= 3; page += 1) {
    const response = await fetchImpl(
      `https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`,
      {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "poracode-n1-qualification",
          "x-github-api-version": "2022-11-28",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      const detail = redactSecrets(await response.text().catch(() => ""));
      const error = new Error(
        `GitHub release list for ${repo} returned HTTP ${response.status}` +
          (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0"
            ? " (rate limited; set GITHUB_TOKEN)"
            : "") +
          (detail ? `: ${detail.slice(0, 300)}` : ""),
      );
      error.code = "RELEASE_LIST_UNAVAILABLE";
      throw error;
    }
    const batch = await response.json();
    pages.push(...(Array.isArray(batch) ? batch : []));
    if (!Array.isArray(batch) || batch.length < 100) break;
  }
  return pages;
}

function gitInit(dir) {
  mkdirSync(dir, { recursive: true });
  const run = (args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 60_000 });
  if (run(["init"]).status !== 0) throw new Error(`git init failed in ${dir}`);
  writeFileSync(join(dir, "README.md"), "n1 qualification\n");
  run(["add", "README.md"]);
  const commit = run([
    "-c",
    "user.email=n1qual@poracode.local",
    "-c",
    "user.name=n1qual",
    "commit",
    "-m",
    "init",
  ]);
  if (commit.status !== 0) throw new Error(`git commit failed in ${dir}`);
}

function makeProjectLocation(cwd) {
  return process.platform === "win32"
    ? { kind: "windows", path: cwd }
    : { kind: "posix", path: cwd };
}

function waitForText(stream, needle, timeoutMs) {
  return new Promise((resolveWait, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${needle}`)), timeoutMs);
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      if (buffer.includes(needle)) {
        clearTimeout(timer);
        stream.off("data", onData);
        resolveWait(buffer);
      }
    };
    stream.on("data", onData);
  });
}

async function healthOk(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

function startPtyWatch(wsUrl, shellId) {
  const ws = new WebSocket(wsUrl);
  let buffer = "";
  const opened = new Promise((resolveOpened, reject) => {
    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "terminal-watch", id: shellId }));
      resolveOpened();
    });
    ws.addEventListener("error", () => reject(new Error("terminal watch failed to connect")));
  });
  return {
    opened,
    waitFor(needle, timeoutMs) {
      return new Promise((resolveFrame, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timed out waiting for PTY output ${needle}`)),
          timeoutMs,
        );
        const onMessage = (event) => {
          let frame;
          try {
            frame = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (frame?.type === "terminal-output" && typeof frame.data === "string") {
            buffer += frame.data;
            if (buffer.includes(needle)) {
              clearTimeout(timer);
              ws.removeEventListener("message", onMessage);
              resolveFrame(true);
            }
          }
        };
        if (buffer.includes(needle)) {
          clearTimeout(timer);
          resolveFrame(true);
          return;
        }
        ws.addEventListener("message", onMessage);
      });
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolveExit();
    }, 20_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit();
    });
  });
}

function readOwnerRecord(profile) {
  const path = `${profile}.host-owner.json`;
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

async function waitForOwnerPhase(profile, phase, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const record = readOwnerRecord(profile);
    let holderGone = true;
    if (record && Number.isSafeInteger(record.pid) && record.pid > 0) {
      try {
        process.kill(record.pid, 0);
        holderGone = false;
      } catch {
        holderGone = true;
      }
    }
    if (record?.phase === phase && holderGone) return record;
    if (Date.now() >= deadline) {
      throw new Error(
        `owner lease did not reach phase=${phase}: ${JSON.stringify(readOwnerRecord(profile))}`,
      );
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
}

/**
 * Stop a daemon this script does not own as a child — the upgrade CLI
 * respawns the candidate detached and records its pid at
 * `<prefix>/poracode-server.pid`. Without this the respawned daemon would
 * outlive the gate still holding the lease and the port.
 */
async function stopPidFileDaemon(prefix, profile) {
  const pidPath = join(prefix, "poracode-server.pid");
  if (!existsSync(pidPath)) return;
  const pid = Number(readFileSync(pidPath, "utf8").trim());
  if (Number.isSafeInteger(pid) && pid > 0) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await waitForOwnerPhase(profile, "stopped", 30_000);
}

/** Pair against the running daemon; the pairing URL never survives an error. */
async function pairAndAuthenticate(runCli, entry, env, httpBase, fetchImpl) {
  // Parse the credential from the in-memory raw result. Redaction belongs at
  // log/evidence sinks; redacting before this point would destroy the URL the
  // gate itself must exchange.
  const credential = pairingCredentialFromCliOutput(runCli(entry, ["pair", "--json"], env).stdout);

  const token = await jsonRequest(fetchImpl, `${httpBase}/oauth/token`, {
    method: "POST",
    body: {
      grantType: "pairing-token",
      credential,
      scopes: [
        "session:read",
        "session:operate",
        "projects:manage",
        "terminal:operate",
        "terminal:read",
      ],
      client: { label: "n1-qualify", deviceType: "desktop" },
    },
  });
  if (token.status !== 200) throw new Error(`pairing token exchange failed: ${token.status}`);
  return token.body.accessToken;
}

function assertDoctorOk(runCli, entry, env, label) {
  const report = parseLastJsonLine(runCli(entry, ["doctor", "--json"], env).stdout);
  if ((report.checks ?? []).some((check) => check.status === "error")) {
    throw new Error(`${label} doctor failed: ${JSON.stringify(report).slice(0, 2_000)}`);
  }
  return report;
}

/** Authenticated status of the running owner (build identity + roots). */
function readRunningStatus(runCli, entry, env) {
  const reply = parseLastJsonLine(runCli(entry, ["status", "--json"], env).stdout);
  if (!reply?.result?.build?.version) {
    throw new Error(
      `status --json returned no build identity: ${JSON.stringify(reply).slice(0, 500)}`,
    );
  }
  return reply.result;
}

/** Tolerant read of a list route: modern bounded reads first, plain fallback. */
async function listRoute(fetchImpl, url, token, modernQuery, fallbackQuery) {
  const modern = await jsonRequest(fetchImpl, `${url}${modernQuery}`, { token });
  if (modern.status === 200) return { status: 200, body: modern.body, via: modernQuery };
  const plain = await jsonRequest(fetchImpl, `${url}${fallbackQuery}`, { token });
  return { ...plain, via: fallbackQuery, modernStatus: modern.status };
}

// ── sqlite seeding + fingerprints ────────────────────────────────────────

function openProfileDatabase(dataRoot) {
  let Database;
  try {
    Database = createRequire(join(REPO_ROOT, "package.json"))("better-sqlite3");
  } catch (error) {
    const failure = new Error(
      `better-sqlite3 is not loadable from the checkout (${error?.message ?? error}); ` +
        "install dependencies first — payload assertions must never be skipped",
    );
    failure.code = "SQLITE_UNAVAILABLE";
    throw failure;
  }
  const path = join(dataRoot, "state.sqlite");
  if (!existsSync(path)) {
    const failure = new Error(`profile database is missing at ${path}`);
    failure.code = "SQLITE_UNAVAILABLE";
    throw failure;
  }
  return { database: new Database(path), path };
}

/**
 * Seed an interrupted command receipt directly into the N-1 profile database
 * (the same narrow extraction the upgrade integration tests use). Runs ONCE,
 * on the N-1 install only — the post-upgrade pass fingerprints read-only, so
 * a surviving row can never be confused with one this script re-inserted.
 */
function seedReceipt({ database, shellId, receiptId }) {
  const tableRow = database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'remote_command_receipts'",
    )
    .get();
  if (!tableRow) return { seeded: false, reason: "remote_command_receipts table absent on N-1" };
  const columns = database.prepare("PRAGMA table_info(remote_command_receipts)").all();
  const names = new Set(columns.map((column) => column.name));
  const hasBaseColumns = [
    "command_id",
    "route",
    "state",
    "response",
    "created_at",
    "updated_at",
  ].every((name) => names.has(name));
  if (!hasBaseColumns) {
    return { seeded: false, reason: `receipt columns unusable: ${[...names].sort().join(",")}` };
  }
  database
    .prepare(
      "INSERT OR REPLACE INTO remote_command_receipts " +
        "(command_id, route, state, response, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?)",
    )
    .run(
      receiptId,
      `/api/threads/${shellId}/checkpoint-revert`,
      "in_progress",
      Date.now(),
      Date.now(),
    );
  return { seeded: true, commandId: receiptId };
}

/** Read-only fingerprint of every seeded payload family (never mutates). */
function fingerprintPayloads({ database, shellId, projectPath, receiptId, goalMarker }) {
  const tableExists = (name) =>
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name) !== undefined;
  const fingerprint = {
    schemaVersion:
      database.prepare("SELECT value FROM app_state WHERE key = 'schema_version'").get()?.value ??
      null,
    project: database
      .prepare("SELECT id, name, location_path FROM projects WHERE location_path = ?")
      .get(projectPath),
    thread: database
      .prepare("SELECT id, agent_kind, status FROM threads WHERE id = ?")
      .get(shellId),
    scrollbackMarker: tableExists("thread_terminal_scrollback")
      ? database
          .prepare(
            "SELECT instr(transcript, ?) AS hit FROM thread_terminal_scrollback WHERE thread_id = ?",
          )
          .get(SHELL_MARKER_OUTPUT, shellId)?.hit
      : null,
    receipt: tableExists("remote_command_receipts")
      ? database
          .prepare("SELECT command_id, state FROM remote_command_receipts WHERE command_id = ?")
          .get(receiptId)
      : null,
    goalItem: null,
  };
  if (goalMarker && tableExists("thread_runtime_items")) {
    // Goals persist as runtime items on the shapes this repo ships; the LIKE
    // scan is tolerant to payload-shape drift between N-1 and candidate.
    fingerprint.goalItem = database
      .prepare(
        "SELECT item_id, type, state FROM thread_runtime_items WHERE thread_id = ? AND payload LIKE ?",
      )
      .get(shellId, `%${goalMarker}%`);
  }
  return fingerprint;
}

// ── Candidate helpers ────────────────────────────────────────────────────

/** Read package.json out of the candidate tarball without extracting it. */
function readCandidateVersionFromTarball(tarball) {
  for (const member of ["package.json", "./package.json"]) {
    const run = spawnSync("tar", ["-xzOf", tarball, member], {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (run.status === 0 && run.stdout) {
      const parsed = JSON.parse(run.stdout);
      if (typeof parsed.version === "string" && parsed.version.length > 0) return parsed.version;
    }
  }
  const failure = new Error(
    `candidate tarball ${tarball} carries no readable package.json version`,
  );
  failure.code = "CANDIDATE_INVALID";
  throw failure;
}

function resolveRepo(options) {
  if (options.repo) return options.repo;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const url = (remote.stdout ?? "").trim();
  const ssh = url.match(/^git@[^:]+:([^/]+)\/(.+?)(?:\.git)?$/u);
  const https = url.match(/github\.com[/:]([^/]+)\/(.+?)(?:\.git)?$/u);
  const match = ssh ?? https;
  if (match) return `${match[1]}/${match[2]}`;
  throw new Error(
    "cannot resolve the GitHub repository: pass --repo owner/name or set GITHUB_REPOSITORY",
  );
}

// ── Main flow ────────────────────────────────────────────────────────────

const SHELL_ID = "n1-qual-shell";
const SHELL_MARKER_OUTPUT = "n1q-86-turn";
const GOAL_MARKER = `n1-qual-goal-${Date.now().toString(36)}`;
const RECEIPT_ID = `n1-qual-receipt-${Date.now().toString(36)}`;

export async function runN1Qualification(options) {
  const evidence = { steps: {}, warnings: [] };
  try {
    return await runN1QualificationInner(options, evidence);
  } catch (error) {
    // Every failure carries the evidence collected so far — a fail-closed gate
    // must be auditable on the exact path that closed it.
    if (error instanceof Error && error.evidence === undefined) error.evidence = evidence;
    throw error;
  }
}

async function runN1QualificationInner(options, evidence) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const workRoot = options.workRoot ?? mkdtempSync(join(tmpdir(), "poracode-n1-qual-"));
  mkdirSync(workRoot, { recursive: true });
  evidence.workRoot = workRoot;
  const note = (message) => evidence.warnings.push(redactSecrets(String(message)));

  // 1. Candidate tarball + version.
  const candidateTarball = resolve(options.candidateTarball);
  if (!existsSync(candidateTarball)) {
    const failure = new Error(`candidate tarball does not exist: ${candidateTarball}`);
    failure.code = "CANDIDATE_INVALID";
    throw failure;
  }
  const candidateVersion =
    options.candidateVersion ?? readCandidateVersionFromTarball(candidateTarball);
  if (!parsePlainSemver(candidateVersion)) {
    const failure = new Error(
      `candidate version "${candidateVersion}" is not plain X.Y.Z — published releases only ` +
        "carry plain versions, so no compatible N-1 could ever match",
    );
    failure.code = "CANDIDATE_INVALID";
    throw failure;
  }
  evidence.candidate = { tarball: candidateTarball, version: candidateVersion };
  evidence.steps.candidateVersion = "ok";

  // 2. Resolve the newest published compatible N-1.
  const repo = resolveRepo(options);
  const target = options.target ?? `${process.platform}-${process.arch}`;
  parseTarget(target);
  evidence.repo = repo;
  evidence.target = target;
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const releases = await fetchAllReleases(fetchImpl, repo, token);
  const selection = selectN1Release({ releases, candidateVersion, target });
  evidence.n1Selection = {
    tag: selection.tag,
    version: selection.version,
    releases: selection.evidence,
  };
  evidence.steps.n1Selection = "ok";
  // eslint-disable-next-line no-console
  console.log(
    `[n1-qual] N-1 release ${selection.tag} (candidate ${candidateVersion}, target ${target})`,
  );

  // 3. Download metadata + tarball, validate, verify the published checksum.
  const downloadDir = join(workRoot, "n1-download");
  mkdirSync(downloadDir, { recursive: true });
  const metadataAsset = releases
    .find((release) => release.tag_name === selection.tag)
    ?.assets?.find((asset) => asset.name === selection.metadataAssetName);
  const tarballAsset = releases
    .find((release) => release.tag_name === selection.tag)
    ?.assets?.find((asset) => asset.name === n1TarballAssetName(selection.version, target));
  if (!metadataAsset || !tarballAsset) {
    const failure = new Error(
      `selected release ${selection.tag} is missing the metadata or tarball asset for ${target}`,
    );
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  const metadataPath = await downloadAsset(
    fetchImpl,
    { ...metadataAsset, repo },
    join(downloadDir, selection.metadataAssetName),
    token,
  );
  const n1Tarball = await downloadAsset(
    fetchImpl,
    { ...tarballAsset, repo },
    join(downloadDir, tarballAsset.name),
    token,
  );
  const metadata = readServerArtifactMetadata(metadataPath);
  const expectedTarball = n1TarballAssetName(selection.version, target);
  const { platform, arch } = parseTarget(target);
  if (metadata.version !== selection.version) {
    const failure = new Error(
      `published metadata version ${metadata.version} does not match release tag ${selection.version}`,
    );
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  if (metadata.platform !== platform || metadata.arch !== arch) {
    const failure = new Error(
      `published metadata targets ${metadata.platform}-${metadata.arch}, not ${target}`,
    );
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  if (metadata.tarball.name !== expectedTarball) {
    const failure = new Error(
      `published metadata tarball ${metadata.tarball.name} does not match ${expectedTarball}`,
    );
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  if (!metadata.targets.includes(target)) {
    const failure = new Error(`published metadata does not advertise target ${target}`);
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  assertTarballChecksum({ tarballPath: n1Tarball, expectedSha256: metadata.tarball.sha256 });
  evidence.n1Artifact = {
    tag: selection.tag,
    version: selection.version,
    tarball: tarballAsset.name,
    sha256: metadata.tarball.sha256,
  };
  evidence.steps.n1Download = "ok";
  // eslint-disable-next-line no-console
  console.log(`[n1-qual] N-1 tarball verified: ${tarballAsset.name} (sha256 ok)`);

  // 4. Install the N-1 release OUTSIDE the checkout and start it.
  const prefix = options.prefix ?? join(workRoot, "prefix");
  assertPrefixOutsideCheckout(prefix, options.repoRoot ?? REPO_ROOT);
  const profile = join(workRoot, "profile");
  const project = join(workRoot, "project");
  gitInit(project);
  installServerPrefix({ tarball: n1Tarball, prefix });
  const n1Entry = join(prefix, "current", "lib", "server.cjs");
  if (!existsSync(n1Entry)) {
    const failure = new Error(`installed N-1 server is missing: ${n1Entry}`);
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  // A published release that predates the D4 upgrade contract (no staging/
  // identity markers in its entrypoint — the same markers the upgrade
  // integration tests use) cannot serve as an N-1 for this gate at all. That
  // is the honest "no compatible published server N-1 exists" verdict, not a
  // qualification crash.
  const n1Entrypoint = readFileSync(n1Entry, "latin1");
  if (!n1Entrypoint.includes("not-staging") || !n1Entrypoint.includes("identity-mismatch")) {
    throw new NoPublishedServerN1Error(
      `The newest published release compatible with ${target} (${selection.tag}) predates the ` +
        "D4 upgrade contract (its entrypoint lacks the staging/identity markers), so there is " +
        "no published server N-1 this gate can upgrade from.",
      {
        candidateVersion,
        target,
        newestCompatibleTag: selection.tag,
        reason: "predates the D4 upgrade contract",
      },
    );
  }
  const n1Doctor = assertDoctorOk(runServerCli, n1Entry, serverEnv(profile, null), "n1-install");
  const n1LatestSchema = n1Doctor.migrations?.latestSchemaVersion ?? null;
  if (!Number.isSafeInteger(n1LatestSchema)) {
    const failure = new Error("published N-1 doctor returned no valid latest schema version");
    failure.code = "N1_ARTIFACT_INVALID";
    throw failure;
  }
  evidence.n1Install = {
    prefix,
    entry: n1Entry,
    latestSchemaVersion: n1LatestSchema,
  };
  evidence.steps.n1Install = "ok";

  const port = await allocateLoopbackPort();
  const httpBase = `http://127.0.0.1:${port}`;
  const runCli = (entry, args, env, opts) => runServerCli(entry, args, env, opts);
  const daemon = spawn(process.execPath, [n1Entry], {
    env: serverEnv(profile, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const daemonLogs = [];
  daemon.stdout.on("data", (chunk) => daemonLogs.push(chunk.toString("utf8")));
  daemon.stderr.on("data", (chunk) => daemonLogs.push(chunk.toString("utf8")));
  try {
    const consoleSignal = waitForText(daemon.stdout, "listening at:", 90_000);
    const healthSignal = (async () => {
      const deadline = Date.now() + 90_000;
      for (;;) {
        if (await healthOk(port)) return;
        if (Date.now() >= deadline) throw new Error("N-1 daemon never started listening");
        await new Promise((resolveWait) => setTimeout(resolveWait, 500));
      }
    })();
    // Whichever signal loses the race may still reject later (e.g. the
    // console wait times out after health answered); that is expected and
    // must not surface as an unhandled rejection.
    consoleSignal.catch(() => undefined);
    healthSignal.catch(() => undefined);
    await Promise.race([consoleSignal, healthSignal]);

    const n1Status = readRunningStatus(runCli, n1Entry, serverEnv(profile, null));
    if (n1Status.build.version !== selection.version) {
      throw new Error(
        `running N-1 identity ${n1Status.build.version} does not match release ${selection.version}`,
      );
    }
    const dataRoot = n1Status.dataRoot;
    evidence.n1Install.build = n1Status.build;
    evidence.n1Install.dataRoot = dataRoot;

    // 5. Seed real payloads through the N-1 HTTP surface.
    const accessToken = await pairAndAuthenticate(
      runCli,
      n1Entry,
      serverEnv(profile, null),
      httpBase,
      fetchImpl,
    );
    const add = await jsonRequest(fetchImpl, `${httpBase}/api/projects/command`, {
      method: "POST",
      token: accessToken,
      body: { kind: "add-existing", path: project, name: "n1-qualify" },
    });
    if (add.status !== 200 && add.status !== 201) {
      throw new Error(
        `project add failed (${add.status}): ${JSON.stringify(add.body).slice(0, 500)}`,
      );
    }
    const start = await jsonRequest(fetchImpl, `${httpBase}/api/terminal/start`, {
      method: "POST",
      token: accessToken,
      body: {
        shellId: SHELL_ID,
        projectLocation: makeProjectLocation(project),
        initialSize: { cols: 80, rows: 24 },
      },
    });
    if (start.status !== 200) {
      throw new Error(
        `terminal/start failed (${start.status}): ${JSON.stringify(start.body).slice(0, 500)}`,
      );
    }
    const ticket = await jsonRequest(fetchImpl, `${httpBase}/api/auth/websocket-ticket`, {
      method: "POST",
      token: accessToken,
    });
    if (ticket.status !== 200 || typeof ticket.body?.ticket !== "string") {
      throw new Error(`websocket-ticket failed (${ticket.status})`);
    }
    // The marker only exists in the command's OUTPUT — the shell must really
    // execute the arithmetic — so the echoed input can never satisfy the wait.
    const watch = startPtyWatch(
      `ws://127.0.0.1:${port}/ws?ticket=${encodeURIComponent(ticket.body.ticket)}`,
      SHELL_ID,
    );
    await watch.opened;
    try {
      await Promise.all([
        watch.waitFor(SHELL_MARKER_OUTPUT, 30_000),
        (async () => {
          const written = await jsonRequest(
            fetchImpl,
            `${httpBase}/api/threads/${SHELL_ID}/terminal/write`,
            {
              method: "POST",
              token: accessToken,
              body: { data: "sh -c 'echo n1q-$((84+2))-turn'\n" },
            },
          );
          if (written.status !== 200) {
            throw new Error(`terminal/write failed (${written.status})`);
          }
        })(),
      ]);
    } finally {
      watch.close();
    }

    // Goal state, where this release supports it.
    const goal = await jsonRequest(fetchImpl, `${httpBase}/api/threads/${SHELL_ID}/goal`, {
      method: "POST",
      token: accessToken,
      body: { action: "edit", objective: `${GOAL_MARKER} keep this thread on track` },
    });
    evidence.seeded = {
      project,
      shellId: SHELL_ID,
      turnMarker: SHELL_MARKER_OUTPUT,
      goalMarker: GOAL_MARKER,
      receiptId: RECEIPT_ID,
      goal:
        goal.status === 200
          ? { seeded: true }
          : { seeded: false, reason: `thread goal rejected (${goal.status})` },
    };

    // 6. Stop the N-1 daemon, then fingerprint + extend the payload set.
    await stopChild(daemon);
    await waitForOwnerPhase(profile, "stopped", 30_000);

    const { database, path: databasePath } = openProfileDatabase(dataRoot);
    let preFingerprint;
    try {
      const seeding = seedReceipt({ database, shellId: SHELL_ID, receiptId: RECEIPT_ID });
      evidence.seeded.receipt = seeding;
      preFingerprint = fingerprintPayloads({
        database,
        shellId: SHELL_ID,
        projectPath: project,
        receiptId: RECEIPT_ID,
        goalMarker: evidence.seeded.goal.seeded ? GOAL_MARKER : null,
      });
      evidence.preUpgradeFingerprint = { database: databasePath, ...preFingerprint };
      if (preFingerprint.schemaVersion === null)
        throw new Error("N-1 database has no schema_version");
      if (!preFingerprint.project)
        throw new Error("seeded project row missing from the N-1 database");
      if (!preFingerprint.thread)
        throw new Error("seeded thread row missing from the N-1 database");
      if (!preFingerprint.scrollbackMarker) {
        throw new Error("seeded turn marker missing from the N-1 terminal scrollback");
      }
      if (evidence.seeded.goal.seeded && !preFingerprint.goalItem) {
        note("goal was accepted by the API but no matching runtime item was fingerprinted");
      }
      evidence.preUpgradeFingerprint.schemaVersion = Number(preFingerprint.schemaVersion);
    } finally {
      database.close();
    }
    evidence.steps.seedAndFingerprint = "ok";
    // eslint-disable-next-line no-console
    console.log("[n1-qual] payloads seeded and fingerprinted on the N-1 install");

    // 7. Upgrade the same prefix to the candidate with the server's own CLI.
    // The CLI respawns the daemon detached, so this needs the longer timeout.
    const currentBefore = readlinkSync(join(prefix, "current"));
    const upgrade = runServerCli(
      n1Entry,
      ["upgrade", "--from", candidateTarball, "--prefix", prefix, "--json"],
      serverEnv(profile, port),
      { timeoutMs: 600_000 },
    );
    const upgradeResult = parseLastJsonLine(upgrade.stdout);
    if (upgradeResult.ok !== true || upgradeResult.rolledBack !== false) {
      throw new Error(
        `candidate upgrade failed: ${redactSecrets(JSON.stringify(upgradeResult)).slice(0, 1_000)}`,
      );
    }
    if (readlinkSync(join(prefix, "current")) === currentBefore) {
      throw new Error("upgrade did not swap <prefix>/current");
    }
    evidence.upgrade = {
      detail: upgradeResult.detail,
      migration: upgradeResult.migration,
      backupPath: upgradeResult.backupPath ?? null,
    };
    evidence.steps.upgrade = "ok";
    // eslint-disable-next-line no-console
    console.log(`[n1-qual] upgraded to candidate ${candidateVersion}`);

    // 8. Reopen and assert: payloads, build identity, schema identity.
    const candidateEntry = join(prefix, "current", "lib", "server.cjs");
    const candidateDoctor = assertDoctorOk(
      runCli,
      candidateEntry,
      serverEnv(profile, null),
      "candidate-install",
    );
    const candidateLatestSchema =
      upgradeResult.migration?.latestSchemaVersion ??
      candidateDoctor.migrations?.latestSchemaVersion ??
      null;
    if (!Number.isSafeInteger(candidateLatestSchema)) {
      const failure = new Error("candidate doctor returned no valid latest schema version");
      failure.code = "CANDIDATE_INVALID";
      throw failure;
    }
    const candidateStatus = readRunningStatus(runCli, candidateEntry, serverEnv(profile, null));
    const expectedIdentity = {
      version: candidateVersion,
      entrypointSha256: sha256File(candidateEntry),
      root: resolve(prefix, readlinkSync(join(prefix, "current"))),
    };
    const identityMismatches = [];
    for (const [field, expected, actual] of [
      ["build.version", expectedIdentity.version, candidateStatus.build.version],
      [
        "build.entrypointSha256",
        expectedIdentity.entrypointSha256,
        candidateStatus.build.entrypointSha256,
      ],
      ["build.root", expectedIdentity.root, candidateStatus.build.root],
      ["build.layoutKind", "prefix", candidateStatus.build.layoutKind],
      ["dataRoot", dataRoot, candidateStatus.dataRoot],
    ]) {
      if (expected !== actual) identityMismatches.push({ field, expected, actual });
    }
    if (identityMismatches.length > 0) {
      throw new Error(
        `reopened install does not run the exact candidate build: ${JSON.stringify(identityMismatches)}`,
      );
    }

    const candidateToken = await pairAndAuthenticate(
      runCli,
      candidateEntry,
      serverEnv(profile, null),
      httpBase,
      fetchImpl,
    );
    const projects = await listRoute(
      fetchImpl,
      `${httpBase}/api/projects`,
      candidateToken,
      "?reads=bounded-v1",
      "",
    );
    if (projects.status !== 200) {
      throw new Error(`project list failed (${projects.status}) after the upgrade`);
    }
    const projectsText = JSON.stringify(projects.body);
    if (!projectsText.includes(project)) {
      throw new Error("seeded project is missing from the catalog after the upgrade");
    }
    const threads = await listRoute(
      fetchImpl,
      `${httpBase}/api/threads`,
      candidateToken,
      "?reads=bounded-v1&limit=50",
      "?limit=50",
    );
    if (threads.status !== 200) {
      throw new Error(`thread list failed (${threads.status}) after the upgrade`);
    }
    if (!JSON.stringify(threads.body).includes(SHELL_ID)) {
      throw new Error("seeded terminal thread is missing from the thread list after the upgrade");
    }

    const reopened = openProfileDatabase(dataRoot);
    try {
      // Read-only fingerprint: a "surviving" row must never be one this script
      // re-inserted after the upgrade.
      const postFingerprint = fingerprintPayloads({
        database: reopened.database,
        shellId: SHELL_ID,
        projectPath: project,
        receiptId: RECEIPT_ID,
        goalMarker: evidence.seeded.goal.seeded ? GOAL_MARKER : null,
      });
      const survived = {
        schemaVersion: Number(
          reopened.database
            .prepare("SELECT value FROM app_state WHERE key = 'schema_version'")
            .get()?.value ?? 0,
        ),
        project: Boolean(postFingerprint.project),
        thread: Boolean(postFingerprint.thread),
        scrollbackMarker: Boolean(postFingerprint.scrollbackMarker),
        receipt: postFingerprint.receipt
          ? { commandId: RECEIPT_ID, state: postFingerprint.receipt.state }
          : null,
        goalItem: Boolean(postFingerprint.goalItem),
      };
      evidence.postUpgrade = survived;

      if (survived.schemaVersion < evidence.preUpgradeFingerprint.schemaVersion) {
        throw new Error(
          `schema went backwards: ${evidence.preUpgradeFingerprint.schemaVersion} → ${survived.schemaVersion}`,
        );
      }
      if (survived.schemaVersion !== candidateLatestSchema) {
        throw new Error(
          `recorded schema ${survived.schemaVersion} does not match the candidate registry ` +
            `${candidateLatestSchema}`,
        );
      }
      if (!survived.project) throw new Error("seeded project row did not survive the upgrade");
      if (!survived.thread) throw new Error("seeded thread row did not survive the upgrade");
      if (!survived.scrollbackMarker) {
        throw new Error("seeded terminal turn did not survive the upgrade");
      }
      if (evidence.seeded.receipt.seeded && !survived.receipt) {
        throw new Error("seeded receipt did not survive the upgrade");
      }
      if (evidence.seeded.receipt.seeded && survived.receipt) {
        const state = survived.receipt.state;
        if (!["in_progress", "uncertain"].includes(state)) {
          throw new Error(`seeded receipt reached unexpected state ${state}`);
        }
      }
      if (evidence.seeded.goal.seeded && !survived.goalItem) {
        throw new Error("seeded thread goal did not survive the upgrade");
      }
      evidence.steps.reopenAssertions = "ok";
      // eslint-disable-next-line no-console
      console.log(
        `[n1-qual] reopen assertions passed (schema ${evidence.preUpgradeFingerprint.schemaVersion} → ${survived.schemaVersion})`,
      );

      // 9. Downgrade refusal — only when the schema registry actually advanced.
      const plan = classifyDowngradeRefusalPlan({ candidateLatestSchema, n1LatestSchema });
      evidence.downgradeRefusal = { ...plan };
      if (plan.assertRefusal) {
        const currentBeforeDowngrade = readlinkSync(join(prefix, "current"));
        const downgradeRun = spawnSync(
          process.execPath,
          [candidateEntry, "upgrade", "--from", n1Tarball, "--prefix", prefix, "--json"],
          {
            encoding: "utf8",
            env: serverEnv(profile, port),
            timeout: 600_000,
            maxBuffer: 64 * 1024 * 1024,
          },
        );
        let refusal;
        try {
          refusal = parseLastJsonLine(redactSecrets(downgradeRun.stdout ?? ""));
        } catch {
          refusal = null;
        }
        const currentAfterDowngradeAttempt = readlinkSync(join(prefix, "current"));
        const stillCandidate =
          readRunningStatus(runCli, candidateEntry, serverEnv(profile, null)).build.version ===
          candidateVersion;
        const refusedAsExpected =
          refusal !== null &&
          refusal.ok === false &&
          refusal.outcome === "unchanged" &&
          /newer|downgrade|unsupported/iu.test(String(refusal.detail));
        evidence.downgradeRefusal.outcome = {
          refused: refusedAsExpected,
          detail: refusal ? String(refusal.detail) : `exit ${downgradeRun.status}`,
          currentUnchanged: currentAfterDowngradeAttempt === currentBeforeDowngrade,
          candidateStillServing: stillCandidate,
        };
        if (!refusedAsExpected) {
          throw new Error(
            `downgrading to the N-1 artifact was not refused: ${redactSecrets(
              JSON.stringify(
                refusal ?? {
                  exit: downgradeRun.status,
                  stderr: downgradeRun.stderr?.slice(0, 500),
                },
              ),
            ).slice(0, 1_000)}`,
          );
        }
        if (!evidence.downgradeRefusal.outcome.currentUnchanged) {
          throw new Error("the refused downgrade swapped <prefix>/current");
        }
        if (!stillCandidate) {
          throw new Error("the refused downgrade left a non-candidate build serving");
        }
        evidence.steps.downgradeRefusal = "ok";
        // eslint-disable-next-line no-console
        console.log("[n1-qual] downgrade to the N-1 artifact refused as required");
      } else {
        note(`downgrade refusal not asserted: ${plan.reason}`);
        evidence.steps.downgradeRefusal = "not-asserted";
      }
    } finally {
      reopened.database.close();
    }
  } finally {
    await stopChild(daemon);
    // The upgrade respawned the candidate detached — it is not this child.
    // Stop it via its pid file so the gate never leaks a lease holder.
    await stopPidFileDaemon(prefix, profile);
  }

  evidence.daemonLogTail = redactSecrets(daemonLogs.join("").slice(-2_000));
  return { ok: true, code: null, evidence };
}

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const options = { outDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => argv[++index];
    if (argument === "--candidate-tarball") options.candidateTarball = value();
    else if (argument === "--candidate-version") options.candidateVersion = value();
    else if (argument === "--repo") options.repo = value();
    else if (argument === "--target") options.target = value();
    else if (argument === "--prefix") options.prefix = value();
    else if (argument === "--work-root") options.workRoot = value();
    else if (argument === "--out-dir") options.outDir = value();
    else if (argument === "--repo-root") options.repoRoot = value();
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!options.candidateTarball) {
    throw new Error(
      "Usage: server-n1-qualification.mjs --candidate-tarball <file> [--candidate-version X.Y.Z] " +
        "[--repo owner/name] [--target platform-arch] [--out-dir <dir>]",
    );
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workRoot = options.workRoot ?? mkdtempSync(join(tmpdir(), "poracode-n1-qual-"));
  let result;
  let exitCode = 0;
  try {
    result = await runN1Qualification({ ...options, workRoot });
  } catch (error) {
    const code = error?.code ?? "QUALIFICATION_FAILED";
    result = {
      ok: false,
      code,
      detail: redactSecrets(
        error instanceof Error ? (error.stack ?? error.message) : String(error),
      ),
      evidence: error?.evidence ?? { workRoot },
    };
    exitCode = TYPED_EXIT_CODES[code] ?? TYPED_EXIT_CODES.QUALIFICATION_FAILED;
  }
  const outDir = options.outDir ?? workRoot;
  mkdirSync(outDir, { recursive: true });
  const resultPath = join(outDir, "n1-qualification-result.json");
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      ok: result.ok,
      code: result.code,
      candidateVersion: result.evidence?.candidate?.version ?? null,
      n1: result.evidence?.n1Selection?.tag ?? null,
      resultPath,
    })}\n`,
  );
  if (!result.ok) {
    process.stderr.write(`${result.code ?? "QUALIFICATION_FAILED"}: ${result.detail ?? ""}\n`);
  }
  process.exitCode = exitCode;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(
      `${redactSecrets(error instanceof Error ? (error.stack ?? error.message) : String(error))}\n`,
    );
    process.exit(1);
  });
}
