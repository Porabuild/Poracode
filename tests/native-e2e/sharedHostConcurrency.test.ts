import assert from "node:assert/strict";
import { join } from "node:path";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../src/shared/remote/protocol.ts";
import { LOOPBACK_HOST } from "./harness/constants.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import {
  missingServerArtifactBlocker,
  startRealHost,
  type RealHostHandle,
} from "./harness/realHost.ts";
import { ProfileClient } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
  createProfileClients,
} from "./helpers/profileClientFactory.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import { buildMetricsArtifact } from "./helpers/profileMetrics.ts";
import {
  BURST_OPS_PER_CLIENT,
  expectOk,
  gitWriteStageAndVerify,
  posixLocation,
  quiesceAndAssertConvergence,
  renameProjectAndAwaitFanout,
  runConcurrentBurst,
  writeAndReadBackNotes,
  type WorkloadProject,
} from "./helpers/sharedHostWorkload.ts";
import { runImpairmentScenario } from "./helpers/sharedHostImpairmentScenario.ts";
import {
  captureTreeDiff,
  describeArtifact,
  observeSources,
  summarizeProvenance,
  writeExperimentArtifact,
} from "./helpers/experimentArtifacts.ts";

/**
 * Shared-host concurrency experiment against ONE prebuilt production
 * `dist/main/server.cjs`, exercised by 1, 2, 8 and then 32 authenticated
 * connections (milestone order; no profile is skipped). Per profile the N
 * connections share ONE device credential — the production token-exchange
 * rate limit (`DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT`, 20/5min/IP) is respected,
 * so N counts concurrent connections, not provisioned devices.
 *
 * Everything runs through the real API surface — pairing, bearer tokens,
 * one-use websocket tickets, the WS event stream, project/thread/settings
 * routes and real supervisor procedures — with fixture data only (a seeded git
 * repo and a dev shell; no provider credentials involved).
 *
 * Assertions are functional invariants (persisted results, event-stream
 * contiguity, cross-client convergence, replay completeness). Latency and byte
 * distributions are measured and recorded, never asserted against a time
 * budget. Evidence lands in tmp/v2-production-review/shared-host/.
 *
 * Explicit workload per profile N:
 *  - quiet phase (sequenced turns, exact persistence + fan-out measurement):
 *    rounds × N × { 1 project rename + 1 project-notes write/read
 *    + 1 project-file write + 1 git stage + 1 git status }, plus N event
 *    propagation samples per rename.
 *  - burst phase (all N clients fully concurrent): 9 ops per client =
 *    file creation + baseline read + file write + its read-back + fixture read + notes write/read +
 *    settings write + full snapshot read.
 *  - impairment scenario (helpers/sharedHostImpairmentScenario.ts): stalled
 *    receiver during terminal streaming + concurrent mutations, then
 *    disconnect/replay through lastSeenSeq.
 */

const repoRoot = findRepoRoot();
const entrypoint = detectHeadlessServerEntrypoint(repoRoot);

/** Milestone order: 1/2/8 first, 32 once the smaller profiles hold. */
const PROFILE_SIZES = [1, 2, 8, 32] as const;
const QUIET_ROUNDS_BY_SIZE: Record<number, number> = { 1: 4, 2: 4, 8: 2, 32: 1 };
const SEED_PROJECT_NAME = "native-e2e-fixture";

const RUN_ENVIRONMENT = {
  concurrencyEvidence:
    "Concurrent host workload is sampled in hostLoad.json and each profile's " +
    "hostWorkload window. A prebuilt backend requires separate build provenance; " +
    "these measurements do not establish a production latency guarantee.",
};

let cleanup: ProcessCleanup | undefined;
let host: RealHostHandle | undefined;
let project: WorkloadProject | undefined;
let warmupColdGitStatusMs = 0;
let provenance: ReturnType<typeof describeArtifact> | undefined;
let sampler: HostLoadSampler | undefined;
let runStartedAtIso: string | undefined;

