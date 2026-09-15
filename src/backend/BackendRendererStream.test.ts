import {
  BACKEND_RENDERER_STREAM_VERSION,
  type RendererStreamOwnershipGrant,
} from "@/shared/backendHostProtocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream, type RendererStreamRevocation } from "./BackendRendererStream";
import { RendererStreamOwnership } from "./RendererStreamOwnership";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

describe("BackendRendererStream", () => {
  it.each(["interests", "request"])(
    "rejects previous-generation renderer %s frames",
    async (type) => {
      const onRequest = vi.fn<() => Promise<unknown>>(async () => ({}));
      const stream = new BackendRendererStream({ onRequest });
      streams.push(stream);
      const info = await stream.start();
      const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
      await hello;
      const payload =
        type === "interests"
          ? { terminalThreadIds: [], runtimeThreadIds: [], lastSeq: 0 }
          : { id: "old-request", operation: "database", name: "dbGetProjects", payload: {} };

      socket.send(JSON.stringify({ version: 2, type, ...payload }));

      await expect(nextClose(socket)).resolves.toBe(1008);
      expect(onRequest).not.toHaveBeenCalled();
    },
  );

  it("authenticates, filters by interest, and rejects malformed messages", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: ["wanted"],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await nextMessage(socket);

    stream.publish({
      type: "thread-output",
      threadId: "hidden",
      data: "no",
      outputLength: 2,
      terminalInstanceId: "gen-test",
    });
    stream.publish({
      type: "thread-output",
      threadId: "wanted",
      data: "yes",
      outputLength: 3,
      terminalInstanceId: "gen-test",
    });
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "event",
      event: { type: "thread-output", threadId: "wanted", data: "yes" },
    });

    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "call-supervisor",
        name: "startThread",
      }),
    );
    await expect(nextClose(socket)).resolves.toBe(1008);
  });

  it.each([
    { operation: "database", name: "dbGetProjects", payload: {} },
    {
      operation: "revert-checkpoint",
      name: "revertCheckpoint",
      payload: { threadId: "thread-1", checkpointItemId: "checkpoint-1", operationKey: "revert-1" },
    },
  ])(
    "carries authenticated $operation requests and replies on the same connection",
    async ({ operation, name, payload }) => {
      const onRequest = vi.fn<() => Promise<{ projects: number }>>(async () => ({ projects: 3 }));
      const stream = new BackendRendererStream({ onRequest });
      streams.push(stream);
      const info = await stream.start();
      const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
      await hello;
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: "request-1",
          operation,
          name,
          payload,
        }),
      );

      await expect(
        Promise.race([nextMessage(socket), nextClose(socket).then((code) => ({ closed: code }))]),
      ).resolves.toEqual({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "reply",
        id: "request-1",
        ok: true,
        data: { projects: 3 },
      });
      // Unbound requests carry no authenticated origin.
      expect(onRequest).toHaveBeenCalledWith(
        {
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: "request-1",
          operation,
          name,
          payload,
        },
        undefined,
      );

      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: "unknown-1",
          operation: "unknown",
          name,
          payload,
        }),
      );
      await expect(nextClose(socket)).resolves.toBe(1008);
      expect(onRequest).toHaveBeenCalledTimes(1);
    },
  );

  it("bounds concurrent renderer requests per client", async () => {
    const deferred = Promise.withResolvers<unknown>();
    const onRequest = vi.fn<() => Promise<unknown>>(async () => deferred.promise);
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;

    for (let index = 0; index < 64; index += 1) {
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: `held-${index}`,
          operation: "database",
          name: "dbGetProjects",
          payload: {},
        }),
      );
    }
    await vi.waitFor(() => expect(onRequest).toHaveBeenCalledTimes(64));

    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "rejected-65",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    await expect(nextMessage(socket)).resolves.toEqual({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "reply",
      id: "rejected-65",
      ok: false,
      error: "Renderer request concurrency limit reached.",
    });
    expect(onRequest).toHaveBeenCalledTimes(64);
    deferred.resolve({ ok: true });
  });

  it("applies the renderer byte budget to replies on a congested socket", async () => {
    const onRequest = vi.fn<() => Promise<unknown>>(async () => ({ ok: true }));
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await nextMessage(socket);

    const clients = (stream as unknown as { clients: Map<WebSocket, unknown> }).clients;
    const serverSocket = [...clients.keys()][0];
    expect(serverSocket).toBeDefined();
    Object.defineProperty(serverSocket, "bufferedAmount", {
      configurable: true,
      value: 2 * 1024 * 1024,
    });
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "congested-reply",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );
    await expect(nextClose(socket)).resolves.toBe(1013);
    expect(stream.getDiagnostics().slowClientDisconnects).toBe(1);
  });

  it("delivers bootstrapped terminal output only to the requesting window's bound connection", async () => {
    const ownership = new RendererStreamOwnership();
    const stream = new BackendRendererStream({ ownership });
    streams.push(stream);
    const info = await stream.start();
    const grant: RendererStreamOwnershipGrant = { windowId: 7, generation: 1, binding: "b-7" };
    ownership.setWindows([
      {
        windowId: 7,
        grant,
        interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
        receivesShellRemainder: false,
      },
    ]);
    const bound = await boundClient(info, grant);
    const anonymous = await boundClient(info, null);

    // The shell start's authenticated origin is window 7.
    stream.retainTerminalBootstrap("terminal-starting", 7);
    stream.publish({
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    });

    await expect(nextMessage(bound.socket)).resolves.toMatchObject({
      type: "event",
      event: { type: "thread-output", threadId: "terminal-starting", data: "first frame" },
    });
    // The unattributed sibling client never receives another window's
    // retained bootstrap output.
    await expect(noEventWithin(anonymous.socket, 100)).resolves.toBe(true);

    bound.socket.close();
    anonymous.socket.close();
  });

  it("never widens any client for an originless bootstrap start", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await boundClient(info, null);

    stream.retainTerminalBootstrap("terminal-starting");
    stream.publish({
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    });

    await expect(noEventWithin(client.socket, 100)).resolves.toBe(true);
    client.socket.close();
  });

  it("applies a mid-window bind to the initiating window's retained bootstrap thread", async () => {
    const ownership = new RendererStreamOwnership();
    const stream = new BackendRendererStream({ ownership });
    streams.push(stream);
    const info = await stream.start();
    const grant: RendererStreamOwnershipGrant = { windowId: 7, generation: 1, binding: "b-7" };
    ownership.setWindows([
      {
        windowId: 7,
        grant,
        interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
        receivesShellRemainder: false,
      },
    ]);
    stream.retainTerminalBootstrap("terminal-starting", 7);

    // The initiating window binds AFTER the retention was recorded.
    const bound = await boundClient(info, grant);
    stream.publish({
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    });

    await expect(nextMessage(bound.socket)).resolves.toMatchObject({
      type: "event",
      event: { type: "thread-output", threadId: "terminal-starting", data: "first frame" },
    });
    bound.socket.close();
  });

  it("refuses to narrow the recovery barrier when loss records were dropped from the map", async () => {
    // Recovery-scope coverage guard (rereview F-A): the 512-entry loss map
    // drops its LOWEST records on overflow. The dropped losses can lie inside
    // the barrier's window, so a present scope built from the surviving map
    // would silently omit them (repro: 520 distinct oversized lost threads ->
    // 512 surviving hints -> barrier omitted lost-1..lost-8 while advancing
    // the cursor). The barrier must fail open to a full authoritative rebuild.
    const revocations: RendererStreamRevocation[] = [];
    const ownership = new RendererStreamOwnership();
    const stream = new BackendRendererStream({
      ownership,
      onStreamRecovery: (revoked) => revocations.push(...revoked),
    });
    streams.push(stream);
    const info = await stream.start();
    const grant: RendererStreamOwnershipGrant = { windowId: 7, generation: 1, binding: "b-7" };
    ownership.setWindows([
      {
        windowId: 7,
        grant,
        interests: {
          terminalThreadIds: ["lost-1"],
          runtimeThreadIds: [],
          allRuntimeEvents: false,
        },
        receivesShellRemainder: false,
      },
    ]);
    const client = await boundClient(info, grant);
    expect(client.ack).toMatchObject({ latestSeq: 0 });

    // 520 undeliverable (> 512 KB, nothing withholdable) terminal outputs.
    const oversized = "x".repeat(520 * 1024);
    for (let index = 1; index <= 520; index += 1) {
      stream.publish({
        type: "thread-output",
        threadId: `lost-${index}`,
        data: oversized,
        outputLength: oversized.length,
        terminalInstanceId: "gen-test",
      });
    }

    client.socket.close();
    await vi.waitFor(() => expect(revocations).toHaveLength(1));
    expect(revocations[0]).toMatchObject({ windowId: 7, fromSequence: 1, toSequence: 520 });
    // The recorded losses do not reach back to the window's start: no scope
    // may travel — the old code shipped a present list silently omitting
    // lost-1..lost-8, foreclosing their recovery.
    expect(revocations[0]!.threadIds).toBeUndefined();
  });

  it("keeps a present barrier scope while the loss map retains full coverage", async () => {
    // Small losses never evict: the barrier narrows to exactly the lost
    // threads, so the coverage guard does not over-fire.
    const revocations: RendererStreamRevocation[] = [];
    const ownership = new RendererStreamOwnership();
    const stream = new BackendRendererStream({
      ownership,
      onStreamRecovery: (revoked) => revocations.push(...revoked),
    });
    streams.push(stream);
    const info = await stream.start();
    const grant: RendererStreamOwnershipGrant = { windowId: 7, generation: 1, binding: "b-7" };
    ownership.setWindows([
      {
        windowId: 7,
        grant,
        interests: { terminalThreadIds: [], runtimeThreadIds: [], allRuntimeEvents: false },
        receivesShellRemainder: false,
      },
    ]);
    const client = await boundClient(info, grant);

    const oversized = "x".repeat(520 * 1024);
    stream.publish({
      type: "thread-output",
      threadId: "lost-a",
      data: oversized,
      outputLength: oversized.length,
      terminalInstanceId: "gen-test",
    });
    stream.publish({
      type: "thread-output",
      threadId: "lost-b",
      data: oversized,
      outputLength: oversized.length,
      terminalInstanceId: "gen-test",
    });

    client.socket.close();
    await vi.waitFor(() => expect(revocations).toHaveLength(1));
    expect(revocations[0]).toMatchObject({ fromSequence: 1, toSequence: 2 });
    expect([...(revocations[0]!.threadIds ?? [])].sort()).toEqual(["lost-a", "lost-b"]);
  });

  it("replays retained events after reconnect", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    stream.publish({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    });

    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "event",
      seq: 1,
      event: { type: "thread-state", threadId: "thread-1" },
    });
  });

  it("rejects clients without the per-launch token", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const socket = new WebSocket(`${info.url}?token=wrong`);
    await expect(nextUnexpectedResponse(socket)).resolves.toBe(401);
  });

  it("keeps reporting aggregate delivery after a sibling client disconnects", async () => {
    // Pins why the host-IPC fallback can never trust publish()'s `delivered`:
    // the disconnected window is removed from the client map, so the host
    // cannot see that it missed the event (MC-1 mechanism).
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const first = await readyClient(info, [], ["thread-1"]);
    const second = await readyClient(info, [], ["thread-1"]);
    expect(stream.getDiagnostics().connectedClients).toBe(2);

    second.socket.close();
    await vi.waitFor(() => expect(stream.getDiagnostics().connectedClients).toBe(1));

    const result = stream.publish({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(result.delivered).toBe(true);
    await expect(nextMessage(first.socket)).resolves.toMatchObject({
      type: "event",
      event: { type: "thread-state", threadId: "thread-1" },
    });
  });

  it("reports delivered=false when no ready client is connected", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info, [], ["thread-1"]);
    client.socket.close();
    await vi.waitFor(() => expect(stream.getDiagnostics().connectedClients).toBe(0));

    const result = stream.publish({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(result.delivered).toBe(false);
  });

  it("does not report delivery when no ready client's router passes the event", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    await readyClient(info, ["thread-1"], []);

    const result = stream.publish({
      type: "thread-output",
      threadId: "thread-hidden",
      data: "no",
      outputLength: 2,
      terminalInstanceId: "gen-test",
    });
    expect(result.delivered).toBe(false);
  });

  it("keeps small-event replay across the widened window (WS5 P1-9)", async () => {
    // 3,500 tiny streaming events exhaust the old 500-entry cap (forcing a
    // full resync) while staying far inside the 8 MB byte budget; they must
    // all stay replayable now.
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    for (let index = 0; index < 3_500; index += 1) {
      stream.publish({
        type: "thread-state",
        threadId: `thread-${index}`,
        status: "working",
        attention: "none",
        canResumeWithConfig: false,
      });
    }

    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "event",
      seq: 1,
    });
    expect(stream.getDiagnostics()).toMatchObject({
      connectedClients: 1,
      replayEvictions: 0,
      resyncRequests: 0,
    });
  });

  it("bounds replay and reports when a client must resynchronize", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    for (let index = 0; index < 4_001; index += 1) {
      stream.publish({
        type: "thread-state",
        threadId: `thread-${index}`,
        status: "working",
        attention: "none",
        canResumeWithConfig: false,
      });
    }

    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "resync-required",
      latestSeq: 4_001,
    });
    expect(stream.getDiagnostics()).toMatchObject({
      connectedClients: 1,
      replayEvictions: 1,
      resyncRequests: 1,
    });
  });

  it("caps an oversized runtime event instead of disconnecting clients, and keeps it replayable", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info, [], ["thread-big"]);

    stream.publish({
      type: "thread-runtime-event",
      threadId: "thread-big",
      event: {
        type: "item.completed",
        threadId: "thread-big",
        itemId: "item-1",
        payload: { image: "A".repeat(2 * 1024 * 1024), label: "screenshot" },
      },
    });

    // The event is delivered with its largest field withheld, the socket stays
    // open, and the capped event is what lands in the replay buffer.
    const message = await nextMessage(client.socket);
    expect(message).toMatchObject({ type: "event", seq: 1 });
    const supervisorEvent = message.event as {
      event?: { payload?: { image?: unknown; label?: unknown } };
    };
    expect(supervisorEvent.event?.payload?.label).toBe("screenshot");
    expect(supervisorEvent.event?.payload?.image).toMatchObject({
      __poracodeOmitted: { bytes: expect.any(Number) },
    });
    expect(stream.getDiagnostics().slowClientDisconnects).toBe(0);

    client.socket.close();
    await vi.waitFor(() => expect(stream.getDiagnostics().connectedClients).toBe(0));
    // Replay sends the retained event before the interests-ack, so collect raw
    // messages from subscription time and expect the replay among them.
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    const replayed: Record<string, unknown>[] = [];
    socket.on("message", (data: Buffer) => {
      try {
        replayed.push(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch {
        // Ignore non-JSON frames; the assertion below inspects JSON messages.
      }
    });
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: ["thread-big"],
        lastSeq: 0,
      }),
    );
    await vi.waitFor(() => expect(replayed.map((m) => m.type)).toContain("event"));
    expect(replayed.find((m) => m.type === "event")).toMatchObject({ seq: 1 });
    socket.close();
  });

  it("broadcasts resync-required and skips replay for an event nothing can shrink", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info, ["thread-1"], []);

    stream.publish({
      type: "thread-output",
      threadId: "thread-1",
      data: "x".repeat(2 * 1024 * 1024),
      outputLength: 2 * 1024 * 1024,
      terminalInstanceId: "gen-test",
    });

    await expect(nextMessage(client.socket)).resolves.toMatchObject({
      type: "resync-required",
      latestSeq: 1,
    });
    expect(stream.getDiagnostics().slowClientDisconnects).toBe(0);

    // The undeliverable event never enters the replay buffer, so a client that
    // replays from before it must get resync-required, not a silent skip.
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    const reconnected: Record<string, unknown>[] = [];
    socket.on("message", (data: Buffer) => {
      try {
        reconnected.push(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch {
        // Ignore non-JSON frames; the assertion below inspects JSON messages.
      }
    });
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await vi.waitFor(() => expect(reconnected.map((m) => m.type)).toContain("resync-required"));
    expect(reconnected.find((m) => m.type === "resync-required")).toMatchObject({ latestSeq: 1 });
    socket.close();
  });

  it("carries the current loss batch to ready windows and the full loss map to reconnectors", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();

    // An event nothing can shrink is never replayable: its thread lands in the
    // loss scope that ships with the broadcast.
    const client = await readyClient(info, ["thread-1"], []);
    stream.publish({
      type: "thread-output",
      threadId: "thread-1",
      data: "x".repeat(2 * 1024 * 1024),
      outputLength: 2 * 1024 * 1024,
      terminalInstanceId: "gen-test",
    });
    await expect(nextMessage(client.socket)).resolves.toMatchObject({
      type: "resync-required",
      latestSeq: 1,
      threadIds: ["thread-1"],
    });

    // A second undeliverable event broadcasts only ITS batch: the ready
    // window already recovered thread-1, so it must not rebuild it again.
    stream.publish({
      type: "thread-output",
      threadId: "thread-2",
      data: "y".repeat(2 * 1024 * 1024),
      outputLength: 2 * 1024 * 1024,
      terminalInstanceId: "gen-test",
    });
    await expect(nextMessage(client.socket)).resolves.toMatchObject({
      type: "resync-required",
      threadIds: ["thread-2"],
    });

    // A reconnecting client whose cursor predates both losses still gets both
    // ids: broadcast clearing must never starve the gap path.
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: ["thread-1", "thread-2"],
        lastSeq: 0,
      }),
    );
    const gap = await nextMessage(socket);
    expect(gap).toMatchObject({ type: "resync-required", latestSeq: 2 });
    expect([...(gap.threadIds as string[])]).toEqual(["thread-1", "thread-2"]);
    socket.close();
  });

  it("records every batch thread of an undeliverable multi-thread event as lost", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info, [], ["thread-m1", "thread-m2"]);
    // A `content.delta` string is not a payload-withholding candidate, so the
    // combined event cannot shrink under the per-event budget (512 KB) and is
    // undeliverable.
    const bulky = "m".repeat(400 * 1024);

    stream.publish({
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "thread-m1",
          events: [
            {
              type: "content.delta",
              threadId: "thread-m1",
              itemId: "i1",
              stream: "assistant_text",
              delta: bulky,
            },
          ],
        },
        {
          threadId: "thread-m2",
          events: [
            {
              type: "content.delta",
              threadId: "thread-m2",
              itemId: "i2",
              stream: "assistant_text",
              delta: bulky,
            },
          ],
        },
      ],
    });

    await expect(nextMessage(client.socket)).resolves.toMatchObject({
      type: "resync-required",
      threadIds: expect.arrayContaining(["thread-m1", "thread-m2"]),
    });
  });

  it("narrows a reconnect gap to exactly the threads that client missed", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    // 601 events evict (seqs 1..601, distinct threads); the map caps at 512
    // entries and drops the 89 oldest losses, leaving seqs 90..601 recorded.
    for (let index = 0; index < 4_601; index += 1) {
      stream.publish({
        type: "thread-state",
        threadId: `thread-${index}`,
        status: "working",
        attention: "none",
        canResumeWithConfig: false,
      });
    }

    // A cursor older than the recorded losses cannot be narrowed safely — the
    // gap may hold the cap-dropped threads — so no hint travels.
    const ancient = await connectWindow(info, ["thread-4600"], 0);
    expect(ancient.gap).toMatchObject({ type: "resync-required", latestSeq: 4_601 });
    expect(ancient.gap.threadIds).toBeUndefined();
    ancient.socket.close();

    // A cursor inside the surviving window replays normally — no resync.
    const mid = await connectWindow(info, ["thread-4600"], 700);
    expect(mid.gap).toMatchObject({ type: "event", seq: 701 });
    mid.socket.close();

    // A gapped cursor the loss map still covers gets the precise scope: the
    // surviving-window threads it will skip plus evicted threads above its
    // cursor, and never a thread it already processed.
    const covered = await connectWindow(info, ["thread-4600"], 300);
    expect(covered.gap).toMatchObject({ type: "resync-required", latestSeq: 4_601 });
    const hint = covered.gap.threadIds as string[];
    expect(hint).toContain("thread-300");
    expect(hint).toContain("thread-4600");
    expect(hint).not.toContain("thread-0");
    expect(hint).not.toContain("thread-299");
    covered.socket.close();
  });

  it("forwards supervisor-shed thread ids through the resync broadcast", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const client = await readyClient(info, ["shed-1", "shed-2"], []);

    stream.broadcastResyncRequired(["shed-1", "shed-2"]);

    await expect(nextMessage(client.socket)).resolves.toMatchObject({
      type: "resync-required",
      threadIds: ["shed-1", "shed-2"],
    });
  });
});

