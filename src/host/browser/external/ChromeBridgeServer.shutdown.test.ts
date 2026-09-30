import { createServer } from "node:http";
import { connect, type Socket } from "node:net";
import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { ChromeBridgeServer } from "./ChromeBridgeServer";

const roots: string[] = [];
const bridges: ChromeBridgeServer[] = [];
const clients: (Socket | WebSocket)[] = [];
function fixture(ports: readonly number[] = [0]) {
  const root = mkdtempSync(join(tmpdir(), "poracode-chrome-close-"));
  roots.push(root);
  const pairingFilePath = join(root, "synthetic-pairing.json");
  const bridge = new ChromeBridgeServer({ pairingFilePath, ports });
  bridges.push(bridge);
  return { bridge, pairingFilePath };
}
afterEach(async () => {
  for (const client of clients.splice(0)) {
    if (client instanceof WebSocket) client.terminate();
    else client.destroy();
  }
  for (const bridge of bridges.splice(0)) await bridge.dispose();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Chrome bridge lifetime", () => {
  it("joins raw HTTP and connected pre-hello sockets during disposal", async () => {
    const { bridge } = fixture();
    const info = await bridge.start();
    const raw = connect(info.port, "127.0.0.1");
    clients.push(raw);
    await once(raw, "connect");
    raw.write("GET / HTTP/1.1\r\n");
    const websocket = new WebSocket(`ws://127.0.0.1:${info.port}?token=${info.token}`);
    clients.push(websocket);
    await once(websocket, "open");
    expect(bridge.getConnection()).toBeNull();
    let rawClosed = false;
    let websocketClosed = false;
    raw.once("close", () => {
      rawClosed = true;
    });
    websocket.once("close", () => {
      websocketClosed = true;
    });
    const closing = bridge.dispose();
    expect(bridge.dispose()).toBe(closing);
    await closing;
    expect(rawClosed).toBe(true);
    expect(websocketClosed).toBe(true);
    expect(bridge.getInfo()).toBeNull();
  });

  it("joins concurrent startup without publishing after stop or reopening", async () => {
    const { bridge, pairingFilePath } = fixture();
    const starting = bridge.start();
    expect(bridge.start()).toBe(starting);
    const outcome = starting.catch((error: unknown) => error);
    const closing = bridge.dispose();
    expect(await outcome).toBeInstanceOf(Error);
    await closing;
    expect(existsSync(pairingFilePath)).toBe(false);
    await expect(bridge.start()).rejects.toThrow("stopping");
  });

  it("retries an occupied port and leaves its unrelated listener running", async () => {
    const blocker = createServer();
    blocker.listen(0, "127.0.0.1");
    await once(blocker, "listening");
    const address = blocker.address();
    if (!address || typeof address === "string") throw new Error("Missing fixture port");
    try {
      const { bridge } = fixture([address.port, 0]);
      const info = await bridge.start();
      expect(info.port).not.toBe(address.port);
      await bridge.dispose();
      expect(blocker.listening).toBe(true);
    } finally {
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });

  it("rejects pending extension replies before joining their transport", async () => {
    const { bridge } = fixture();
    const info = await bridge.start();
    const changed = Promise.withResolvers<void>();
    bridge.onChange(() => {
      if (bridge.getConnection()) changed.resolve();
    });
    const websocket = new WebSocket(`ws://127.0.0.1:${info.port}?token=${info.token}`);
    clients.push(websocket);
    await once(websocket, "open");
    websocket.send(JSON.stringify({ type: "hello", extensionVersion: "synthetic" }));
    await changed.promise;
    const request = bridge
      .getConnection()!
      .listTabs()
      .catch((error: unknown) => error);
    await once(websocket, "message");
    await bridge.dispose();
    expect(await request).toBeInstanceOf(Error);
    expect(bridge.getConnection()).toBeNull();
  });
});
