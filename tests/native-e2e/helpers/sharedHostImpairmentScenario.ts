import assert from "node:assert/strict";
import type { RealHostHandle } from "../harness/realHost.ts";
import type { HostLoadSampler } from "./hostLoadSampler.ts";
import { ProfileClient } from "./concurrencyProfileClient.ts";
import { BOUND_CURSOR_SYNC_RESENDS } from "./terminalWatchRecorder.ts";
import { acquireDeviceCredential, closeProfileClients } from "./profileClientFactory.ts";
import {
  expectOk,
  posixLocation,
  quiesceAndAssertConvergence,
  renameProjectAndAwaitFanout,
  writeAndReadBackNotes,
  type WorkloadProject,
} from "./sharedHostWorkload.ts";
import { writeExperimentArtifact } from "./experimentArtifacts.ts";

/**
 * Impairment scenario: a stalled receiver shares a terminal stream with a
 * healthy client (one device credential, two connections), then a device
 * disconnects and replays through `lastSeenSeq`. Functional invariants only —
 * both clients converge on identical terminal text and cursors, and the
 * replayer observes a contiguous, complete replay window.
 *
 * The replayer declares bounded catalog changes (the production client
 * contract): replayed catalog mutations arrive as the content-free bounded
 * signal form, so rename order is proven by seq parity against the healthy
 * client's live full-list frames (one shared seq space).
 */

const TERMINAL_PAYLOAD_LINES = 24_000;
const RENAMES_WHILE_REPLAYER_OFFLINE = 4;