/** Connects with a cursor and captures the first post-interests message. */
async function connectWindow(
  info: { url: string; token: string },
  runtimeThreadIds: string[],
  lastSeq: number,
): Promise<{ socket: WebSocket; gap: Record<string, unknown> }> {
  const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
  await hello;
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: [],
      runtimeThreadIds,
      lastSeq,
    }),
  );
  return { socket, gap: await nextMessage(socket) };
}

function connect(
  url: string,
): Promise<{ socket: WebSocket; hello: Promise<Record<string, unknown>> }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const hello = nextMessage(socket);
    socket.once("open", () => resolve({ socket, hello }));
    socket.once("error", reject);
  });
}

/** Connects, authenticates, and registers interests, settling after the ack. */
async function readyClient(
  info: { url: string; token: string },
  terminalThreadIds: string[],
  runtimeThreadIds: string[],
): Promise<{ socket: WebSocket }> {
  const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
  await hello;
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds,
      runtimeThreadIds,
      lastSeq: 0,
    }),
  );
  await nextMessage(socket);
  return { socket };
}

/**
 * Connects and registers empty interests, optionally presenting an ownership
 * grant. Resolves after the interests-ack, echoing the confirmed handoff.
 */
async function boundClient(
  info: { url: string; token: string },
  grant: RendererStreamOwnershipGrant | null,
): Promise<{ socket: WebSocket; ack: Record<string, unknown> }> {
  const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
  await hello;
  socket.send(
    JSON.stringify({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests",
      terminalThreadIds: [],
      runtimeThreadIds: [],
      lastSeq: 0,
      ...(grant ? { ownership: grant } : {}),
    }),
  );
  const ack = await nextMessage(socket);
  expect(ack.type).toBe("interests-ack");
  expect(ack.ownership).toEqual(
    grant ? { windowId: grant.windowId, generation: grant.generation } : undefined,
  );
  return { socket, ack };
}

/** Resolves true when no event frame arrives within the delay. */
async function noEventWithin(socket: WebSocket, delayMs: number): Promise<boolean> {
  let sawEvent = false;
  const onMessage = (data: Buffer): void => {
    try {
      if ((JSON.parse(data.toString()) as { type?: string }).type === "event") sawEvent = true;
    } catch {
      // Non-JSON frames cannot be bootstrap events.
    }
  };
  socket.on("message", onMessage);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  socket.off("message", onMessage);
  return !sawEvent;
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      try {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
  });
}

function nextClose(socket: WebSocket): Promise<number> {
  return new Promise((resolve) => socket.once("close", resolve));
}

function nextUnexpectedResponse(socket: WebSocket): Promise<number> {
  return new Promise((resolve, reject) => {
    socket.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
    socket.once("error", reject);
  });
}
