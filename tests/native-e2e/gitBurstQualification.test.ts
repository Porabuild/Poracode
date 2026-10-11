import { join } from "node:path";
import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../src/shared/remote/protocol.ts";
import { LOOPBACK_HOST } from "./harness/constants.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import {
  missingServerArtifactBlocker,
  startRealHost,
  type RealHostHandle,
} from "./harness/realHost.ts";
import { allocateLoopbackPort, closeProfileClients } from "./helpers/profileClientFactory.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import { ProcessCpuSampler } from "./helpers/processCpuSampler.ts";
import { ProcessMemorySampler } from "./helpers/processMemorySampler.ts";
import {
  GitBurstGaugePoller,
  GitBurstHeartbeatObserver,
  type GitBurstAdmissionUsage,
  type GitBurstHeartbeatRecord,
} from "./helpers/gitBurstDiagnostics.ts";
import {
  GIT_BURST_CLIENTS_BY_SIZE,
  GIT_BURST_GENERATOR_DONE_WAIT_MS,
  GIT_BURST_GENERATOR_LINES,
  GIT_BURST_INTERLEAVE_TOLERANCE_LINES,
  GIT_BURST_RUN_ENVIRONMENT,
  GIT_BURST_TMP_DIR,
  GIT_BURST_WORKTREE_COUNT,
} from "./helpers/gitBurstConfig.ts";
import { GitBurstSession } from "./helpers/gitBurstSession.ts";
import {
  createGitBurstFixtureWorktrees,
  discoverGitBurstFixtureProject,
  type GitBurstFixture,
} from "./helpers/gitBurstFixture.ts";
import {
  assertControlBounds,
  controlProbes,
  type GitBurstControlProbeResult,
} from "./helpers/gitBurstControl.ts";
import {
  assertClassLimits,
  assertFailureAttribution,
  assertRefreshClassification,
  assertRefreshErrorCodes,
} from "./helpers/gitBurstClassification.ts";
import {
  assertStalledFetchAccounted,
  pinStalledNetworkFetch,
  startBlackholeListener,
  waitForAdmissionDrain,
  waitForVisibleLongPermit,
} from "./helpers/gitBurstStall.ts";
import {
  createGitBurstCellWindowRecorder,
  gitBurstRunSummary,
  writeGitBurstBuildEvidence,
} from "./helpers/gitBurstEvidence.ts";
import { runGitBurst, type GitBurstRefreshSummary } from "./helpers/gitBurstWorktrees.ts";
import {
  GIT_BURST_BOUND_STEER_ECHO_MS,
  GIT_BURST_BOUND_STEER_EXEC_MS,
  readStreamEvidence,
  startGenerator,
  startStreamingShell,
  steerStreamingShell,
  stopStreamingShell,
  waitForTerminalFragment,
  type GitBurstSteerProbe,
  type GitBurstStreamEvidence,
} from "./helpers/gitBurstStream.ts";
import {
  describeArtifact,
  summarizeProvenance,
  writeExperimentArtifact,
} from "./helpers/experimentArtifacts.ts";

