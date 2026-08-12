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

    stream.publish({ type: "thread-output", threadId: "hidden", data: "no", outputLength: 2 });
    stream.publish({ type: "thread-output", threadId: "wanted", data: "yes", outputLength: 3 });
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
