import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { ChromeBridgeServer } from "./ChromeBridgeServer";
import { callNativeHost } from "./chromeNativeHost.fixture";
import {
  chromeNativeHostDir,
  registerChromeNativeHost,
  writeChromeBridgeEntry,
} from "./chromeNativeHost";
import {
  CHROME_SIDEBAR_EXTENSION_IDS,
  CHROME_SIDEBAR_PROTOCOL_VERSION,
} from "@/shared/chromeSidebarProtocol";

/**
 * The shipped service worker, the generated native host (spawned through its
 * launcher with Chrome's framing) and the bridge, wired together. Everything
 * lives in a temp home; no browser profile, registry or global entry is used.
 */
const workerSource = readFileSync(join(process.cwd(), "chrome-extension", "background.js"), "utf8");
const ORIGIN = `chrome-extension://${CHROME_SIDEBAR_EXTENSION_IDS[0]}`;
const bootstrap = { endpoint: "http://127.0.0.1:9", pairingUrl: "http://127.0.0.1:9/#token=x" };
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function installNativeHost() {
  const home = mkdtempSync(join(tmpdir(), "poracode-handshake-"));
  cleanups.push(() => rmSync(home, { force: true, recursive: true }));
  const hostDir = chromeNativeHostDir(home);
  await registerChromeNativeHost({
    hostDir,
    homeDir: home,
    platform: process.platform,
    env: {},
    runtime: { path: process.execPath, electron: false },
    extensionIds: CHROME_SIDEBAR_EXTENSION_IDS,
  });
  return { home, hostDir, launcher: join(hostDir, "native-host.sh") };
}

/** Runs the worker against `port` until the test ends; Chrome APIs are minimal fakes. */
function runWorker(port: number, launcher: string) {
  let stopped = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sockets = new Set<WebSocket>();
  const sent: string[] = [];
  const urls: string[] = [];
  let onMessage: (message: unknown, sender: unknown, respond: (value: unknown) => void) => unknown;
  // The browser's WebSocket sends the extension origin, which page scripts cannot.
  class ExtensionSocket extends WebSocket {
    constructor(url: string) {
      super(url, { origin: ORIGIN });
      urls.push(url);
      sockets.add(this);
      this.on("error", () => {});
    }
    override send(data: string): void {
      sent.push(data);
      super.send(data);
    }
  }
  const storage: Record<string, unknown> = { port };
  const listener = { addListener() {} };
  const chrome = {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage[key] }),
        set: async (values: Record<string, unknown>) => Object.assign(storage, values),
        remove: async (key: string) => delete storage[key],
      },
    },
    runtime: {
      getManifest: () => ({ version: "0.2.0" }),
      sendNativeMessage: (_name: string, message: unknown) =>
        callNativeHost(launcher, [`${ORIGIN}/`], message),
      onMessage: { addListener: (fn: typeof onMessage) => (onMessage = fn) },
      onStartup: listener,
    },
    tabs: {
      query: async () => [{ id: 3, url: "https://example.test/", title: "T", active: true }],
    },
    alarms: { create() {}, onAlarm: listener },
    debugger: {
      onEvent: listener,
      onDetach: listener,
      detach: (_: unknown, done: () => void) => done(),
    },
    sidePanel: { setPanelBehavior: async () => {} },
  };
  vm.runInNewContext(workerSource, {
    chrome,
    WebSocket: ExtensionSocket,
    setTimeout: (callback: () => void, ms: number) => {
      if (stopped) return 0;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!stopped) callback();
      }, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    Date,
    crypto: globalThis.crypto,
    TextEncoder,
  });
  cleanups.push(() => {
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.terminate();
  });
  const ask = () =>
    new Promise<unknown>((resolve) => onMessage({ cmd: "getChatBootstrap" }, {}, resolve));
  return { ask, sent, urls };
}