/**
 * §4 Git-burst qualification cell (docs/V2_SERVER_ARCHITECTURE_PRODUCTION_PLAN.md
 * §4 "Git burst" + B7 acceptance) against ONE prebuilt production
 * `dist/main/server.cjs` headless host.
 *
 * The cell refreshes 1/16/64 DISTINCT real worktrees (created through the
 * production `gitAddWorktree` procedure) across 1/4/8 authenticated clients
 * while a real supervisor PTY streams and the control path is exercised, and
 * it holds one deliberately stalled network Git operation (a `gitFetch`
 * against a connect-and-never-respond loopback listener, bounded by the
 * production GIT_NETWORK_TIMEOUT) so the short-read pool, control latency and
 * streaming must survive a stalled `long` permit.
 *
 * Evidence sources (all production surfaces, no seams):
 *  - Loopback `/metrics` → `hostResourceAdmission.gitProcesses` (B7.1):
 *    per-class and per-environment active/queued gauges, the admission
 *    queue-wait vs execution-duration split, refusal/cancellation counters
 *    and the slowFetches counter.
 *  - Client-side classification of every refresh: ok (correct worktree
 *    branch), or a typed bounded-pressure HTTP error (host_busy,
 *    principal_busy, git_admission_* — anything untyped, `internal_error` or
 *    unknown fails the cell), or the B7 failure mode "overload presented as
 *    isRepo:false" (a silent false repo is always a test failure).
 *  - WS5 frozen loopback bounds for steer echo/execution and Stop (terminal
 *    close), reused verbatim so both cells speak one budget language.
 *
 * Honest-refusal rules (plan A0 — unsupported ≠ no samples ≠ measured zero):
 * host event-loop delay and client-facing queued-work cancellation are
 * UNSUPPORTED on this surface and are recorded as such, never simulated; the
 * windows/wsl environment gauges are recorded as not-exercised; heartbeat-gap
 * windows with fewer than two server liveness pings are reported as
 * no-sample. Latency distributions are recorded so the §4 budget freeze can
 * happen from this evidence — nothing here invents a passing number.
 *
 * The scenario helpers live in `helpers/gitBurst*.ts`; this file is the
 * orchestration only.
 */

const repoRoot = findRepoRoot();
const entrypoint = detectHeadlessServerEntrypoint(repoRoot);
const gitBurstN64TimeoutMs = (() => {
  const value = Number(process.env.GIT_BURST_N64_TIMEOUT_MS ?? 360_000);
  if (!Number.isSafeInteger(value) || value < 360_000) {
    throw new Error("GIT_BURST_N64_TIMEOUT_MS must be an integer of at least 360000");
  }
  return value;
})();

let cleanup: ProcessCleanup | undefined;
let host: RealHostHandle | undefined;
let session: GitBurstSession | undefined;
let sampler: HostLoadSampler | undefined;
let memory: ProcessMemorySampler | undefined;
let cpu: ProcessCpuSampler | undefined;
let poller: GitBurstGaugePoller | undefined;
let recordCellWindow: ReturnType<typeof createGitBurstCellWindowRecorder> | undefined;
let provenance: ReturnType<typeof describeArtifact> | undefined;
let runStartedAtIso: string | undefined;
let warmupColdGitStatusMs = 0;
let firstDiagnostics: GitBurstAdmissionUsage | undefined;
let fixture: GitBurstFixture | undefined;

function requireSession(): GitBurstSession {
  if (!session) throw new Error("real host session was not started");
  return session;
}

function requireFixture(): GitBurstFixture {
  if (!fixture) throw new Error("git burst fixture was not created");
  return fixture;
}

function requireCellWindowRecorder(): NonNullable<typeof recordCellWindow> {
  if (!recordCellWindow) throw new Error("cell window recorder was not initialized");
  return recordCellWindow;
}

