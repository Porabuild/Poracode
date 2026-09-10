import { existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import Database from "better-sqlite3";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "../../src/shared/remote/protocol.ts";
import type { RuntimeEvent, Thread } from "../../src/shared/contracts.ts";
import { closeDatabase, initDatabase } from "../../src/main/db/connection.ts";
import {
  dbApplyThreadRuntimeEvents,
  dbFlushThreadRuntimeWrites,
  dbGetThreadRuntimeItemsPage,
} from "../../src/main/db/runtimeItems.ts";
import { dbGetProjects, dbUpsertThread } from "../../src/main/db/projectsThreads.ts";
import { collectRuntimeEventsFromSupervisoryMessage } from "../../src/renderer/state/remote/runtimeRequests.ts";
import { LOOPBACK_HOST } from "./harness/constants.ts";
import { detectHeadlessServerEntrypoint, findRepoRoot } from "./harness/paths.ts";
import { ProcessCleanup } from "./harness/processCleanup.ts";
import {
  missingServerArtifactBlocker,
  startRealHost,
  type RealHostHandle,
} from "./harness/realHost.ts";
import { ProfileClient, type ReceivedEvent } from "./helpers/concurrencyProfileClient.ts";
import {
  acquireDeviceCredential,
  allocateLoopbackPort,
  closeProfileClients,
} from "./helpers/profileClientFactory.ts";
import { HostLoadSampler } from "./helpers/hostLoadSampler.ts";
import { ProcessMemorySampler } from "./helpers/processMemorySampler.ts";
import { buildMetricsArtifact } from "./helpers/profileMetrics.ts";
import {
  expectOk,
  posixLocation,
  quiesceAndAssertConvergence,
  renameProjectAndAwaitFanout,
  writeAndReadBackNotes,
  type WorkloadProject,
} from "./helpers/sharedHostWorkload.ts";
import {
  captureTreeDiff,
  describeArtifact,
  observeSources,
  summarizeProvenance,
  writeExperimentArtifact,
} from "./helpers/experimentArtifacts.ts";

/**
 * WS5 acceptance-gate load profile (docs/V2_PRODUCTION_PLAN.md) against ONE
 * prebuilt production `dist/main/server.cjs`:
 *
 *   8 concurrent streaming agents + 4 active GUI clients + 1 stalled client:
 *   no agent death, no >1-frame stall on healthy clients, stop/steer latency
 *   bounded, memory bounds recorded.
 *
 * Mapping onto the real production surface without provider credentials:
 *  - The 8 "agents" are supervisor-owned PTY sessions (the exact supervisor
 *    path WS5 protects: eager shed, serialize-once replay), each streaming
 *    ~2.4MB of incompressible output concurrently through cursor-sync watches.
 *  - The 4 GUI clients mirror open-chat renderers: each declares
 *    `thread-item-interests` for the seeded GUI threads, consumes
 *    `thread-runtime-event` frames (runtime.truncated publications driven
 *    through the production truncate route), keeps HTTP workload running, and
 *    each watches 2 of the streaming agents.
 *  - The stalled client shares the agent-8 watch with gui-4 and has its raw
 *    socket paused across the streaming window. Both documented outcomes pass:
 *    the server either holds the connection (resume → live catch-up) or evicts
 *    it under sustained stall (reconnect with lastSeenSeq → replay recovery,
 *    as exercised by sharedHostBackpressure).
 *  - "Steer" is control input into a busy PTY (`terminal/write` while the
 *    generator is running): the echo proves the control path under load, the
 *    queued marker proves the input was accepted and executed.
 *  - "Stop" is `terminal/close`, which tears down the streaming session on the
 *    supervisor.
 *
 * Asserted bounds (loopback measurements with large margins — the point is
 * "bounded", not a latency SLA): truncate fan-out and steer echo ≤ 2s per
 * sample, steer execution ≤ 30s, alive marker ≤ 10s, close ≤ 5s. Memory and
 * system load are recorded, never asserted. Provider-backed GUI steer/stop
 * (real model turns) needs credentials and remains a manual QA item (WS9).
 */

const repoRoot = findRepoRoot();
const entrypoint = detectHeadlessServerEntrypoint(repoRoot);

const AGENT_COUNT = 8;
const GUI_CLIENT_COUNT = 4;
const GENERATOR_LINES_PER_AGENT = 24_000;
const TRUNCATE_ROUNDS = 4;
const GUI_THREAD_IDS = Array.from(
  { length: GUI_CLIENT_COUNT },
  (_, index) => `native-e2e-ws5-lp-thread-${index + 1}`,
);

/** Loopback bounds — assertions, not SLAs. See the file doc comment. */
const BOUND_TRUNCATE_FANOUT_MS = 2_000;
const BOUND_STEER_ECHO_MS = 2_000;
const BOUND_STEER_EXEC_MS = 30_000;
const BOUND_AGENT_ALIVE_MS = 10_000;
const BOUND_TERMINAL_CLOSE_MS = 5_000;
/** Payload lines a healthy watcher may miss from the strict count because
 * steer-echo/control bytes split a line mid-stream (see the generator check). */
const INTERLEAVE_TOLERANCE_LINES = 8;
/** Legal cursor-sync v2 duplicate/overlap re-deliveries per watch (the real
 * client ignores duplicates); genuine gaps are asserted to be zero. */
const BOUND_CURSOR_SYNC_RESENDS = 4;
/** A connected stalled client held under this bound rules out the default 30s
 * heartbeat sweep as the reason for any drop; past it the documented outcome
 * is eviction + replay recovery. */
const MAX_STALL_WINDOW_MS = 25_000;

const SEED_PROJECT_NAME = "native-e2e-fixture";

const RUN_ENVIRONMENT = {
  gate: "WS5 load profile: 8 streaming agents + 4 active GUI clients + 1 stalled client",
  agentStandIn:
    "Agents are supervisor-owned PTY sessions streaming incompressible output — the " +
    "production supervisor path WS5 protects. Provider-backed GUI steer/stop with real " +
    "model turns requires credentials and remains a manual QA item (WS9).",
  steerDefinition:
    "Steer = terminal/write control input into a busy PTY. Echo latency bounds the " +
    "control path under load; the queued marker proves the busy agent accepted and " +
    "later executed the input.",
  stopDefinition:
    "Stop = terminal/close tearing down the streaming supervisor session, verified by " +
    "a rejected write afterwards.",
  stalledClientPolicy:
    "A stalled receiver is either held (socket resumes and catches up live) or evicted " +
    "under sustained stall; eviction recovery is a reconnect with lastSeenSeq replay. " +
    "Healthy clients must be unaffected in both cases.",
  memoryNote:
    "Memory is recorded (peak summed RSS of the host process and descendants, plus " +
    "system load samples), never asserted — matching the shared-host harness policy.",
};

/** Steer probes: the echoed command text carries STEERECHO (with literal
 * backslash escapes, never a real CRLF), while executed printf emits STEEREXEC
 * followed by `\n` (rendered as one CRLF by the PTY) — the two markers cannot
 * match each other's state. printf formats use `\n` only: a literal `\r\n`
 * would be doubled to `\r\r\n` by the PTY's ONLCR. */
function steerProbeCommand(probeId: string): string {
  return `printf 'STEEREXEC-${probeId}\\n' # STEERECHO-${probeId}\r`;
}

function agentNumber(agentIndex: number): string {
  return String(agentIndex).padStart(2, "0");
}

function agentPadLine(agentIndex: number): string {
  return `ws5-lp-agent-${agentNumber(agentIndex)}-pad-${"x".repeat(80)}`;
}

function distribution(values: readonly number[]): {
  samples: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number): number => {
    if (sorted.length === 0) return 0;
    const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
    return Math.round(sorted[index] ?? 0);
  };
  return {
    samples: sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    maxMs: sorted.length > 0 ? Math.round(sorted[sorted.length - 1] ?? 0) : 0,
  };
}

