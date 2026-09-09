import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BackendRendererStream } from "./BackendRendererStream";

const streams: BackendRendererStream[] = [];

afterEach(async () => {
  await Promise.all(streams.splice(0).map((stream) => stream.dispose()));
});

describe("BackendRendererStream", () => {
  it("authenticates, filters by interest, and rejects malformed messages", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: 2,
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

    socket.send(JSON.stringify({ version: 2, type: "call-supervisor", name: "startThread" }));
    await expect(nextClose(socket)).resolves.toBe(1008);
  });

  it("carries authenticated backend requests and replies on the same connection", async () => {
    const onRequest = vi.fn<() => Promise<{ projects: number }>>(async () => ({ projects: 3 }));
    const stream = new BackendRendererStream({ onRequest });
    streams.push(stream);
    const info = await stream.start();
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: 2,
        type: "request",
        id: "request-1",
        operation: "database",
        name: "dbGetProjects",
        payload: {},
      }),
    );

    await expect(nextMessage(socket)).resolves.toEqual({
      version: 2,
      type: "reply",
      id: "request-1",
      ok: true,
      data: { projects: 3 },
    });
    expect(onRequest).toHaveBeenCalledWith({
      version: 2,
      type: "request",
      id: "request-1",
      operation: "database",
      name: "dbGetProjects",
      payload: {},
    });
  });

  it("delivers bootstrapped terminal output before the client interest arrives", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    stream.retainTerminalBootstrap("terminal-starting");
    const { socket, hello } = await connect(`${info.url}?token=${info.token}`);
    await hello;
    socket.send(
      JSON.stringify({
        version: 2,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await nextMessage(socket);

    stream.publish({
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    });

    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "event",
      event: { type: "thread-output", threadId: "terminal-starting", data: "first frame" },
    });
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
        version: 2,
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

  it("bounds replay and reports when a client must resynchronize", async () => {
    const stream = new BackendRendererStream();
    streams.push(stream);
    const info = await stream.start();
    for (let index = 0; index < 501; index += 1) {
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
        version: 2,
        type: "interests",
        terminalThreadIds: [],
        runtimeThreadIds: [],
        lastSeq: 0,
      }),
    );
    await expect(nextMessage(socket)).resolves.toMatchObject({
      type: "resync-required",
      latestSeq: 501,
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
        version: 2,
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
        version: 2,
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
});

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
      version: 2,
      type: "interests",
      terminalThreadIds,
      runtimeThreadIds,
      lastSeq: 0,
    }),
  );
  await nextMessage(socket);
  return { socket };
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