describe("extension ↔ native host ↔ bridge handshake", () => {
  it.skipIf(process.platform === "win32")(
    "proves the per-launch secret both ways without it ever crossing the socket",
    async () => {
      const { home, hostDir, launcher } = await installNativeHost();
      const getChatBootstrap = vi.fn<() => Promise<typeof bootstrap>>(async () => bootstrap);
      const bridge = new ChromeBridgeServer({
        pairingFilePath: join(home, "bridge.json"),
        ports: [0],
        getChatBootstrap,
        extensionIds: CHROME_SIDEBAR_EXTENSION_IDS,
        nativeHostDir: hostDir,
      });
      cleanups.push(() => bridge.dispose());
      const info = await bridge.start();
      const connected = new Promise<void>((resolve) => bridge.onChange(resolve));
      const worker = runWorker(info.port, launcher);
      await connected;

      await vi.waitFor(async () => expect(await worker.ask()).toEqual(bootstrap), {
        timeout: 10_000,
      });
      expect(getChatBootstrap).toHaveBeenCalledTimes(1);
      // The proven connection also serves browser control to the bridge.
      await expect(bridge.getConnection()!.listTabs()).resolves.toEqual([
        expect.objectContaining({ tabId: 3 }),
      ]);
      expect(worker.urls).toEqual([`ws://127.0.0.1:${info.port}/`]);
      expect(worker.sent.join("\n")).not.toContain(info.token);
      expect(JSON.parse(worker.sent[0]!)).toMatchObject({
        type: "hello",
        nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
        clientProof: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    },
    20_000,
  );

  it.skipIf(process.platform === "win32")(
    "gives an impostor that holds the real bridge's port entry nothing to act on",
    async () => {
      const { home, hostDir, launcher } = await installNativeHost();
      // The real bridge publishes its entry, then an impostor answers on that
      // port (e.g. it outlived a crashed app and the pid was reused).
      const bridge = new ChromeBridgeServer({
        pairingFilePath: join(home, "bridge.json"),
        ports: [0],
        getChatBootstrap: async () => bootstrap,
        extensionIds: CHROME_SIDEBAR_EXTENSION_IDS,
        nativeHostDir: hostDir,
      });
      const info = await bridge.start();
      await bridge.dispose();
      // dispose() removed the entry; republish it as a stale crash leftover.
      writeChromeBridgeEntry(hostDir, join(home, "bridge.json"), info);

      const http = createServer();
      const impostor = new WebSocketServer({ server: http });
      http.listen(info.port, "127.0.0.1");
      await once(http, "listening");
      cleanups.push(
        () => new Promise<void>((resolve) => impostor.close(() => http.close(() => resolve()))),
      );
      const frames: Array<Record<string, unknown>> = [];
      const replies: Array<Record<string, unknown>> = [];
      impostor.on("connection", (socket) => {
        socket.on("message", (data) => {
          const frame = JSON.parse(String(data)) as Record<string, unknown>;
          frames.push(frame);
          if (frame.type === "hello") {
            socket.send(
              JSON.stringify({
                type: "helloAck",
                sidebarBootstrapVersion: CHROME_SIDEBAR_PROTOCOL_VERSION,
                authenticated: true,
              }),
            );
            socket.send(JSON.stringify({ id: 1, type: "listTabs" }));
          }
          if (frame.type === "result") replies.push(frame);
        });
      });
      const worker = runWorker(info.port, launcher);
      await vi.waitFor(() => expect(replies).toHaveLength(1), { timeout: 10_000 });
      expect(replies[0]).toMatchObject({ id: 1, ok: false });
      expect(await worker.ask()).toBeNull();
      expect(frames.some((frame) => frame.type === "sidebarBootstrap")).toBe(false);
      expect(JSON.stringify(frames)).not.toContain(info.token);
    },
    20_000,
  );

  it.skipIf(process.platform === "win32")(
    "leaves an older app on the preferred port for the bridge the native host knows",
    async () => {
      const { home, hostDir, launcher } = await installNativeHost();
      // An older installed app (no native entry, no ack) holds the stored port.
      const http = createServer();
      const older = new WebSocketServer({ server: http });
      http.listen(0, "127.0.0.1");
      await once(http, "listening");
      cleanups.push(
        () => new Promise<void>((resolve) => older.close(() => http.close(() => resolve()))),
      );
      const olderFrames: string[] = [];
      let olderConnections = 0;
      older.on("connection", (socket) => {
        olderConnections += 1;
        socket.on("message", (data) => olderFrames.push(String(data)));
      });
      const olderPort = (http.address() as { port: number }).port;

      const getChatBootstrap = vi.fn<() => Promise<typeof bootstrap>>(async () => bootstrap);
      const bridge = new ChromeBridgeServer({
        pairingFilePath: join(home, "bridge.json"),
        ports: [0],
        getChatBootstrap,
        extensionIds: CHROME_SIDEBAR_EXTENSION_IDS,
        nativeHostDir: hostDir,
      });
      cleanups.push(() => bridge.dispose());
      const info = await bridge.start();
      const connected = new Promise<void>((resolve) => bridge.onChange(resolve));
      const worker = runWorker(olderPort, launcher);
      await connected;

      await vi.waitFor(async () => expect(await worker.ask()).toEqual(bootstrap), {
        timeout: 10_000,
      });
      expect(worker.urls).toEqual([`ws://127.0.0.1:${olderPort}/`, `ws://127.0.0.1:${info.port}/`]);
      expect(olderConnections).toBe(1);
      expect(olderFrames).toEqual([]);
      expect(worker.sent.join("\n")).not.toContain(info.token);
      await expect(bridge.getConnection()!.listTabs()).resolves.toEqual([
        expect.objectContaining({ tabId: 3 }),
      ]);
    },
    20_000,
  );
});
