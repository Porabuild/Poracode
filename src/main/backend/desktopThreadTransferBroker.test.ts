import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { IPC_EVENT_CHANNELS } from "@/shared/ipc";
import { requestDesktopThreadTransfer } from "./desktopThreadTransferBroker";
import { requestDesktopExperiment, requestDesktopMemorySync } from "./desktopActionBroker";

const ports = vi.hoisted(() => ({
  host: undefined as (EventEmitter & { start(): void; close(): void }) | undefined,
  renderer: undefined as (EventEmitter & { close(): void }) | undefined,
}));

vi.mock("electron", () => ({
  MessageChannelMain: class {
    port1 = Object.assign(new EventEmitter(), {
      start: () => undefined,
      close: () => this.port1.emit("close"),
      postMessage: (message: unknown) => this.port2.emit("message", message),
    });
    port2 = Object.assign(new EventEmitter(), {
      close: () => this.port1.emit("close"),
    });
    constructor() {
      ports.host = this.port1;
      ports.renderer = this.port2;
    }
  },
}));

const request = { version: 1, input: { action: "destinations", threadId: "thread" } } as const;
const result = { action: "destinations", destinations: [] } as const;

function mainWindow() {
  const postMessage = vi.fn<(channel: string, data: unknown, transfer: unknown[]) => void>();
  const contents = Object.assign(new EventEmitter(), {
    isLoadingMainFrame: () => false,
    postMessage,
  });
  const window = { isDestroyed: () => false, webContents: contents } as unknown as BrowserWindow;
  return { window, postMessage, contents };
}

afterEach(() => vi.useRealTimers());

it("sends a versioned request on a private port and validates the reply", async () => {
  const { window, postMessage, contents } = mainWindow();
  const pending = requestDesktopThreadTransfer(window, request);
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    IPC_EVENT_CHANNELS.appThreadTransfer,
    request,
    [ports.renderer],
  );
  const start = vi.fn<(message: unknown) => void>();
  ports.renderer?.on("message", start);
  ports.host?.emit("message", { data: { version: 1, type: "attached" } });
  expect(start).not.toHaveBeenCalled();
  ports.host?.emit("message", { data: { version: 1, type: "accepted" } });
  expect(start).toHaveBeenCalledExactlyOnceWith({ version: 1, type: "start" });
  ports.host?.emit("message", { data: { version: 1, type: "result", result } });
  await expect(pending).resolves.toEqual(result);
  expect(contents.listenerCount("destroyed")).toBe(0);
});

it("rejects when the desktop renderer closes before confirming the transfer", async () => {
  const { window } = mainWindow();
  const pending = requestDesktopThreadTransfer(window, request);
  ports.host?.emit("message", { data: { version: 1, type: "accepted" } });
  ports.renderer?.close();
  await expect(pending).rejects.toThrow("disconnected");
});

it("bounds an old or unready desktop with no transfer listener", async () => {
  vi.useFakeTimers();
  const { window } = mainWindow();
  const pending = requestDesktopThreadTransfer(window, request);
  await vi.advanceTimersByTimeAsync(3_000);
  await expect(pending).resolves.toMatchObject({ type: "not-started" });
});

it("admits a memory sync on its own port and returns only the result summary", async () => {
  const { window, postMessage } = mainWindow();
  const pending = requestDesktopMemorySync(window, { version: 1 });
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    IPC_EVENT_CHANNELS.appMemorySync,
    { version: 1 },
    [ports.renderer],
  );
  const start = vi.fn<(message: unknown) => void>();
  ports.renderer?.on("message", start);
  ports.host?.emit("message", { data: { version: 1, type: "attached" } });
  expect(start).not.toHaveBeenCalled();
  ports.host?.emit("message", { data: { version: 1, type: "accepted" } });
  expect(start).toHaveBeenCalledExactlyOnceWith({ version: 1, type: "start" });
  ports.host?.emit("message", {
    data: { version: 1, type: "result", result: { syncedHosts: 2, changed: true } },
  });
  await expect(pending).resolves.toEqual({ syncedHosts: 2, changed: true });
});

it("refuses a missing memory sync desktop and times out an older renderer before admission", async () => {
  await expect(requestDesktopMemorySync(null, { version: 1 })).resolves.toMatchObject({
    type: "not-started",
  });
  vi.useFakeTimers();
  const { window } = mainWindow();
  const pending = requestDesktopMemorySync(window, { version: 1 });
  await vi.advanceTimersByTimeAsync(3_000);
  await expect(pending).resolves.toMatchObject({ type: "not-started" });
});

it("admits an experiment only on its dedicated desktop action channel", async () => {
  const { window, postMessage } = mainWindow();
  const experimentRequest = {
    version: 1,
    experimentId: "comparison",
    input: {
      action: "judge",
      experimentId: "comparison",
      revision: "current",
      operationKey: "judge-example",
    },
  } as const;
  const pending = requestDesktopExperiment(window, experimentRequest);
  expect(postMessage).toHaveBeenCalledExactlyOnceWith(
    IPC_EVENT_CHANNELS.appExperiment,
    experimentRequest,
    [ports.renderer],
  );
  ports.host?.emit("message", { data: { version: 1, type: "accepted" } });
  const outcome = { ok: true, experimentId: experimentRequest.experimentId };
  ports.host?.emit("message", { data: { version: 1, type: "result", result: outcome } });
  await expect(pending).resolves.toEqual(outcome);
});