describe.skipIf(!entrypoint)(
  "§4 Git burst qualification (prebuilt dist/main/server.cjs, B7 admission diagnostics)",
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
        baseDirRoot: join(repoRoot, GIT_BURST_TMP_DIR),
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
      memory = new ProcessMemorySampler(host.pid);
      memory.start(1_000);
      cpu = new ProcessCpuSampler(host.pid);
      cpu.start(1_000);
      runStartedAtIso = new Date().toISOString();
      provenance = writeGitBurstBuildEvidence({ repoRoot, entrypoint });

      // B7.1 diagnostics gate + bootstrap below. The gate runs AFTER the
      // supervisor's first start (the warmup git status): the diagnostics
      // peek deliberately never forks a stopped supervisor, so a pre-start
      // probe would answer unavailable for a healthy host.
      poller = new GitBurstGaugePoller(host.httpBaseUrl, 25);
      recordCellWindow = createGitBurstCellWindowRecorder({ repoRoot, poller });
      session = new GitBurstSession(host);

      const discovered = await discoverGitBurstFixtureProject(session);
      warmupColdGitStatusMs = discovered.warmupColdGitStatusMs;

      // The cell cannot measure queue wait, execution duration or
      // per-environment gauges without the B7.1 diagnostics, so it refuses to
      // run against an artifact that predates them.
      firstDiagnostics = await session.gitDiagnostics();
      assert(
        firstDiagnostics.gitProcesses.environments !== undefined,
        "host admission diagnostics carry no per-environment gauges",
      );

      fixture = await createGitBurstFixtureWorktrees({
        session,
        repoRoot,
        cleanup,
        count: GIT_BURST_WORKTREE_COUNT,
      });
    }, 420_000);

    afterAll(async () => {
      try {
        await poller?.stop();
        await sampler?.stop();
        await memory?.stop();
        await cpu?.stop();
        if (sampler && runStartedAtIso) {
          writeExperimentArtifact(repoRoot, "git-burst-hostload.json", {
            runStartedAtIso,
            runFinishedAtIso: new Date().toISOString(),
            ...(await sampler.summary()),
            memory: memory?.summary() ?? null,
            processCpu: cpu?.summary() ?? null,
            environment: GIT_BURST_RUN_ENVIRONMENT,
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

    it("burst size 1: one worktree refresh records queue wait separately from execution", async () => {
      const gitSession = requireSession();
      const before = await gitSession.gitDiagnostics();
      const clients = await gitSession.openBurstClients(
        GIT_BURST_CLIENTS_BY_SIZE[1]!,
        "gitburst-n01",
      );
      try {
        const windowStartedAtMs = Date.now();
        poller?.start();
        const refresh = await runGitBurst(clients, gitSession.fixtureProject(), [
          requireFixture().worktrees[0]!,
        ]);
        const controls = await controlProbes(clients[0]!, 2, 100, "post-burst", "burst");
        const windowFinishedAtMs = Date.now();
        await poller?.stop();
        const after = await gitSession.gitDiagnostics();
        const delta = await requireCellWindowRecorder()({
          name: "n01",
          windowStartedAtMs,
          windowFinishedAtMs,
          before,
          after,
          refresh,
          extra: { controls, warmupColdGitStatusMs },
        });

        assert.strictEqual(refresh.ok, 1, "single refresh must succeed");
        assertRefreshClassification(refresh);
        assertRefreshErrorCodes(refresh);
        assert(delta.admitted >= 1, "admission diagnostics must count the refresh admits");
        assert(
          delta.short.executionMsDelta > 0,
          "execution duration must be recorded separately from queue wait",
        );
        assertClassLimits(delta);
        assert.strictEqual(delta.queueFullRefusals, 0, "no queue pressure at size 1");
        assert.strictEqual(delta.waitTimeoutRefusals, 0, "no admission timeout at size 1");
        assertControlBounds(controls);
      } finally {
        await closeProfileClients(clients);
      }
    }, 120_000);

    it("burst size 16: 16 distinct worktrees across 4 clients with bounded control", async () => {
      const gitSession = requireSession();
      const before = await gitSession.gitDiagnostics();
      const control = await gitSession.openControlClient("gitburst-n16-control");
      const clients = await gitSession.openBurstClients(
        GIT_BURST_CLIENTS_BY_SIZE[16]!,
        "gitburst-n16",
      );
      try {
        const windowStartedAtMs = Date.now();
        poller?.start();
        const burst = runGitBurst(
          clients,
          gitSession.fixtureProject(),
          requireFixture().worktrees.slice(0, 16),
        );
        const controls = await controlProbes(control, 4, 100, "concurrent-with-burst");
        const refresh = await burst;
        const windowFinishedAtMs = Date.now();
        await poller?.stop();
        const after = await gitSession.gitDiagnostics();
        const delta = await requireCellWindowRecorder()({
          name: "n16",
          windowStartedAtMs,
          windowFinishedAtMs,
          before,
          after,
          refresh,
          extra: { controls },
        });

        assert.strictEqual(refresh.refreshes, 16);
        assertRefreshClassification(refresh);
        assertRefreshErrorCodes(refresh);
        assert(refresh.ok >= 1, "the shared pool must still admit work at size 16");
        assertFailureAttribution(refresh, delta);
        assertClassLimits(delta);
        assertControlBounds(controls);
      } finally {
        await closeProfileClients(clients);
        await control.close();
      }
    }, 180_000);

    it(
      "burst size 64: streaming, steer, Stop and control survive one stalled network fetch",
      async () => {
        const gitSession = requireSession();
        const before = await gitSession.gitDiagnostics();
        // The burst principals flood their own B3 budget; the §4 control
        // surface (snapshot reads, ping, steer, Stop, streaming watch) lives on
        // this separate authenticated principal — B3's "one busy client cannot
        // consume the shared server's entire budget" acceptance, measured.
        const control = await gitSession.openControlClient("gitburst-n64-control");
        const clients = await gitSession.openBurstClients(
          GIT_BURST_CLIENTS_BY_SIZE[64]!,
          "gitburst-n64",
        );
        const heartbeat = new GitBurstHeartbeatObserver(control.ws);
        const blackhole = await startBlackholeListener();
        let stream: GitBurstStreamEvidence | null = null;
        let steer: GitBurstSteerProbe | null = null;
        let closeMs: number | null = null;
        let stopWhileFetchStalled: boolean | null = null;
        let heartbeatRecord: GitBurstHeartbeatRecord | null = null;
        let controls: GitBurstControlProbeResult | null = null;
        let refresh: GitBurstRefreshSummary | null = null;
        let stall: { elapsedMs: number; status: number } | null = null;
        try {
          heartbeat.start();
          const windowStartedAtMs = Date.now();
          // The gauge sampler spans the WHOLE window: stream, burst, the stalled
          // fetch and the drain — so the per-environment gauges cover the stall.
          poller?.start();

          const handle = await startStreamingShell({
            client: control,
            project: gitSession.fixtureProject(),
            shellId: "gitburst-stream-01",
            watchId: "gitburst-watch-01",
          });
          await startGenerator({ handle, lines: GIT_BURST_GENERATOR_LINES });

          // The deliberately stalled network operation: one `long` permit pinned
          // by a black-hole fetch while everything below keeps running.
          const pendingFetch = await pinStalledNetworkFetch({
            client: clients[1]!,
            project: gitSession.fixtureProject(),
            blackholeUrl: blackhole.url,
          });
          let fetchSettled = false;
          const stalledFetch = pendingFetch.settled.then((settled) => {
            fetchSettled = true;
            return settled;
          });

          // The long permit must become visible in the production gauges while
          // the operation stalls.
          const longPermitObservedActive = await waitForVisibleLongPermit(gitSession);

          // The burst: 64 distinct worktrees across 8 clients while the fetch
          // stalls and the PTY streams; control probes ride along concurrently
          // on the control principal.
          const burst = runGitBurst(
            clients,
            gitSession.fixtureProject(),
            requireFixture().worktrees,
          );
          controls = await controlProbes(control, 5, 100, "concurrent-with-burst");
          steer = await steerStreamingShell({ handle, probeId: "N64" });
          refresh = await burst;

          assert(longPermitObservedActive, "stalled fetch never became a visible long permit");
          assertRefreshClassification(refresh);
          assertRefreshErrorCodes(refresh);
          assert(refresh.ok >= 1, "the shared pool must still admit work at size 64");
          assertControlBounds(controls);
          assert(steer.echoWaitMs !== null, "steer echo never observed within the frozen bound");
          assert(
            steer.echoWaitMs <= GIT_BURST_BOUND_STEER_ECHO_MS,
            `steer echo ${String(steer.echoWaitMs)}ms exceeded ${String(GIT_BURST_BOUND_STEER_ECHO_MS)}ms`,
          );

          // Stream integrity on the healthy watcher while everything ran.
          const generatorDone = await waitForTerminalFragment(
            handle.client,
            handle.watchId,
            "GITBURST-GEN-DONE\r\n",
            GIT_BURST_GENERATOR_DONE_WAIT_MS,
          );
          assert(generatorDone !== null, "stream generator never completed on its watcher");
          stream = readStreamEvidence(handle, GIT_BURST_GENERATOR_LINES);
          assert(
            stream.deliveredPadLines >=
              GIT_BURST_GENERATOR_LINES - GIT_BURST_INTERLEAVE_TOLERANCE_LINES,
            `healthy watcher received only ${String(stream.deliveredPadLines)}/${String(GIT_BURST_GENERATOR_LINES)} generator lines`,
          );

          // Input accepted while busy executes after the generator drains
          // (frozen steer-exec bound, measured from the probe write).
          assert(steer.execWaitMs !== null, "busy shell never executed the queued steer input");
          assert(
            steer.execWaitMs <= GIT_BURST_BOUND_STEER_EXEC_MS,
            `steer execution ${String(steer.execWaitMs)}ms exceeded ${String(GIT_BURST_BOUND_STEER_EXEC_MS)}ms`,
          );

          // Stop while the network Git operation is (probably) still stalling:
          // the bounded close reply IS the teardown proof.
          stopWhileFetchStalled = !fetchSettled;
          closeMs = await stopStreamingShell(handle);

          // The stalled fetch settles only through the production network
          // timeout, and the diagnostics must have counted it as slow.
          stall = await stalledFetch;
          await assertStalledFetchAccounted({ session: gitSession, before, stall });
          heartbeatRecord = heartbeat.window();

          // Exact release: every pool drains to zero once the burst and the
          // stalled child are gone (permits release only at the reap boundary).
          await waitForAdmissionDrain(gitSession);

          // Close the window AFTER the drain, so the sampled gauges and the
          // cumulative deltas cover stream + burst + stall + release.
          const windowFinishedAtMs = Date.now();
          await poller?.stop();
          const after = await gitSession.gitDiagnostics();
          const delta = await requireCellWindowRecorder()({
            name: "n64",
            windowStartedAtMs,
            windowFinishedAtMs,
            before,
            after,
            refresh,
            extra: { controls, longPermitObservedActive },
          });
          assertFailureAttribution(refresh, delta);
          assertClassLimits(delta);

          writeExperimentArtifact(repoRoot, "git-burst-cell-n64-detail.json", {
            stall,
            stopWhileFetchStalled,
            closeMs,
            stream,
            steer,
            heartbeat: heartbeatRecord,
            drainVerified: true,
            environment: GIT_BURST_RUN_ENVIRONMENT,
          });
        } finally {
          await closeProfileClients(clients);
          await control.close();
          await blackhole.close();
        }

        assert(refresh !== null && controls !== null && stall !== null);
        console.log(
          `[git-burst] n64: ok=${String(refresh.ok)}/${String(refresh.refreshes)} ` +
            `httpErrors=${String(refresh.httpErrors)} falseRepo=${String(refresh.silentFalseRepo)} ` +
            `fetchStall=${String(Math.round(stall.elapsedMs))}ms closeMs=${String(closeMs ?? -1)} ` +
            `steerEcho=${String(steer?.echoWaitMs ?? -1)}ms lines=${String(stream?.deliveredPadLines ?? 0)} ` +
            `heartbeatPings=${String(heartbeatRecord?.pings ?? 0)}`,
        );
      },
      gitBurstN64TimeoutMs,
    );

    it("records the run summary", async () => {
      if (!firstDiagnostics) throw new Error("admission diagnostics were not captured");
      const path = writeExperimentArtifact(
        repoRoot,
        "git-burst-summary.json",
        gitBurstRunSummary({
          runStartedAtIso: runStartedAtIso ?? null,
          build: provenance ? summarizeProvenance(provenance) : null,
          worktreeRoot: fixture?.root ?? "",
          fixtureSeedCommitHash: fixture?.seedCommitHash ?? null,
          warmupColdGitStatusMs,
          firstDiagnostics,
        }),
      );
      console.log(`[git-burst] run summary → ${path}`);
      expect(provenance?.artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
    }, 30_000);
  },
);