async function waitForTerminalText(
  client: ProfileClient,
  watchId: string,
  text: string,
): Promise<void> {
  const deadline = Date.now() + 30_000;
  for (;;) {
    if (client.terminalState(watchId)?.assembledText.includes(text)) return;
    if (Date.now() >= deadline) throw new Error("Expected terminal output never arrived");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export interface ImpairmentScenarioDeps {
  readonly host: RealHostHandle;
  readonly repoRoot: string;
  readonly project: () => WorkloadProject;
  readonly warmupColdGitStatusMs: number;
  readonly sampler: HostLoadSampler | undefined;
  readonly seedProjectName: string;
  readonly environment: Record<string, unknown>;
}

export async function runImpairmentScenario(
  deps: ImpairmentScenarioDeps,
): Promise<{ finalSnapshotSeq: number }> {
  const shellId = "shared-host-qa-shell-1";
  const watchId = "shared-host-qa-watch";
  const windowStartedAtMs = Date.now();
  // One credential, two simultaneous connections: the stalled receiver and
  // the healthy client are the same device identity, different streams.
  const streamCredential = await acquireDeviceCredential(deps.host, "impairment-stream");
  const healthy = await ProfileClient.create({
    handle: deps.host,
    label: "impair-healthy",
    accessToken: streamCredential.accessToken,
  });
  const slow = await ProfileClient.create({
    handle: deps.host,
    label: "impair-slow",
    accessToken: streamCredential.accessToken,
  });
  try {
    const shell = await healthy.fetchJson("terminal-start", "/api/terminal/start", {
      method: "POST",
      body: { shellId, projectLocation: posixLocation(deps.project()) },
    });
    expectOk(shell.status, "terminal start", shell.body);

    const healthyReady = await healthy.watchTerminalReliable(shellId, watchId);
    const slowReady = await slow.watchTerminalReliable(shellId, watchId);
    assert.strictEqual(healthyReady.status, "ready", "healthy watch must become ready");
    assert.strictEqual(slowReady.status, "ready", "slow watch must become ready");

    // Wait for actual shell execution before starting the stalled-receiver
    // interval. The marker is assembled by printf, so input echo cannot pass.
    const warmup = await healthy.fetchJson(
      "terminal-warmup",
      `/api/threads/${shellId}/terminal/write`,
      {
        method: "POST",
        body: { data: "printf 'SHAREDHOST-%s\\n' 'READY'\r" },
      },
    );
    expectOk(warmup.status, "terminal warmup", warmup.body);
    await waitForTerminalText(healthy, watchId, "SHAREDHOST-READY\r\n");
    await waitForTerminalText(slow, watchId, "SHAREDHOST-READY\r\n");

    // Stall the receiver BEFORE the payload is written, so its TCP buffer and
    // the server's outbound queue fill up while the healthy client keeps
    // streaming.
    slow.pauseSocket();
    const pausedAtMs = Date.now();
    const slowSeqWhilePausedStart = slow.metrics.lastEventSeq;

    const marker = `SHAREDHOST-${pausedAtMs}-END`;
    const payloadLine = "sharedhost-slow-payload-padding-0123456789abcdef";
    const expectedPayload = `${payloadLine}\r\n`.repeat(TERMINAL_PAYLOAD_LINES);
    const payloadWrite = await healthy.fetchJson(
      "terminal-write",
      `/api/threads/${shellId}/terminal/write`,
      {
        method: "POST",
        body: {
          data: `yes '${payloadLine}' | head -n ${TERMINAL_PAYLOAD_LINES}; printf 'SHAREDHOST-%s\\n' '${pausedAtMs}-END'\r`,
        },
      },
    );
    expectOk(payloadWrite.status, "terminal payload write", payloadWrite.body);

    // While the receiver is stalled the healthy client keeps doing
    // state-changing work and must still see its own event.
    const healthyTimings = await renameProjectAndAwaitFanout(
      healthy,
      [healthy],
      deps.project(),
      `${deps.seedProjectName}-qa-impair-healthy`,
    );
    const impairDoc = { impair: "healthy-during-pause" };
    const impairRead = await writeAndReadBackNotes(healthy, deps.project(), impairDoc);
    assert.deepStrictEqual(impairRead, impairDoc, "sequenced notes write must read back exactly");

    await waitForTerminalText(healthy, watchId, `${marker}\r\n`);
    assert(
      healthy.terminalState(watchId)?.assembledText.includes(expectedPayload),
      "healthy client must receive every payload line while its neighbor is paused",
    );
    const pauseDurationMs = Date.now() - pausedAtMs;
    assert.strictEqual(
      slow.metrics.lastEventSeq,
      slowSeqWhilePausedStart,
      "stalled receiver must not observe events while paused",
    );
    slow.resumeSocket();

    // The stalled receiver catches up on the same rename event it missed
    // while paused (retained-event matching tolerates the frame arriving
    // before this waiter is armed).
    await slow.awaitNextEvent(
      (event) =>
        event.type === "remote-projects-changed" &&
        JSON.stringify(event.event).includes("impair-healthy"),
      20_000,
    );

    // Terminal convergence: both clients end at the same absolute cursor with
    // contiguous cursor-sync ranges and identical text.
    const deadline = Date.now() + 25_000;
    let healthyState = healthy.terminalState(watchId);
    let slowState = slow.terminalState(watchId);
    for (;;) {
      healthyState = healthy.terminalState(watchId);
      slowState = slow.terminalState(watchId);
      const stable =
        healthyState?.finalCursor !== null && healthyState?.finalCursor === slowState?.finalCursor;
      if (stable) break;
      if (Date.now() > deadline) {
        throw new Error(
          `terminal cursors never converged: healthy=${String(healthyState?.finalCursor)} slow=${String(slowState?.finalCursor)}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    // Contiguity, with the v2 semantics the recorder documents: a duplicate/
    // overlap re-delivery around the pause boundary is legal (the real client
    // dedupes; bounded like sharedHostLoadProfile's re-delivery bound), but
    // output LOSS is not — a non-chaining range that starts PAST the expected
    // cursor is a gap and must fail the run.
    for (const [label, state] of [
      ["healthy", healthyState],
      ["slow", slowState],
    ] as const) {
      const lostOutput =
        state?.violations.filter(
          (violation) =>
            violation.expectedFromCursor !== null &&
            violation.fromCursor > violation.expectedFromCursor,
        ).length ?? 0;
      assert.strictEqual(lostOutput, 0, `${label} cursor-sync lost output (cursor-sync gap)`);
      assert(
        (state?.contiguityViolations ?? 0) <= BOUND_CURSOR_SYNC_RESENDS,
        `${label} cursor-sync: ${String(state?.contiguityViolations)} non-chaining ranges ` +
          `exceed the v2 re-delivery bound ${String(BOUND_CURSOR_SYNC_RESENDS)}`,
      );
    }
    assert.strictEqual(slowState?.assembledText, healthyState?.assembledText);
    assert(
      healthyState?.assembledText.includes(marker),
      "assembled terminal text must contain the marker",
    );

    // Disconnect/replay: capture a cursor, go offline, let mutations
    // accumulate, then reconnect the SAME device credential through
    // lastSeenSeq — a realistic device reconnect.
    const replayCredential = await acquireDeviceCredential(deps.host, "impairment-replay");
    const replayer = await ProfileClient.create({
      handle: deps.host,
      label: "replay-r1",
      accessToken: replayCredential.accessToken,
    });
    const offlineCursor = replayer.metrics.readySeq ?? 0;
    await replayer.close();

    const renames: string[] = [];
    for (let index = 0; index < RENAMES_WHILE_REPLAYER_OFFLINE; index += 1) {
      const uniqueName = `${deps.seedProjectName}-qa-offline-${String(index + 1)}`;
      await renameProjectAndAwaitFanout(healthy, [healthy], deps.project(), uniqueName);
      renames.push(uniqueName);
    }
    const offlineDoc = { impair: "while-replayer-offline" };
    const offlineRead = await writeAndReadBackNotes(healthy, deps.project(), offlineDoc);
    assert.deepStrictEqual(offlineRead, offlineDoc, "offline notes write must read back exactly");
    const settings = await healthy.fetchJson("settings-write", "/api/settings", {
      method: "POST",
      body: { searchExclude: { [`offline-${String(Date.now())}`]: true } },
    });
    expectOk(settings.status, "offline settings write", settings.body);

    const replayer2 = await ProfileClient.create({
      handle: deps.host,
      label: "replay-r2",
      accessToken: replayCredential.accessToken,
      lastSeenSeq: offlineCursor,
      declareBoundedCatalogChanges: true,
    });
    try {
      assert(
        (replayer2.metrics.readySeq ?? 0) >= offlineCursor,
        "reconnecting device must resume at or beyond its offline cursor",
      );
      const deadlineReplay = Date.now() + 20_000;
      for (;;) {
        if (replayer2.metrics.lastEventSeq !== null) break;
        if (Date.now() > deadlineReplay) throw new Error("replayer never received events");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const replayedEvents = replayer2
        .receivedEvents()
        .filter((event) => event.seq <= (replayer2.metrics.readySeq ?? 0));
      assert.strictEqual(
        replayer2.metrics.replayedEventCount,
        replayedEvents.length,
        "replayed-frame accounting",
      );
      assert(
        replayedEvents.length >= RENAMES_WHILE_REPLAYER_OFFLINE,
        "replay must cover every offline rename",
      );
      // Declared catalog contract: replayed catalog mutations are the
      // content-free bounded signal; rename order is proven by seq parity
      // against the healthy client's live full-list frames.
      for (const event of replayedEvents) {
        if (event.type !== "remote-projects-changed") continue;
        assert.deepStrictEqual(
          event.event,
          { type: "remote-projects-changed", mode: "signal" },
          `catalog replay frame at seq ${String(event.seq)} must be the bounded signal`,
        );
      }
      const healthyRenameSeqs = renames.map((uniqueName) => {
        const observed = healthy
          .receivedEvents()
          .filter(
            (event) =>
              event.type === "remote-projects-changed" &&
              JSON.stringify(event.event).includes(uniqueName),
          );
        const seq = observed[observed.length - 1]?.seq;
        assert(typeof seq === "number", `healthy client must have observed ${uniqueName} live`);
        return seq;
      });
      const replayedRenameSeqs = replayedEvents
        .filter((event) => event.type === "remote-projects-changed")
        .map((event) => event.seq);
      assert.deepStrictEqual(
        replayedRenameSeqs,
        healthyRenameSeqs,
        "replay must carry every offline rename at its live seq, in order",
      );
      assert.strictEqual(replayer2.metrics.eventSeqGaps, 0, "replay seq gaps");
      assert.strictEqual(replayer2.metrics.resyncRequiredCount, 0, "replay resync-required");

      const finalSnapshotSeq = await quiesceAndAssertConvergence(
        [healthy, slow, replayer2],
        "impairment",
        { assertProjectEventParity: false },
      );
      const replayBytes = replayedEvents.reduce((total, event) => total + event.appBytes, 0);
      const path = writeExperimentArtifact(deps.repoRoot, "impairment.json", {
        windowStartedAtMs,
        pauseDurationMs,
        terminalPayloadLines: TERMINAL_PAYLOAD_LINES,
        pairing: {
          streamDeviceCredentials: 1,
          streamConcurrentConnections: 2,
          replayDeviceReconnects: 1,
        },
        healthyRenamePropagationDuringPause: healthyTimings,
        slowDeliveredAfterResume: {
          appBytesReceived: slow.metrics.appBytesReceived,
          transportSocketBytesReceived: slow.metrics.transportSocketBytesReceived,
          eventsReceived: slow.metrics.eventsReceived,
        },
        terminal: {
          finalCursor: healthyState?.finalCursor ?? null,
          healthyRanges: healthyState?.ranges.length ?? 0,
          slowRanges: slowState?.ranges.length ?? 0,
        },
        replay: {
          offlineCursor,
          finalSnapshotSeq,
          replayedEventCount: replayer2.metrics.replayedEventCount,
          replayedApplicationBytes: replayBytes,
          readySeqAfterReconnect: replayer2.metrics.readySeq,
        },
        hostWorkload: (await deps.sampler?.window(windowStartedAtMs, Date.now())) ?? null,
        environment: deps.environment,
        warmupColdGitStatusMs: deps.warmupColdGitStatusMs,
      });
      console.log(`[shared-host] impairment evidence → ${path}`);
      return { finalSnapshotSeq };
    } finally {
      await replayer2.close();
    }
  } finally {
    await closeProfileClients([healthy, slow]);
  }
}