/** Polls a watcher's assembled text for a fragment; returns when it appeared
 * relative to `sincePerfMs` (null when the deadline passed). */
async function waitForTerminalFragment(
  client: ProfileClient,
  watchId: string,
  fragment: string,
  timeoutMs: number,
  sincePerfMs: number,
): Promise<number | null> {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    if (client.terminalState(watchId)?.assembledText.includes(fragment)) {
      return performance.now() - sincePerfMs;
    }
    if (performance.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Same server-native binding fallback as sharedHostRuntimeTruncate.test.ts —
 * node_modules may be compiled for Electron's ABI while the host runs on Node. */
const serverNativeBinding = join(process.cwd(), "dist", "server-native", "better_sqlite3.node");

function databaseOpens(nativeBinding?: string): boolean {
  if (nativeBinding && !existsSync(nativeBinding)) return false;
  try {
    const database = nativeBinding
      ? new Database(":memory:", { nativeBinding })
      : new Database(":memory:");
    database.close();
    return true;
  } catch {
    return false;
  }
}

function prepareTestProcessBinding(): void {
  if (databaseOpens()) return;
  if (!databaseOpens(serverNativeBinding)) {
    throw new Error(
      "No Node-compatible better-sqlite3 binding available to open the host database.",
    );
  }
  process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = serverNativeBinding;
}

interface GuiThreadFixture {
  readonly threadId: string;
  survivingItemIds: string[];
  itemCounter: number;
}

/** Appends `count` completed message items to a GUI thread through the
 * production DB writers (second WAL connection, as in the truncate test). */
function appendGuiThreadItems(dbPath: string, fixture: GuiThreadFixture, count: number): string[] {
  initDatabase(dbPath);
  try {
    const appended: string[] = [];
    const events: RuntimeEvent[] = [];
    for (let index = 0; index < count; index += 1) {
      fixture.itemCounter += 1;
      const itemId = `${fixture.threadId}-item-${String(fixture.itemCounter)}`;
      appended.push(itemId);
      fixture.survivingItemIds.push(itemId);
      events.push(
        {
          type: "item.started",
          threadId: fixture.threadId,
          itemId,
          itemType: index % 2 === 0 ? "user_message" : "assistant_message",
        },
        {
          type: "item.completed",
          threadId: fixture.threadId,
          itemId,
          payload: { content: [{ kind: "text", text: `${itemId} body` }] },
        },
      );
    }
    dbApplyThreadRuntimeEvents(fixture.threadId, events);
    dbFlushThreadRuntimeWrites(fixture.threadId);
    return appended;
  } finally {
    closeDatabase();
  }
}

function seedGuiThreads(dbPath: string, projectId: string): GuiThreadFixture[] {
  initDatabase(dbPath);
  try {
    const now = new Date().toISOString();
    const fixtures: GuiThreadFixture[] = [];
    for (const threadId of GUI_THREAD_IDS) {
      const thread: Thread = {
        id: threadId,
        projectId,
        title: `WS5 load profile ${threadId}`,
        agentKind: "native-e2e",
        config: { model: "native-e2e-model" },
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
        archived: false,
        done: false,
        starred: false,
        presentationMode: "gui",
        createdAt: now,
        updatedAt: now,
      };
      dbUpsertThread(thread, 0);
      fixtures.push({ threadId, survivingItemIds: [], itemCounter: 0 });
    }
    return fixtures;
  } finally {
    closeDatabase();
  }
}

/** Truncates at `anchorItemId` on the acting client and measures the
 * `runtime.truncated` fan-out to every healthy GUI client (waiters armed
 * BEFORE the mutation, monotonic stamps as in the shared-host workload). */
async function truncateAndAwaitFanout(
  guiClients: readonly ProfileClient[],
  acting: ProfileClient,
  threadId: string,
  anchorItemId: string,
): Promise<{ propagationMs: number[]; endToEndMs: number }> {
  const matchesTruncate = (event: ReceivedEvent): boolean =>
    event.type === "thread-runtime-event" &&
    (event.event as { threadId?: unknown }).threadId === threadId &&
    (event.event as { event?: { type?: unknown; itemId?: unknown } }).event?.type ===
      "runtime.truncated" &&
    (event.event as { event?: { type?: unknown; itemId?: unknown } }).event?.itemId ===
      anchorItemId;
  const pending = guiClients.map((client) =>
    client
      .awaitNextEvent(matchesTruncate, BOUND_TRUNCATE_FANOUT_MS + 5_000)
      .catch((error: unknown) => {
        throw new Error(
          `${client.label}: no runtime.truncated for ${threadId}@${anchorItemId}: ${String(error)}`,
        );
      }),
  );
  const requestStartedAt = performance.now();
  const response = await acting.fetchJson(
    "runtime-truncate",
    `/api/threads/${threadId}/runtime/truncate`,
    { method: "POST", body: { itemId: anchorItemId } },
  );
  expectOk(response.status, `runtime truncate ${threadId}@${anchorItemId}`, response.body);
  const responseDoneAt = performance.now();
  const arrivals = await Promise.all(pending);
  return {
    propagationMs: arrivals.map((event) => event.arrivedAtMs - responseDoneAt),
    endToEndMs: Math.max(...arrivals.map((event) => event.arrivedAtMs - requestStartedAt)),
  };
}

let cleanup: ProcessCleanup | undefined;
let host: RealHostHandle | undefined;
let project: WorkloadProject | undefined;
let guiThreadFixtures: GuiThreadFixture[] = [];
let sampler: HostLoadSampler | undefined;
let memory: ProcessMemorySampler | undefined;
let provenance: ReturnType<typeof describeArtifact> | undefined;
let runStartedAtIso: string | undefined;

function workloadProject(): WorkloadProject {
  if (!project) throw new Error("project fixture was not discovered");
  return project;
}

describe.skipIf(!entrypoint)(
  "WS5 load profile: 8 streaming agents + 4 GUI clients + 1 stalled client (prebuilt dist/main/server.cjs)",
  () => {
    beforeAll(async () => {
      if (!entrypoint) throw new Error(missingServerArtifactBlocker(repoRoot).message);
      cleanup = new ProcessCleanup();
      const port = await allocateLoopbackPort();
      host = await startRealHost({
        host: LOOPBACK_HOST,
        port,
        repoRoot,
        cleanup,
        startupTimeoutMs: 120_000,
        baseDirRoot: join(repoRoot, "tmp", ".tmp", "ws5-load-profile-qa"),
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
      runStartedAtIso = new Date().toISOString();
      provenance = describeArtifact(entrypoint, observeSources(repoRoot));
      writeExperimentArtifact(repoRoot, "ws5-load-profile-build.json", provenance);
      writeExperimentArtifact(
        repoRoot,
        "ws5-load-profile-tree-diff.patch",
        captureTreeDiff(repoRoot),
      );

      // Bootstrap: discover the auto-seeded fixture project for terminal and
      // notes workload locations.
      prepareTestProcessBinding();
      const bootstrapCredential = await acquireDeviceCredential(host, "ws5lp-bootstrap");
      const bootstrap = await ProfileClient.create({
        handle: host,
        label: "ws5lp-bootstrap",
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
        project = { projectId: String(seeded?.id), locationPath: String(location?.path) };
      } finally {
        await bootstrap.close();
      }

      const dbPath = join(host.baseDir, "state.sqlite");
      const seededProjectId = ((): string => {
        initDatabase(dbPath);
        try {
          return dbGetProjects()[0]!.id;
        } finally {
          closeDatabase();
        }
      })();
      assert.strictEqual(seededProjectId, project.projectId, "fixture project identity");
      guiThreadFixtures = seedGuiThreads(dbPath, seededProjectId);
      // Initial transcript content on every GUI thread.
      for (const fixture of guiThreadFixtures) {
        appendGuiThreadItems(dbPath, fixture, 4);
      }
    }, 240_000);

    afterAll(async () => {
      try {
        sampler?.stop();
        memory?.stop();
        if (sampler && runStartedAtIso) {
          writeExperimentArtifact(repoRoot, "ws5-load-profile-hostload.json", {
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

    it("streams 8 supervisor agents past a stalled client with bounded steer/stop latency and no agent death", async () => {
      if (!host) throw new Error("real host was not started");
      if (!memory) throw new Error("memory sampler was not started");
      const dbPath = join(host.baseDir, "state.sqlite");
      const windowStartedAtMs = Date.now();

      // ---- Clients: 4 active GUI clients + 1 stalled client -----------------
      const guiClients: ProfileClient[] = [];
      const clients: ProfileClient[] = [];
      try {
        for (let index = 0; index < GUI_CLIENT_COUNT; index += 1) {
          const credential = await acquireDeviceCredential(host, `ws5lp-gui-${index + 1}`);
          const client = await ProfileClient.create({
            handle: host,
            label: `ws5lp-gui-${index + 1}`,
            accessToken: credential.accessToken,
          });
          guiClients.push(client);
          clients.push(client);
        }
        const stalledCredential = await acquireDeviceCredential(host, "ws5lp-stalled");
        const stalled = await ProfileClient.create({
          handle: host,
          label: "ws5lp-stalled",
          accessToken: stalledCredential.accessToken,
        });
        clients.push(stalled);

        // Every GUI client mirrors an open-chat renderer: declared transcript
        // interests for the GUI threads plus a history fetch per thread.
        for (const client of guiClients) {
          client.sendJson({ type: "thread-item-interests", threadIds: GUI_THREAD_IDS });
          for (const threadId of GUI_THREAD_IDS) {
            const history = await client.fetchJson(
              "history-open",
              `/api/threads/${threadId}/history?runtimePage=1`,
            );
            expectOk(history.status, `${client.label} history open ${threadId}`, history.body);
          }
        }

        // ---- Agents: 8 supervisor-owned PTY sessions -------------------------
        // gui-j (1-based) watches agents j and j+4; the stalled client shares
        // the agent-8 watch with gui-4.
        const watcherOf = (agentIndex: number): ProfileClient =>
          guiClients[(agentIndex - 1) % GUI_CLIENT_COUNT]!;
        const shellIdOf = (agentIndex: number): string => `ws5-lp-agent-${agentNumber(agentIndex)}`;
        const watchIdOf = (agentIndex: number, client: ProfileClient): string =>
          `ws5-lp-watch-a${agentNumber(agentIndex)}-${client.label}`;

        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const started = await watcherOf(agentIndex).fetchJson(
            "terminal-start",
            "/api/terminal/start",
            {
              method: "POST",
              body: {
                shellId: shellIdOf(agentIndex),
                projectLocation: posixLocation(workloadProject()),
              },
            },
          );
          expectOk(started.status, `terminal start ${shellIdOf(agentIndex)}`, started.body);
        }
        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const watcher = watcherOf(agentIndex);
          const ready = await watcher.watchTerminalReliable(
            shellIdOf(agentIndex),
            watchIdOf(agentIndex, watcher),
          );
          assert.strictEqual(ready.status, "ready", `watch for agent ${agentIndex} must be ready`);
        }
        const stalledWatchId = watchIdOf(8, stalled);
        const stalledReady = await stalled.watchTerminalReliable(shellIdOf(8), stalledWatchId);
        assert.strictEqual(stalledReady.status, "ready", "stalled watch must be ready");

        // Warm every shell with an executed (not echoed) marker before the
        // stalled window. The first write to a fresh PTY can land during shell
        // init and never be read, so the write repeats until the executed
        // marker is observed (write-until-seen, as in cursorSyncV2).
        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const watcher = watcherOf(agentIndex);
          const watchId = watchIdOf(agentIndex, watcher);
          const marker = `AGENT-${agentNumber(agentIndex)}-READY\r\n`;
          let warmed = false;
          for (let attempt = 1; attempt <= 8 && !warmed; attempt += 1) {
            const warmup = await watcher.fetchJson(
              "terminal-warmup",
              `/api/threads/${shellIdOf(agentIndex)}/terminal/write`,
              {
                method: "POST",
                body: { data: `printf 'AGENT-%s-READY\\n' '${agentNumber(agentIndex)}'\r` },
              },
            );
            expectOk(warmup.status, `agent ${agentIndex} warmup write`, warmup.body);
            warmed =
              (await waitForTerminalFragment(
                watcher,
                watchId,
                marker,
                4_000,
                performance.now(),
              )) !== null;
          }
          assert(warmed, `agent ${agentIndex} warmup marker never executed`);
        }
        const stalledWarmup = await waitForTerminalFragment(
          stalled,
          stalledWatchId,
          "AGENT-08-READY\r\n",
          20_000,
          performance.now(),
        );
        assert(stalledWarmup !== null, "stalled client never received the agent-8 warmup marker");

        // ---- Stalled window: 8 agents stream; GUI workload continues --------
        stalled.pauseSocket();
        const pausedAtMs = Date.now();
        const stalledSeqAtPause = stalled.metrics.lastEventSeq;

        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const padLine = agentPadLine(agentIndex);
          const command = `yes '${padLine}' | head -n ${String(GENERATOR_LINES_PER_AGENT)}; printf 'GEN-%s-DONE\\n' '${agentNumber(agentIndex)}'\r`;
          const write = await watcherOf(agentIndex).fetchJson(
            "terminal-generate",
            `/api/threads/${shellIdOf(agentIndex)}/terminal/write`,
            { method: "POST", body: { data: command } },
          );
          expectOk(write.status, `agent ${agentIndex} generator write`, write.body);
        }

        const truncatePropagations: number[] = [];
        const truncateEndToEnd: number[] = [];
        const steerEchoMs: number[] = [];
        const steerProbeIds: string[] = [];
        const steerWrittenAtMs = new Map<string, number>();
        for (let round = 1; round <= TRUNCATE_ROUNDS; round += 1) {
          const actingIndex = (round - 1) % GUI_CLIENT_COUNT;
          const acting = guiClients[actingIndex]!;
          const fixture = guiThreadFixtures[actingIndex]!;

          // Transcript churn while every agent streams.
          const appended = appendGuiThreadItems(dbPath, fixture, 2);
          await new Promise((resolve) => setTimeout(resolve, 250));
          const anchorItemId = appended[0]!;
          fixture.survivingItemIds.pop(); // The truncate removes the appended tail item.
          const fanout = await truncateAndAwaitFanout(
            guiClients,
            acting,
            fixture.threadId,
            anchorItemId,
          );
          truncatePropagations.push(...fanout.propagationMs);
          truncateEndToEnd.push(fanout.endToEndMs);

          // Steer probes: control input into two busy agents per round.
          for (const agentIndex of [round, round + GUI_CLIENT_COUNT]) {
            const probeId = `A${agentNumber(agentIndex)}R${String(round)}`;
            steerProbeIds.push(probeId);
            const watcher = watcherOf(agentIndex);
            const watchId = watchIdOf(agentIndex, watcher);
            const probe = await watcher.fetchJson(
              "terminal-steer",
              `/api/threads/${shellIdOf(agentIndex)}/terminal/write`,
              { method: "POST", body: { data: steerProbeCommand(probeId) } },
            );
            expectOk(probe.status, `steer probe ${probeId} write`, probe.body);
            steerWrittenAtMs.set(probeId, performance.now());
            const echoSeenAt = await waitForTerminalFragment(
              watcher,
              watchId,
              `STEERECHO-${probeId}`,
              BOUND_STEER_ECHO_MS,
              performance.now(),
            );
            assert(
              echoSeenAt !== null,
              `steer probe ${probeId}: echo never observed within ${String(BOUND_STEER_ECHO_MS)}ms`,
            );
            steerEchoMs.push(echoSeenAt);
          }

          // Extra shared-host mutation traffic on even rounds.
          if (round % 2 === 0) {
            const doc = { ws5lp: `round-${String(round)}`, writtenAt: Date.now() };
            const readBack = await writeAndReadBackNotes(acting, workloadProject(), doc);
            assert.deepStrictEqual(readBack, doc, "notes write must read back exactly");
          }
        }

        // Every agent finishes its generator: the healthy watcher receives the
        // ENTIRE incompressible payload while the stalled client was paused.
        // Steer-echo bytes interleave into the stream while the generator is
        // running (the PTY echoes input into the same output feed), so payload
        // integrity is asserted per delivered line with a small tolerance for
        // lines split by that control text — not as one contiguous block.
        const agentDeliveredLines: Record<string, number> = {};
        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const watcher = watcherOf(agentIndex);
          const watchId = watchIdOf(agentIndex, watcher);
          const doneAt = await waitForTerminalFragment(
            watcher,
            watchId,
            `GEN-${agentNumber(agentIndex)}-DONE\r\n`,
            90_000,
            performance.now(),
          );
          assert(doneAt !== null, `agent ${agentIndex} generator never completed on its watcher`);
          const assembled = watcher.terminalState(watchId)?.assembledText ?? "";
          const deliveredLines = assembled.split(`${agentPadLine(agentIndex)}\r\n`).length - 1;
          agentDeliveredLines[agentNumber(agentIndex)] = deliveredLines;
          assert(
            deliveredLines >= GENERATOR_LINES_PER_AGENT - INTERLEAVE_TOLERANCE_LINES,
            `agent ${agentIndex}: healthy watcher received only ${String(deliveredLines)}/${String(GENERATOR_LINES_PER_AGENT)} generator lines`,
          );
        }

        // The stalled client observed nothing while paused.
        assert.strictEqual(
          stalled.metrics.lastEventSeq,
          stalledSeqAtPause,
          "stalled client must not observe events while paused",
        );
        const windowDurationMs = Date.now() - pausedAtMs;
        const stalledEvicted = stalled.ws.readyState !== WebSocket.OPEN;
        if (!stalledEvicted) {
          assert(
            windowDurationMs < MAX_STALL_WINDOW_MS,
            `unheld stall window ${String(windowDurationMs)}ms must stay under ${String(MAX_STALL_WINDOW_MS)}ms (past it, eviction is the documented outcome)`,
          );
          stalled.resumeSocket();
        }

        // Queued steer input is executed by every busy agent after its
        // generator drains — input accepted under load is never lost. The
        // latency is measured from the probe write, so it includes the busy
        // agent's remaining work before the queued line runs.
        const steerExecMs: number[] = [];
        for (const probeId of steerProbeIds) {
          const agentIndex = Number(probeId.slice(1, 3));
          const watcher = watcherOf(agentIndex);
          const execAt = await waitForTerminalFragment(
            watcher,
            watchIdOf(agentIndex, watcher),
            `STEEREXEC-${probeId}\r\n`,
            BOUND_STEER_EXEC_MS,
            steerWrittenAtMs.get(probeId) ?? performance.now(),
          );
          assert(
            execAt !== null,
            `steer probe ${probeId}: busy agent never executed the queued input`,
          );
          steerExecMs.push(execAt);
        }

        // No agent death: after the whole storm every session still executes.
        const aliveLatencies: number[] = [];
        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const watcher = watcherOf(agentIndex);
          const watchId = watchIdOf(agentIndex, watcher);
          const aliveMarker = `AGENT-${agentNumber(agentIndex)}-ALIVE\r\n`;
          let aliveAt: number | null = null;
          for (let attempt = 1; attempt <= 3 && aliveAt === null; attempt += 1) {
            const aliveWrite = await watcher.fetchJson(
              "terminal-alive",
              `/api/threads/${shellIdOf(agentIndex)}/terminal/write`,
              {
                method: "POST",
                body: { data: `printf 'AGENT-%s-ALIVE\\n' '${agentNumber(agentIndex)}'\r` },
              },
            );
            expectOk(aliveWrite.status, `agent ${agentIndex} alive write`, aliveWrite.body);
            aliveAt = await waitForTerminalFragment(
              watcher,
              watchId,
              aliveMarker,
              BOUND_AGENT_ALIVE_MS,
              performance.now(),
            );
          }
          assert(aliveAt !== null, `agent ${agentIndex} failed the post-storm alive check`);
          aliveLatencies.push(aliveAt);
        }

        // Stalled-client recovery path: resume (live catch-up) or eviction
        // (reconnect with lastSeenSeq replay — the documented recovery).
        let stalledOrRecovered: ProfileClient = stalled;
        let stalledRecoveryWatchId = stalledWatchId;
        let stalledReplayedEvents: number | null = null;
        if (stalledEvicted) {
          const recovered = await ProfileClient.create({
            handle: host,
            label: "ws5lp-stalled-recovered",
            accessToken: stalledCredential.accessToken,
            lastSeenSeq: stalledSeqAtPause ?? stalled.metrics.readySeq ?? 0,
          });
          clients.push(recovered);
          stalledOrRecovered = recovered;
          stalledRecoveryWatchId = `ws5-lp-watch-a08-recovered`;
          const recoveredReady = await recovered.watchTerminalReliable(
            shellIdOf(8),
            stalledRecoveryWatchId,
          );
          assert.strictEqual(recoveredReady.status, "ready", "recovered watch must be ready");
          stalledReplayedEvents = recovered.metrics.replayedEventCount;
        }

        // Terminal convergence on the shared agent-8 watch: healthy gui-4 and
        // the recovered stalled client end at the same absolute cursor.
        const gui4WatchId = watchIdOf(8, guiClients[3]!);
        const convergenceDeadline = performance.now() + 25_000;
        for (;;) {
          const healthyState = guiClients[3]!.terminalState(gui4WatchId);
          const recoveredState = stalledOrRecovered.terminalState(stalledRecoveryWatchId);
          const stable =
            healthyState?.finalCursor !== null &&
            healthyState?.finalCursor !== undefined &&
            healthyState?.finalCursor === recoveredState?.finalCursor;
          if (stable) break;
          if (performance.now() > convergenceDeadline) {
            throw new Error(
              `agent-8 cursors never converged: gui4=${String(healthyState?.finalCursor)} stalled=${String(recoveredState?.finalCursor)}`,
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        const gui4Agent8State = guiClients[3]!.terminalState(gui4WatchId);
        const stalledAgent8State = stalledOrRecovered.terminalState(stalledRecoveryWatchId);
        for (const [label, state] of [
          ["gui-4", gui4Agent8State],
          ["stalled-side", stalledAgent8State],
        ] as const) {
          const gaps =
            state?.violations.filter(
              (violation) =>
                violation.expectedFromCursor !== null &&
                violation.fromCursor > violation.expectedFromCursor,
            ).length ?? 0;
          assert.strictEqual(gaps, 0, `${label} agent-8 lost output (cursor-sync gap)`);
          assert(
            (state?.contiguityViolations ?? 0) <= BOUND_CURSOR_SYNC_RESENDS,
            `${label} agent-8: ${String(state?.contiguityViolations)} non-chaining ranges exceed the v2 re-delivery bound`,
          );
        }

        // ---- Stop phase: tear every streaming session down, bounded --------
        // closeThread for a shell awaits the PTY process exit before replying,
        // so a bounded 200 is itself the teardown proof. (A write to the
        // removed id afterwards is a deliberate silent tombstone in
        // writeTerminal — it must not fail a write racing removal.)
        const closeLatencies: number[] = [];
        for (let agentIndex = 1; agentIndex <= AGENT_COUNT; agentIndex += 1) {
          const watcher = watcherOf(agentIndex);
          const close = await watcher.fetchJson(
            "terminal-close",
            `/api/threads/${shellIdOf(agentIndex)}/terminal/close`,
            { method: "POST", body: {} },
          );
          expectOk(close.status, `terminal close ${shellIdOf(agentIndex)}`, close.body);
          assert(
            close.elapsedMs <= BOUND_TERMINAL_CLOSE_MS,
            `terminal close for agent ${agentIndex} took ${String(close.elapsedMs)}ms (bound ${String(BOUND_TERMINAL_CLOSE_MS)}ms)`,
          );
          closeLatencies.push(close.elapsedMs);
        }

        // ---- Whole-roster convergence + served/DB truncation state ----------
        // One final rename fans a projects event to every client, which the
        // shared convergence helper compares byte-for-byte across the roster.
        await renameProjectAndAwaitFanout(
          guiClients[0]!,
          guiClients,
          workloadProject(),
          `${SEED_PROJECT_NAME}-qa-ws5lp-final`,
        );
        const snapshotSeq = await quiesceAndAssertConvergence(clients, "ws5-load-profile");
        assert(snapshotSeq > 0, "converged host cursor must be positive");

        for (const fixture of guiThreadFixtures) {
          const history = await guiClients[0]!.fetchJson(
            "history-final",
            `/api/threads/${fixture.threadId}/history?runtimePage=1`,
          );
          expectOk(history.status, `final history ${fixture.threadId}`, history.body);
          const servedIds = (
            history.body as { runtimeItems: Array<{ id: string }> }
          ).runtimeItems.map((item) => item.id);
          assert.deepStrictEqual(
            servedIds,
            fixture.survivingItemIds,
            `${fixture.threadId}: served history must match the truncated survivors`,
          );
        }
        initDatabase(dbPath);
        try {
          for (const fixture of guiThreadFixtures) {
            const dbIds = dbGetThreadRuntimeItemsPage(fixture.threadId, undefined, 500).items.map(
              (item) => item.id,
            );
            assert.deepStrictEqual(
              dbIds,
              fixture.survivingItemIds,
              `${fixture.threadId}: host database must match the truncated survivors`,
            );
          }
        } finally {
          closeDatabase();
        }

        // Production-parser check: every GUI client's received truncate frames
        // yield transcript-effective runtime.truncated batches per thread.
        const transcriptBatchesPerClient = guiClients.map((client) => {
          const batches = client
            .receivedEvents()
            .filter(
              (event) =>
                event.type === "thread-runtime-event" &&
                (event.event as { event?: { type?: unknown } }).event?.type === "runtime.truncated",
            )
            .flatMap((frame) => collectRuntimeEventsFromSupervisoryMessage(frame.event))
            .filter((batch) => GUI_THREAD_IDS.includes(batch.threadId));
          const perThread = new Map<string, number>();
          for (const batch of batches) {
            if (!batch.events.some((event) => event.type === "runtime.truncated")) continue;
            perThread.set(batch.threadId, (perThread.get(batch.threadId) ?? 0) + 1);
          }
          return { label: client.label, perThread: Object.fromEntries(perThread) };
        });
        for (const entry of transcriptBatchesPerClient) {
          for (const threadId of GUI_THREAD_IDS) {
            assert(
              (entry.perThread[threadId] ?? 0) >= 1,
              `${entry.label}: no transcript-effective runtime.truncated batch for ${threadId}`,
            );
          }
        }

        // Healthy-client stream accounting for the artifact.
        memory.stop();
        const memorySummary = memory.summary();
        const healthyStreamAccounting = guiClients.map((client) => ({
          label: client.label,
          eventSeqGaps: client.metrics.eventSeqGaps,
          resyncRequiredCount: client.metrics.resyncRequiredCount,
          eventsReceived: client.metrics.eventsReceived,
          appBytesReceived: client.metrics.appBytesReceived,
          transportSocketBytesReceived: client.metrics.transportSocketBytesReceived,
          wsPingRttMaxMs:
            client.metrics.wsPingRttMs.length > 0 ? Math.max(...client.metrics.wsPingRttMs) : null,
        }));
        const agentIndexes = Array.from({ length: AGENT_COUNT }, (_, index) => index + 1);
        const watcherContiguity = guiClients.map((client) => ({
          label: client.label,
          watches: agentIndexes
            .filter((agentIndex) => watcherOf(agentIndex) === client)
            .map((agentIndex) => {
              const state = client.terminalState(watchIdOf(agentIndex, client));
              return {
                agent: agentNumber(agentIndex),
                contiguityViolations: state?.contiguityViolations ?? null,
                // A gap (range starting past the expected cursor) is real
                // output loss; duplicates/overlaps are legal v2 re-delivery.
                gapViolations:
                  state?.violations.filter(
                    (violation) =>
                      violation.expectedFromCursor !== null &&
                      violation.fromCursor > violation.expectedFromCursor,
                  ).length ?? null,
                violations: state?.violations ?? [],
                finalCursor: state?.finalCursor ?? null,
              };
            }),
        }));
        for (const entry of watcherContiguity) {
          for (const watch of entry.watches) {
            assert.strictEqual(
              watch.gapViolations,
              0,
              `${entry.label} watch ${watch.agent} lost output (cursor-sync gap): ${JSON.stringify(watch.violations)}`,
            );
            assert(
              (watch.contiguityViolations ?? 0) <= BOUND_CURSOR_SYNC_RESENDS,
              `${entry.label} watch ${watch.agent}: ${String(watch.contiguityViolations)} non-chaining ranges exceed the v2 re-delivery bound ${String(BOUND_CURSOR_SYNC_RESENDS)}`,
            );
          }
        }

        for (const client of guiClients) await client.ping();

        const metricsArtifact = buildMetricsArtifact(guiClients, {
          profile: "ws5-load-profile",
          windowStartedAtMs,
          hostWorkload: sampler?.window(windowStartedAtMs, Date.now()) ?? null,
          environment: RUN_ENVIRONMENT,
        });
        const artifact = {
          gate: RUN_ENVIRONMENT.gate,
          windowStartedAtMs,
          windowFinishedAtMs: Date.now(),
          windowDurationMs,
          profile: {
            agents: AGENT_COUNT,
            guiClients: GUI_CLIENT_COUNT,
            stalledClients: 1,
            generatorLinesPerAgent: GENERATOR_LINES_PER_AGENT,
            generatorBytesPerAgent: GENERATOR_LINES_PER_AGENT * (agentPadLine(1).length + 2),
            truncateRounds: TRUNCATE_ROUNDS,
            steerProbes: steerProbeIds.length,
            deviceCredentials: GUI_CLIENT_COUNT + 1,
          },
          bounds: {
            truncateFanoutMs: BOUND_TRUNCATE_FANOUT_MS,
            steerEchoMs: BOUND_STEER_ECHO_MS,
            steerExecMs: BOUND_STEER_EXEC_MS,
            agentAliveMs: BOUND_AGENT_ALIVE_MS,
            terminalCloseMs: BOUND_TERMINAL_CLOSE_MS,
            maxStallWindowMs: MAX_STALL_WINDOW_MS,
          },
          results: {
            snapshotSeq,
            agentsAliveAfterStorm: AGENT_COUNT,
            agentDeliveredLines,
            stalledSeqFrozenWhilePaused: true,
            stalledEvicted,
            stalledReplayedEvents,
            terminalCloseSemantics:
              "closeThread awaits the PTY process exit before replying; the bounded close distribution is the teardown proof",
            truncateFanOut: distribution(truncatePropagations),
            truncateEndToEnd: distribution(truncateEndToEnd),
            steerEcho: distribution(steerEchoMs),
            steerExec: distribution(steerExecMs),
            agentAlive: distribution(aliveLatencies),
            terminalClose: distribution(closeLatencies),
          },
          healthyClientStreams: healthyStreamAccounting,
          watcherContiguity,
          transcriptBatchesPerClient,
          stalledRecovery: {
            evicted: stalledEvicted,
            recoveryPath: stalledEvicted ? "reconnect-with-lastSeenSeq-replay" : "socket-resume",
            eventsReceived: stalledOrRecovered.metrics.eventsReceived,
            eventSeqGaps: stalledOrRecovered.metrics.eventSeqGaps,
            resyncRequiredCount: stalledOrRecovered.metrics.resyncRequiredCount,
            finalCursor: stalledAgent8State?.finalCursor ?? null,
          },
          memory: {
            process: memorySummary,
            systemLoadWindow: sampler?.window(windowStartedAtMs, Date.now()) ?? null,
          },
          metrics: metricsArtifact,
          protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
          environment: RUN_ENVIRONMENT,
        };
        const path = writeExperimentArtifact(repoRoot, "ws5-load-profile.json", artifact);
        console.log(
          `[ws5-load-profile] agents=${String(AGENT_COUNT)} gui=${String(GUI_CLIENT_COUNT)} stalled=1 ` +
            `window=${String(windowDurationMs)}ms evicted=${String(stalledEvicted)} ` +
            `truncateFanOut p50/p95/max=${String(artifact.results.truncateFanOut.p50Ms)}/${String(artifact.results.truncateFanOut.p95Ms)}/${String(artifact.results.truncateFanOut.maxMs)}ms ` +
            `steerEcho max=${String(artifact.results.steerEcho.maxMs)}ms close max=${String(artifact.results.terminalClose.maxMs)}ms ` +
            `peakRss=${String(memorySummary.peakTotalRssKb ?? 0)}KB → ${path}`,
        );

        expect(artifact.results.agentsAliveAfterStorm).toBe(AGENT_COUNT);
        expect(artifact.results.truncateFanOut.maxMs).toBeLessThanOrEqual(BOUND_TRUNCATE_FANOUT_MS);
        expect(artifact.results.steerEcho.maxMs).toBeLessThanOrEqual(BOUND_STEER_ECHO_MS);
        expect(artifact.results.terminalClose.maxMs).toBeLessThanOrEqual(BOUND_TERMINAL_CLOSE_MS);
        expect(artifact.results.agentAlive.maxMs).toBeLessThanOrEqual(BOUND_AGENT_ALIVE_MS);
        expect(artifact.results.steerExec.maxMs).toBeLessThanOrEqual(BOUND_STEER_EXEC_MS);
      } finally {
        await closeProfileClients(clients);
      }
    }, 420_000);

    it("records the WS5 load-profile run summary", async () => {
      const path = writeExperimentArtifact(repoRoot, "ws5-load-profile-summary.json", {
        runStartedAtIso: runStartedAtIso ?? null,
        runFinishedAtIso: new Date().toISOString(),
        build: provenance ? summarizeProvenance(provenance) : null,
        profile: {
          agents: AGENT_COUNT,
          guiClients: GUI_CLIENT_COUNT,
          stalledClients: 1,
          generatorLinesPerAgent: GENERATOR_LINES_PER_AGENT,
          truncateRounds: TRUNCATE_ROUNDS,
        },
        bounds: {
          truncateFanoutMs: BOUND_TRUNCATE_FANOUT_MS,
          steerEchoMs: BOUND_STEER_ECHO_MS,
          steerExecMs: BOUND_STEER_EXEC_MS,
          agentAliveMs: BOUND_AGENT_ALIVE_MS,
          terminalCloseMs: BOUND_TERMINAL_CLOSE_MS,
          maxStallWindowMs: MAX_STALL_WINDOW_MS,
        },
        guiThreadIds: GUI_THREAD_IDS,
        protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        environment: RUN_ENVIRONMENT,
      });
      console.log(`[ws5-load-profile] run summary → ${path}`);
      expect(provenance?.artifactSha256).toMatch(/^[0-9a-f]{64}$/u);
    }, 30_000);
  },
);