function workloadProject(): WorkloadProject {
  if (!project) throw new Error("project fixture was not discovered");
  return project;
}

async function runConcurrencyProfile(size: number): Promise<{ snapshotSeq: number }> {
  if (!host) throw new Error("real host was not started");
  if (!project) throw new Error("project fixture was not discovered");
  const quietRounds = QUIET_ROUNDS_BY_SIZE[size] ?? 1;
  const sizeTag = `n${size}`;
  const windowStartedAtMs = Date.now();
  const { clients, credential } = await createProfileClients(host, size, sizeTag);
  try {
    // Ready cursors must be monotone: later clients may observe a higher seq.
    for (let index = 1; index < clients.length; index += 1) {
      const previous = clients[index - 1]?.metrics.readySeq ?? 0;
      assert(
        (clients[index]?.metrics.readySeq ?? 0) >= previous,
        `${sizeTag}: connection ${String(index + 1)} readySeq must not regress below ${String(previous)}`,
      );
    }

    // Quiet phase: sequenced single-writer turns so persistence and fan-out
    // are exactly attributable.
    for (let round = 1; round <= quietRounds; round += 1) {
      for (const [index, client] of clients.entries()) {
        const uniqueName = `${SEED_PROJECT_NAME}-qa-${sizeTag}-r${round}-c${index + 1}`;
        const timings = await renameProjectAndAwaitFanout(
          client,
          clients,
          workloadProject(),
          uniqueName,
        );
        timings.propagationMs.forEach((value, listenerIndex) => {
          clients[listenerIndex]?.metrics.eventPropagationMs.push(value);
        });
        client.metrics.mutationToEndToEndMs.push(timings.endToEndMs);
        const noteDoc = {
          quiet: `${sizeTag}-r${round}-c${index + 1}`,
          writtenAt: Date.now(),
        };
        const readDoc = await writeAndReadBackNotes(client, workloadProject(), noteDoc);
        assert.deepStrictEqual(readDoc, noteDoc, "sequenced notes write must read back exactly");
        await gitWriteStageAndVerify(
          client,
          workloadProject(),
          `shared-host-qa/${sizeTag}-r${round}-c${index + 1}.txt`,
          `quiet-phase payload ${sizeTag} r${round} c${index + 1}\n`,
        );
      }
    }

    // Burst phase: every client fires BURST_OPS_PER_CLIENT ops concurrently.
    await runConcurrentBurst(clients, workloadProject(), sizeTag);
    const snapshotSeq = await quiesceAndAssertConvergence(clients, sizeTag);

    for (const client of clients) await client.ping();
    const artifact = buildMetricsArtifact(clients, {
      profile: sizeTag,
      quietRounds,
      burstOpsPerClient: BURST_OPS_PER_CLIENT,
      totalBurstHttpOps: size * BURST_OPS_PER_CLIENT,
      totalQuietHttpOps: quietRounds * size * 9,
      snapshotSeq,
      warmupColdGitStatusMs,
      propagationSemantics:
        "eventPropagation samples are (event arrival - HTTP response completion); " +
        "negative values mean the event stream won the race against the response " +
        "(waiters are armed before the request).",
      pairing: {
        deviceCredentials: 1,
        concurrentConnections: size,
        tokenExchangeThrottleRetries: credential?.throttleRetries ?? 0,
        tokenExchangeThrottleWaitMs: credential?.throttleWaitMs ?? 0,
      },
      hostWorkload: sampler?.window(windowStartedAtMs, Date.now()) ?? null,
      environment: RUN_ENVIRONMENT,
    });
    const path = writeExperimentArtifact(repoRoot, `metrics-${sizeTag}.json`, artifact);
    const propagation = artifact.eventPropagation as {
      p50Ms: number;
      p95Ms: number;
      p99Ms: number;
    };
    console.log(
      `[shared-host] ${sizeTag}: connections=${String(size)} snapshotSeq=${String(snapshotSeq)} ` +
        `propagation p50/p95/p99=${String(propagation.p50Ms)}/${String(propagation.p95Ms)}/${String(propagation.p99Ms)}ms ` +
        `→ ${path}`,
    );
    return { snapshotSeq };
  } finally {
    await closeProfileClients(clients);
  }
}

