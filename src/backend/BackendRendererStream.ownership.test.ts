import type {
  BackendHostOutboundMessage,
  BackendRendererStreamInfo,
  RendererStreamRecoveryBarrier,
} from "@/shared/backendHostProtocol";
import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";
import { RendererStreamOwnership } from "./RendererStreamOwnership";
import { createSupervisorEventRelay } from "./supervisorEventRelay";
import { planDesktopRelay } from "./supervisorEventFallback";
import { filterSupervisorEventForInterests } from "./BackendHostCore";
import { ElectronBackendTransport } from "@/renderer/electronBackendTransport";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

const GRANT_A = { windowId: 7, generation: 1, binding: "b-7" };

const BULK = (data: string): SupervisorEvent => ({
  type: "thread-output",
  threadId: "thread-1",
  data,
  outputLength: data.length,
  terminalInstanceId: "gen-1",
});

const CONTROL: SupervisorEvent = {
  type: "thread-state",
  threadId: "thread-1",
  status: "working",
  attention: "none",
  canResumeWithConfig: false,
};

function interests(threads: string[]) {
  return {
    terminalThreadIds: [...threads],
    runtimeThreadIds: [...threads],
    allRuntimeEvents: false,
  };
}

async function waitFor(predicate: () => boolean, what: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out: ${what}`);
}

function serverSockets(stream: BackendRendererStream): WebSocket[] {
  const clients = (stream as unknown as { clients: Map<WebSocket, unknown> }).clients;
  return [...clients.keys()];
}

function highestAckedSequence(stream: BackendRendererStream): number {
  const clients = (stream as unknown as { clients: Map<WebSocket, unknown> }).clients;
  let highest = 0;
  for (const [, state] of clients) {
    const acked = (state as { ackedSequence: number | null }).ackedSequence;
    if (acked !== null) highest = Math.max(highest, acked);
  }
  return highest;
}

interface MainSimulator {
  envelopes: Array<{
    event?: SupervisorEvent;
    rendererSequence?: number;
    target?: { windowId: number; generation: number };
  }>;
  barriers: RendererStreamRecoveryBarrier[];
}

/**
 * Full production delivery path: the real BackendRendererStream, the real
 * per-window ownership registry, the real relay planner, and the REAL
 * ElectronBackendTransport class over real WebSockets. Only Electron's
 * webContents.send and the preload bridge are simulated — by delivering
 * backend-to-main envelopes to the transport's own host-bridge listeners,
 * targeted envelopes only to window 7.
 */
async function makeComposedHarness(): Promise<{
  stream: BackendRendererStream;
  ownership: RendererStreamOwnership;
  transport: ElectronBackendTransport;
  applied(): Array<{ event: SupervisorEvent; sequence?: number }>;
  relay(event: SupervisorEvent): void;
  main: MainSimulator;
  info: { url: string; token: string };
}> {
  const ownership = new RendererStreamOwnership();
  // Main's table is armed before the transport binds, as in production. The
  // simulated window is also main's own shell-recipient window: it receives
  // the untargeted shell copies in sendToMain below, exactly like mainWindow.
  ownership.setWindows([
    {
      windowId: GRANT_A.windowId,
      grant: GRANT_A,
      interests: interests(["thread-1"]),
      receivesShellRemainder: true,
    },
  ]);
  const main: MainSimulator = { envelopes: [], barriers: [] };
  let supervisorListener: ((event: SupervisorEvent, sequence?: number) => void) | null = null;
  let recoveryListener: ((barrier: RendererStreamRecoveryBarrier) => void) | null = null;
  const applied: Array<{ event: SupervisorEvent; sequence?: number }> = [];
  const stream = new BackendRendererStream({
    ownership,
    // The host entry point envelopes owner-revocation recovery into the
    // ordered desktop-IPC fallback; mirror that conversion here.
    onStreamRecovery: (revocations) => {
      for (const revocation of revocations) {
        const barrier: RendererStreamRecoveryBarrier = {
          windowId: revocation.windowId,
          generation: revocation.generation,
          fromSequence: revocation.fromSequence,
          toSequence: revocation.toSequence,
          ...(revocation.threadIds ? { threadIds: revocation.threadIds } : {}),
        };
        main.barriers.push(barrier);
        if (revocation.windowId === GRANT_A.windowId) recoveryListener?.(barrier);
      }
    },
  });
  streams.push(stream);
  const info = await stream.start();

  const relay = createSupervisorEventRelay({
    publishToRendererStream: (event) => stream.publish(event),
    observeEvent: () => undefined,
    planDesktopRelay: (event) =>
      planDesktopRelay({
        event,
        ownershipArmed: ownership.isArmed(),
        fallbackWindows: ownership.fallbackWindows(),
        isTerminalBootstrapRetainedFor: () => false,
        filterEventForInterests: (filtered, windowInterests) =>
          filterSupervisorEventForInterests(filtered, windowInterests),
        filterShellEvent: (shell) => shell,
      }),
    // Electron main: targeted envelopes go to exactly that window; shell
    // copies and recovery barriers route through the preload bridge to the
    // transport under test (window 7).
    sendToMain: (message: BackendHostOutboundMessage) => {
      if (message.kind === "supervisor-event") {
        main.envelopes.push({
          event: message.event,
          ...(message.rendererSequence !== undefined
            ? { rendererSequence: message.rendererSequence }
            : {}),
          ...(message.target ? { target: message.target } : {}),
        });
        if (message.target && message.target.windowId !== GRANT_A.windowId) return;
        supervisorListener?.(message.event, message.rendererSequence);
        return;
      }
      if (message.kind === "renderer-stream-recovery") {
        main.barriers.push(message);
        if (message.windowId !== GRANT_A.windowId) return;
        recoveryListener?.(message);
      }
    },
  });

  const streamInfo: BackendRendererStreamInfo = {
    version: BACKEND_RENDERER_STREAM_VERSION,
    url: info.url,
    token: info.token,
  };
  const host = {
    clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
    onSupervisorEvent: (listener: (event: SupervisorEvent, sequence?: number) => void) => {
      supervisorListener = listener;
      return () => {};
    },
    onSupervisorEventGap: () => () => {},
    onRendererStreamRecovery: (listener: (barrier: RendererStreamRecoveryBarrier) => void) => {
      recoveryListener = listener;
      return () => {};
    },
    onBackendRendererStreamChanged: () => () => {},
    getBackendRendererStreamInfo: async () => streamInfo,
    getRendererStreamOwnershipGrant: async () => GRANT_A,
    invokeProcedure: async () => undefined,
  } as unknown as ElectronHostBridge;

  const transport = new ElectronBackendTransport(host);
  // The subscribe callback receives the renderer sequence as a second
  // runtime argument; the public listener type omits it.
  (
    transport.subscribe as (
      listener: (event: SupervisorEvent, sequence?: number) => void,
    ) => () => void
  )((event, sequence) => {
    applied.push(sequence === undefined ? { event } : { event, sequence });
  });
  void transport.setEventInterests(interests(["thread-1"]));
  // The handoff is confirmed once the armed table has no fallback consumers.
  await waitFor(
    () => ownership.isArmed() && ownership.fallbackWindows().length === 0,
    "ownership bind via the transport's grant pull",
  );

  return {
    stream,
    ownership,
    transport,
    applied: () => applied,
    relay: (event) => relay(event),
    main,
    info,
  };
}

describe("composed close-skew recovery (blocker 3): real stream + real relay + real transport", () => {
  it("recovers a same-tick publish after a server-side close, with onclose delayed", async () => {
    const harness = await makeComposedHarness();

    // T0: the backend closes the owned socket (the 1013 backpressure shape).
    // The renderer's close event has NOT fired yet — close skew.
    serverSockets(harness.stream)[0]!.close(1013, "Renderer stream backpressure");
    // T1: same-tick publish. The owner is still attached, the socket is
    // CLOSING: the event cannot be delivered, and the old behavior silently
    // suppressed its IPC copy — losing it forever.
    harness.relay(BULK("E1-suppressed"));

    // T2: the recovery barrier is enqueued BEFORE any fallback copy,
    // targeted and generation-fenced, with the loss window.
    await waitFor(() => harness.main.barriers.length > 0, "recovery barrier");
    expect(harness.main.barriers[0]!).toMatchObject({
      windowId: GRANT_A.windowId,
      generation: GRANT_A.generation,
    });
    expect(harness.main.barriers[0]!.fromSequence).toBeLessThanOrEqual(
      harness.main.barriers[0]!.toSequence,
    );

    // The transport honored the barrier without any local close event: the
    // window rebuilt the lost thread authoritatively (terminal resync plus
    // runtime reset for the scoped thread).
    const rebuilds = harness
      .applied()
      .filter(
        (entry) =>
          entry.event.type === "thread-scrollback-resync" || entry.event.type === "thread-reset",
      )
      .map((entry) => entry.event.type)
      .sort();
    expect(rebuilds).toEqual(["thread-reset", "thread-scrollback-resync"]);

    // T3: a later fallback bulk copy applies on top of the recovery — it is
    // targeted at this window and sequenced above the repaired cursor.
    harness.relay(BULK("E2-after-barrier"));
    await waitFor(
      () =>
        harness
          .applied()
          .some(
            (entry) =>
              entry.event.type === "thread-output" && entry.event.data === "E2-after-barrier",
          ),
      "post-barrier fallback copy applied",
    );

    // No bulk ever crossed untargeted: every bulk envelope was targeted at
    // window 7.
    for (const envelope of harness.main.envelopes) {
      if (envelope.event?.type !== "thread-output") continue;
      expect(envelope.target).toEqual({
        windowId: GRANT_A.windowId,
        generation: GRANT_A.generation,
      });
    }

    // T4: the transport reconnects — a NEW socket binds — and its
    // acknowledged handoff cursor sits at or above the barrier top: E1 was
    // recovered by the rebuild, so replay must never need it again.
    const socketBefore = serverSockets(harness.stream)[0];
    await waitFor(
      () =>
        serverSockets(harness.stream)[0] !== undefined &&
        serverSockets(harness.stream)[0] !== socketBefore,
      "reconnect socket",
    );
    await waitFor(
      () => highestAckedSequence(harness.stream) >= harness.main.barriers[0]!.toSequence,
      "reconnected cursor",
    );
  });

  it("keeps delivery exact when the client observes the close first", async () => {
    const harness = await makeComposedHarness();

    // E1 delivered directly while owned.
    harness.relay(BULK("E1-direct"));
    await waitFor(
      () =>
        harness
          .applied()
          .some(
            (entry) => entry.event.type === "thread-output" && entry.event.data === "E1-direct",
          ),
      "direct delivery",
    );

    serverSockets(harness.stream)[0]!.close(1000, "client navigated");
    // The client's onclose fires; the backend close event revokes ownership.
    await waitFor(
      () => harness.ownership.fallbackWindows().some((w) => w.windowId === GRANT_A.windowId),
      "backend revoked the window",
    );

    // E2 crosses as a targeted fallback copy; nothing is re-delivered.
    harness.relay(BULK("E2-fallback"));
    await waitFor(
      () =>
        harness
          .applied()
          .some(
            (entry) => entry.event.type === "thread-output" && entry.event.data === "E2-fallback",
          ),
      "fallback copy applied",
    );

    const appliedData = harness
      .applied()
      .filter((entry) => entry.event.type === "thread-output")
      .map((entry) => (entry.event as { data: string }).data);
    expect(appliedData).toEqual(["E1-direct", "E2-fallback"]);
  });

  it("applies controls exactly once to the shell-recipient window, owned or not", async () => {
    const harness = await makeComposedHarness();

    harness.relay(CONTROL);
    // While owned: exactly one untargeted shell copy crosses main; the event
    // itself reaches the window once, through its direct stream.
    expect(harness.main.envelopes).toHaveLength(1);
    expect(harness.main.envelopes[0]!.target).toBeUndefined();
    expect(harness.main.envelopes[0]!.rendererSequence).toBeUndefined();
    await vi.waitFor(() => expect(appliedThreadStates(harness)).toHaveLength(1));

    serverSockets(harness.stream)[0]!.close(1013, "Renderer stream backpressure");
    await waitFor(() => harness.main.barriers.length > 0, "recovery barrier");
    harness.relay(CONTROL);
    // As a fallback consumer the shell recipient STILL receives its controls
    // exactly once — via the sequence-less shell copy. The backend plans no
    // targeted control copy for it: that would deliver every subscribed
    // control twice to the one window main feeds anyway.
    const controlEnvelopes = harness.main.envelopes.filter(
      (envelope) => envelope.event?.type === "thread-state",
    );
    expect(controlEnvelopes).toHaveLength(2);
    for (const envelope of controlEnvelopes) {
      expect(envelope.target).toBeUndefined();
      expect(envelope.rendererSequence).toBeUndefined();
    }
    // Total applications stay exact-once per relay: owned direct delivery,
    // then one fallback application — never copy-plus-shell duplication.
    await vi.waitFor(() => expect(appliedThreadStates(harness)).toHaveLength(2));
  });

  it("keeps control copies for a fallback window that lacks the shell path", async () => {
    const harness = await makeComposedHarness();
    // Re-arm with an unowned sibling (no transport of its own here): window 8
    // has no shell path, so its targeted copy is its only route for controls.
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: GRANT_A,
        interests: interests(["thread-1"]),
        receivesShellRemainder: true,
      },
      {
        windowId: 8,
        grant: { windowId: 8, generation: 2, binding: "b-8" },
        interests: interests([]),
        receivesShellRemainder: false,
      },
    ]);

    harness.relay(CONTROL);
    const controlEnvelopes = harness.main.envelopes.filter(
      (envelope) => envelope.event?.type === "thread-state",
    );
    // Shell copy for main's consumers, targeted sequenced copy for window 8,
    // and NO targeted control copy for the shell-recipient window 7.
    const shellCopies = controlEnvelopes.filter((envelope) => envelope.target === undefined);
    expect(shellCopies).toHaveLength(1);
    const siblingCopy = controlEnvelopes.find((envelope) => envelope.target?.windowId === 8);
    expect(siblingCopy).toBeDefined();
    expect(siblingCopy!.target).toEqual({ windowId: 8, generation: 2 });
    expect(siblingCopy!.event).toEqual(CONTROL);
    expect(
      controlEnvelopes.some(
        (envelope) =>
          envelope.target?.windowId === GRANT_A.windowId && envelope.rendererSequence !== undefined,
      ),
    ).toBe(false);
  });
});

function appliedThreadStates(harness: {
  applied(): Array<{ event: SupervisorEvent; sequence?: number }>;
}): unknown[] {
  return harness.applied().filter((entry) => entry.event.type === "thread-state");
}

describe("composed ownership binding (real sockets)", () => {
  it("binds only on the exact minted binding and rejects a stale re-presented grant", async () => {
    const harness = await makeComposedHarness();
    expect(harness.ownership.fallbackWindows()).toEqual([]);

    // A second connection presenting the same current grant supersedes.
    const second = new WebSocket(`${harness.info.url}?token=${harness.info.token}`);
    await new Promise<void>((resolve, reject) => {
      second.once("open", resolve);
      second.once("error", reject);
    });
    const messages: Record<string, unknown>[] = [];
    second.on("message", (data) =>
      messages.push(JSON.parse(String(data)) as Record<string, unknown>),
    );
    const interestsFrame = JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: ["thread-1"],
      runtimeThreadIds: ["thread-1"],
      lastSeq: 0,
      ownership: GRANT_A,
    });
    second.send(interestsFrame);
    await waitFor(() => messages.some((m) => m.type === "interests-ack"), "supersede ack");
    expect(messages.find((m) => m.type === "interests-ack")).toMatchObject({
      ownership: { windowId: 7, generation: 1 },
    });

    // A re-mint revokes both holders, and the stale socket cannot re-own the
    // superseded generation.
    harness.ownership.setWindows([
      {
        windowId: GRANT_A.windowId,
        grant: { ...GRANT_A, generation: 2, binding: "b-7-next" },
        interests: interests(["thread-1"]),
        receivesShellRemainder: false,
      },
    ]);
    expect(harness.ownership.fallbackWindows()).toEqual([
      {
        windowId: 7,
        generation: 2,
        interests: interests(["thread-1"]),
        receivesShellRemainder: false,
      },
    ]);

    second.send(interestsFrame);
    await waitFor(
      () => messages.filter((m) => m.type === "interests-ack").length >= 2,
      "stale re-bind ack",
    );
    const staleAck = messages.filter((m) => m.type === "interests-ack").at(-1)!;
    expect(staleAck.ownership).toBeUndefined();
    expect(harness.ownership.fallbackWindows()).toHaveLength(1);

    second.close();
  });

  it("keeps the legacy full relay before the first per-window push", async () => {
    const ownership = new RendererStreamOwnership();
    const stream = new BackendRendererStream({ ownership });
    streams.push(stream);
    const info = await stream.start();
    const sent: BackendHostOutboundMessage[] = [];
    const relay = createSupervisorEventRelay({
      publishToRendererStream: (event) => stream.publish(event),
      observeEvent: () => undefined,
      planDesktopRelay: (event) =>
        planDesktopRelay({
          event,
          ownershipArmed: ownership.isArmed(),
          fallbackWindows: ownership.fallbackWindows(),
          isTerminalBootstrapRetainedFor: () => false,
          filterEventForInterests: (filtered, windowInterests) =>
            filterSupervisorEventForInterests(filtered, windowInterests),
          filterShellEvent: (shell) => shell,
        }),
      sendToMain: (message) => sent.push(message),
    });

    // A socket may connect, but without an armed table the legacy behavior
    // persists — a stale main never loses its fallback copies.
    const socket = new WebSocket(`${info.url}?token=${info.token}`);
    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: ["thread-1"],
        runtimeThreadIds: ["thread-1"],
        lastSeq: 0,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    relay(BULK("legacy"));
    const bulkCopies = sent.filter(
      (message) => message.kind === "supervisor-event" && message.event.type === "thread-output",
    );
    expect(bulkCopies).toHaveLength(1);
    expect((bulkCopies[0] as unknown as { target?: unknown }).target).toBeUndefined();
    socket.close();
  });
});
