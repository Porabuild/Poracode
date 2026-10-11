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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installServerPrefix } from "./install-server-prefix.mjs";
import { readServerArtifactMetadata } from "./server-artifact-metadata.mjs";
import {
  NoPublishedServerN1Error,
  TYPED_EXIT_CODES,
} from "./server-n1-qualification/typed-failures.mjs";
import {
  assertTarballChecksum,
  n1TarballAssetName,
  parsePlainSemver,
  parseTarget,
  selectN1Release,
} from "./server-n1-qualification/selection.mjs";
import { redactSecrets } from "./server-n1-qualification/redaction.mjs";
import { classifyDowngradeRefusalPlan } from "./server-n1-qualification/downgrade-plan.mjs";
import { downloadAsset, fetchAllReleases } from "./server-n1-qualification/github-releases.mjs";
import {
  allocateLoopbackPort,
  healthOk,
  parseLastJsonLine,
  runServerCli,
  serverEnv,
  startPtyWatch,
  stopChild,
  stopPidFileDaemon,
  waitForOwnerPhase,
  waitForText,
} from "./server-n1-qualification/server-process.mjs";
import {
  assertDoctorOk,
  jsonRequest,
  listRoute,
  pairAndAuthenticate,
  readRunningStatus,
} from "./server-n1-qualification/server-session.mjs";
import {
  assertPrefixOutsideCheckout,
  gitInit,
  makeProjectLocation,
  sha256File,
} from "./server-n1-qualification/workspace.mjs";
import {
  readCandidateVersionFromTarball,
  resolveRepo,
} from "./server-n1-qualification/candidate-artifact.mjs";
import {
  fingerprintPayloads,
  openProfileDatabase,
  seedReceipt,
} from "./server-n1-qualification/sqlite-payloads.mjs";

// Re-export the unit-tested surface: scripts/server-n1-qualification.test.mjs
// imports it from this entrypoint. The implementations live in the focused
// modules under ./server-n1-qualification/ — typed failures, pure selection,
// redaction, downgrade planning, process/session/GitHub/sqlite helpers.
export {
  NoPublishedServerN1Error,
  TYPED_EXIT_CODES,
  parsePlainSemver,
  parseTarget,
  n1TarballAssetName,
  selectN1Release,
  assertTarballChecksum,
  redactSecrets,
  classifyDowngradeRefusalPlan,
};
export { compareSemver, serverArtifactAssetName } from "./server-n1-qualification/selection.mjs";
export { pairingCredentialFromCliOutput } from "./server-n1-qualification/server-process.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
        scrollbackMarker: SHELL_MARKER_OUTPUT,
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
        scrollbackMarker: SHELL_MARKER_OUTPUT,
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