describe.skipIf(!entrypoint)(
  "shared production host concurrency (prebuilt dist/main/server.cjs)",
  () => {
    beforeAll(async () => {
      if (!entrypoint) {
        throw new Error(missingServerArtifactBlocker(repoRoot).message);
      }
      cleanup = new ProcessCleanup();
      const port = await allocateLoopbackPort();
      host = await startRealHost({
        host: LOOPBACK_HOST,
        port,
        repoRoot,
        cleanup,
        startupTimeoutMs: 120_000,
        // Isolated fixture-only base dir, kept out of the default run parent.
        baseDirRoot: join(repoRoot, "tmp", ".tmp", "shared-host-qa"),
      });
      assert(
        !host.blockers.some((blocker) => blocker.code === "pair-json-unavailable"),
        "machine-readable pairing (pair --json) is unavailable on this host",
      );

      const environment = await fetch(
        new URL("/.well-known/poracode/environment", host.httpBaseUrl),
      );
      assert.strictEqual(environment.status, 200, "environment endpoint must respond 200");
      const descriptor = (await environment.json()) as { protocolVersion: number };
      assert.strictEqual(
        descriptor.protocolVersion,
        PORACODE_REMOTE_PROTOCOL_VERSION,
        "server must speak the current remote protocol version",
      );

      sampler = new HostLoadSampler();
      sampler.start(2_000);
      runStartedAtIso = new Date().toISOString();
      provenance = describeArtifact(entrypoint, observeSources(repoRoot));
      writeExperimentArtifact(repoRoot, "build.json", provenance);
      writeExperimentArtifact(repoRoot, "tree-diff.patch", captureTreeDiff(repoRoot));

      // Bootstrap client: discover the seeded project and warm the supervisor
      // (its first call forks the supervisor child; that cold latency is
      // recorded separately and excluded from steady-state distributions).
      const bootstrapCredential = await acquireDeviceCredential(host, "bootstrap");
      const bootstrap = await ProfileClient.create({
        handle: host,
        label: "bootstrap",
        accessToken: bootstrapCredential.accessToken,
      });
      try {
        const snapshot = await bootstrap.fetchJson("snapshot-read", "/api/snapshot");
        expectOk(snapshot.status, "bootstrap snapshot", snapshot.body);
        const projects =
          (snapshot.body as { projects?: Array<Record<string, unknown>> }).projects ?? [];
        const seeded = projects.find((entry) => entry.name === SEED_PROJECT_NAME);
        assert(seeded, `seeded project ${SEED_PROJECT_NAME} must exist`);
        const location = seeded?.location as { kind?: string; path?: string } | undefined;
        assert.strictEqual(location?.kind, "posix", "seeded project must be a posix location");
        project = {
          projectId: String(seeded?.id),
          locationPath: String(location?.path),
        };
        assert.strictEqual(
          project.locationPath,
          join(host.baseDir, "fixture-repo"),
          "seeded project must live in the isolated fixture repo",
        );
        const cold = await bootstrap.gitProcedure("git-status-cold", "getGitStatus", {
          projectLocation: posixLocation(workloadProject()),
        });
        expectOk(cold.status, "warmup getGitStatus", cold.body);
        assert(
          (cold.body as { isRepo?: boolean }).isRepo === true,
          "fixture repo must report isRepo",
        );
        warmupColdGitStatusMs = cold.elapsedMs;
        await bootstrap.ping();
      } finally {
        await bootstrap.close();
      }
    }, 240_000);

    afterAll(async () => {
      try {
        sampler?.stop();
        if (sampler && runStartedAtIso) {
          writeExperimentArtifact(repoRoot, "hostLoad.json", {
            runStartedAtIso,
            runFinishedAtIso: new Date().toISOString(),
            ...sampler.summary(),
            environment: RUN_ENVIRONMENT,
            samples: sampler.allSamples(),
          });
        }
      } finally {
        await host?.stop();
        host = undefined;
        await cleanup?.shutdown("experiment-end");
        cleanup = undefined;
      }
    }, 60_000);

    it(`concurrent connections N=1 (1 device credential, quiet rounds ${String(QUIET_ROUNDS_BY_SIZE[1])}, burst ${String(BURST_OPS_PER_CLIENT)} ops)`, async () => {
      const result = await runConcurrencyProfile(1);
      expect(result.snapshotSeq).toBeGreaterThan(0);
    }, 150_000);

    it(`concurrent connections N=2 (1 device credential, quiet rounds ${String(QUIET_ROUNDS_BY_SIZE[2])}, burst ${String(BURST_OPS_PER_CLIENT)} ops)`, async () => {
      const result = await runConcurrencyProfile(2);
      expect(result.snapshotSeq).toBeGreaterThan(0);
    }, 150_000);

    it(`concurrent connections N=8 (1 device credential, quiet rounds ${String(QUIET_ROUNDS_BY_SIZE[8])}, burst ${String(BURST_OPS_PER_CLIENT)} ops)`, async () => {
      const result = await runConcurrencyProfile(8);
      expect(result.snapshotSeq).toBeGreaterThan(0);
    }, 240_000);

    it(`concurrent connections N=32 (1 device credential, quiet rounds ${String(QUIET_ROUNDS_BY_SIZE[32])}, burst ${String(BURST_OPS_PER_CLIENT)} ops)`, async () => {
      const result = await runConcurrencyProfile(32);
      expect(result.snapshotSeq).toBeGreaterThan(0);
    }, 420_000);

    it("stalled receiver and offline replayer leave the healthy client untouched", async () => {
      if (!host) throw new Error("real host was not started");
      const result = await runImpairmentScenario({
        host,
        repoRoot,
        project: workloadProject,
        warmupColdGitStatusMs,
        sampler: sampler ?? undefined,
        seedProjectName: SEED_PROJECT_NAME,
        environment: RUN_ENVIRONMENT,
      });
      expect(result.finalSnapshotSeq).toBeGreaterThan(0);
    }, 300_000);

    it("records the run summary", async () => {
      const path = writeExperimentArtifact(repoRoot, "summary.json", {
        runStartedAtIso: runStartedAtIso ?? null,
        runFinishedAtIso: new Date().toISOString(),
        build: provenance ? summarizeProvenance(provenance) : null,
        profileSizes: PROFILE_SIZES,
        quietRoundsBySize: QUIET_ROUNDS_BY_SIZE,
        burstOpsPerClient: BURST_OPS_PER_CLIENT,
        renamesWhileReplayerOffline: 4,
        terminalPayloadLines: 24_000,
        warmupColdGitStatusMs,
        protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        connectionsVsDevices:
          "Each profile opens N concurrent websocket connections sharing ONE device " +
          "credential (the production token-exchange rate limit allows 20/5min/IP). " +
          "N measures connection concurrency, not provisioned devices.",
        tokenExchangeRateLimit: {
          source: "src/main/remote/server/security.ts DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT",
          maxAttempts: 20,
          windowMs: 300_000,
          firstFailureEvidence: "logs/first-failure.log",
        },
        hostWorkload: sampler?.summary() ?? null,
        environment: RUN_ENVIRONMENT,
      });
      console.log(`[shared-host] run summary → ${path}`);
      expect(provenance?.artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
    }, 30_000);
  },
);
