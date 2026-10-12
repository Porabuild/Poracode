import { afterEach, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { PORACODE_RELAY_PROTOCOL_VERSION } from "@/shared/remote/relayProtocol";
import { encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import { RelayServer } from "./relayServer";

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function nextMessage(socket: WebSocket): Promise<{ data: Buffer; binary: boolean }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Message timed out")), 5_000);
    const onMessage = (data: RawData, binary: boolean) => {
      clearTimeout(timer);
      socket.off("error", finish);
      const bytes = Array.isArray(data)
        ? Buffer.concat(data)
        : data instanceof ArrayBuffer
          ? Buffer.from(data)
          : data;
      resolve({ data: bytes, binary });
    };
    const finish = (error: Error) => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", finish);
      reject(error);
    };
    socket.once("message", onMessage);
    socket.once("error", finish);
  });
}

async function open(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  cleanups.push(() => socket.terminate());
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return socket;
}

it.each(["text", "binary"] as const)(
  "rejects late %s messages from a replaced host control",
  async (kind) => {
    const acceptedControls: WebSocket[] = [];
    const handleUpgrade = WebSocketServer.prototype.handleUpgrade;
    vi.spyOn(WebSocketServer.prototype, "handleUpgrade").mockImplementation(
      function (this: WebSocketServer, request, socket, head, callback) {
        return handleUpgrade.call(this, request, socket, head, (accepted, req) => {
          if (req.url === "/host") acceptedControls.push(accepted);
          callback(accepted, req);
        });
      },
    );

    const relay = new RelayServer({ host: "127.0.0.1", port: 0 });
    const { port } = await relay.start();
    cleanups.push(() => relay.dispose());
    const register = async () => {
      const control = await open(`ws://127.0.0.1:${port}/host`);
      const reply = nextMessage(control);
      control.send(
        JSON.stringify({
          t: "register",
          protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
          serverId: "authority-fixture",
          secret: "fixture-secret",
        }),
      );
      expect(JSON.parse((await reply).data.toString())).toMatchObject({ t: "registered" });
      return control;
    };

    await register();
    const oldControl = acceptedControls[0]!;
    const current = await register();
    const opened = nextMessage(current);
    const visitor = await open(`ws://127.0.0.1:${port}/s/authority-fixture/ws`);
    const channel = JSON.parse((await opened).data.toString()) as { t: string; id: string };
    expect(channel.t).toBe("ws-open");
    const delivered = nextMessage(visitor);

    // Force delivery of an already-queued callback after replacement. The
    // server control was captured through ws's public upgrade callback; all
    // registration, visitor routing and delivery use real sockets.
    const stale =
      kind === "binary"
        ? Buffer.from(encodeRelayBinaryFrame(channel.id, new Uint8Array([255])))
        : Buffer.from(JSON.stringify({ t: "ws-data", id: channel.id, data: "stale" }));
    oldControl.emit("message", stale, kind === "binary");
    current.send(JSON.stringify({ t: "ws-data", id: channel.id, data: "current" }));

    const result = await delivered;
    expect(result.binary).toBe(false);
    expect(result.data.toString()).toBe("current");
  },
);
