import { once } from "node:events";
import { Server } from "node:http";
import { connect as connectTcp } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { BACKEND_RENDERER_STREAM_VERSION } from "@/shared/backendHostProtocol";
import { BackendRendererStream } from "./BackendRendererStream";

it.each([false, true])(
  "joins an admitted renderer handler after transport close (client cancels=%s)",
  async (cancel) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const order: string[] = [];
    const stream = new BackendRendererStream({
      async onRequest() {
        entered.resolve();
        await release.promise;
        order.push("effect");
        return null;
      },
    });
    let socket: WebSocket | undefined;
    let stopping: Promise<void> | undefined;
    try {
      const info = await stream.start();
      socket = new WebSocket(`${info.url}?token=${info.token}`);
      await once(socket, "open");
      socket.send(
        JSON.stringify({
          version: BACKEND_RENDERER_STREAM_VERSION,
          type: "request",
          id: "held",
          operation: "service",
          name: "getSharedSettings",
          payload: {},
        }),
      );
      await entered.promise;
      if (cancel) {
        const closed = once(socket, "close");
        socket.terminate();
        await closed;
      }
      stopping = stream.dispose().then(() => {
        order.push("disposed");
      });
      await delay(30);
      expect(order).toEqual([]);
      release.resolve();
      await stopping;
      expect(order).toEqual(["effect", "disposed"]);
    } finally {
      release.resolve();
      socket?.terminate();
      await stopping;
      await stream.dispose();
    }
  },
);

it("can retry after a failed listen without reusing its rejected promise", async () => {
  const listen = vi.spyOn(Server.prototype, "listen");
  listen.mockImplementationOnce(function (this: Server) {
    queueMicrotask(() => this.emit("error", new Error("Synthetic bind failure")));
    return this;
  });
  const stream = new BackendRendererStream();
  try {
    await expect(stream.start()).rejects.toThrow("Synthetic bind failure");
    const info = await stream.start();
    expect(new URL(info.url).port).not.toBe("0");
  } finally {
    listen.mockRestore();
    await stream.dispose();
  }
});

it("registers a handler before it synchronously requests disposal", async () => {
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let stopping: Promise<void> | undefined;
  let stopped = false;
  const stream = new BackendRendererStream({
    onRequest() {
      stopping = stream.dispose().then(() => {
        stopped = true;
      });
      entered.resolve();
      return release.promise;
    },
  });
  let socket: WebSocket | undefined;
  try {
    const info = await stream.start();
    socket = new WebSocket(`${info.url}?token=${info.token}`);
    await once(socket, "open");
    socket.send(
      JSON.stringify({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "request",
        id: "reentrant",
        operation: "service",
        name: "getSharedSettings",
        payload: {},
      }),
    );
    await entered.promise;
    await delay(20);
    expect(stopped).toBe(false);
  } finally {
    release.resolve();
    socket?.terminate();
    await stopping;
    await stream.dispose();
  }
  expect(stopped).toBe(true);
});

it("joins one concurrent start and permanently refuses restart after disposal", async () => {
  const stream = new BackendRendererStream();
  try {
    const first = stream.start();
    const second = stream.start();
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1]).toEqual(outcomes[0]);
    await stream.dispose();
    await expect(stream.start()).rejects.toThrow(/shutting down|closed/i);
  } finally {
    await stream.dispose();
  }
});

it("closes a partial HTTP upgrade socket and joins its actual close", async () => {
  const stream = new BackendRendererStream();
  let socket: ReturnType<typeof connectTcp> | undefined;
  let stopping: Promise<void> | undefined;
  try {
    const info = await stream.start();
    socket = connectTcp({ host: "127.0.0.1", port: Number(new URL(info.url).port) });
    await once(socket, "connect");
    socket.write("GET /events HTTP/1.1\r\nHost: 127.0.0.1\r\nUpgrade: websocket\r\n");
    await delay(10);
    const closed = once(socket, "close");
    stopping = stream.dispose();
    expect(
      await Promise.race([
        Promise.all([stopping, closed]).then(() => true),
        delay(1_500).then(() => false),
      ]),
    ).toBe(true);
  } finally {
    socket?.destroy();
    await stopping;
    await stream.dispose();
  }
});

it("joins disposal callers while a listen operation is pending", async () => {
  const stream = new BackendRendererStream();
  const starting = stream.start();
  const first = stream.dispose();
  const second = stream.dispose();
  try {
    expect(second).toBe(first);
    await expect(starting).rejects.toThrow(/shutting down|closed/i);
    await first;
  } finally {
    await Promise.allSettled([starting, first, second]);
    await stream.dispose();
  }
});
