import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dialog, type WebContents } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { createLocalIpcHandlers } from "./localHandlers";
import { prewarmManagedLoopbackBootstrap } from "../backend/managedLoopbackBootstrapPrewarm";

vi.mock("electron", () => ({
  app: { getPath: vi.fn<() => string>(() => "/tmp"), isPackaged: false },
  clipboard: { write: vi.fn<() => Promise<void>>(async () => {}) },
  ClipboardItem: class ClipboardItem {},
  dialog: {
    showOpenDialog: vi.fn<() => Promise<never>>(),
    showSaveDialog: vi.fn<() => Promise<never>>(),
  },
  nativeImage: {
    createFromBuffer: vi.fn<() => { isEmpty(): boolean; toPNG(): Buffer }>(() => ({
      isEmpty: () => true,
      toPNG: () => Buffer.alloc(0),
    })),
  },
  shell: {
    openExternal: vi.fn<() => Promise<void>>(),
    showItemInFolder: vi.fn<() => void>(),
    openPath: vi.fn<() => Promise<string>>(),
  },
  BrowserWindow: class BrowserWindow {},
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn<(path: unknown, ...args: unknown[]) => Promise<unknown>>(
      actual.readFile as never,
    ),
    writeFile: vi.fn<(path: unknown, ...args: unknown[]) => Promise<void>>(
      actual.writeFile as never,
    ),
  };
});

let tempDir: string | undefined;
let handlers: ReturnType<typeof createLocalIpcHandlers>;

function createHandlers(
  getBrowserPanelManager: Parameters<
    typeof createLocalIpcHandlers
  >[0]["getBrowserPanelManager"] = () => null,
): ReturnType<typeof createLocalIpcHandlers> {
  return createLocalIpcHandlers({
    getMainWindow: () => ({}) as never,
    getBrowserPanelManager,
    sshConnectionManager: {
      discoverHosts: vi.fn<() => never[]>(() => []),
      connect: vi.fn<() => Promise<never>>(),
      disconnect: vi.fn<() => Promise<void>>(),
    } as never,
    requirePoracodePaths: () => resolvePoracodePaths(tempDir ?? "/tmp"),
    updatePowerSaveBlocker: vi.fn<() => void>(),
    autoUpdater: {
      initialize: vi.fn<() => void>(),
      getStatus: vi.fn<() => null>(() => null),
      checkForUpdate: vi.fn<() => Promise<void>>(),
      startUpdateDownload: vi.fn<() => Promise<void>>(),
      installUpdate: vi.fn<() => void>(),
    },
    extractBrowserToWindow: vi.fn<() => void>(),
    injectBrowserToMain: vi.fn<() => void>(),
    requestRelaunch: vi.fn<() => void>(),
    database: {
      callDatabase: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
    } as never,
    backendServices: {
      callService: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined),
    } as never,
    revertCheckpoint: vi.fn<() => Promise<never>>(),
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "poracode-local-handlers-"));
  handlers = createHandlers();
});

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("managed loopback bootstrap IPC", () => {
  it("delivers the sender's prewarmed credential through the existing handler", async () => {
    const sender = { session: {} } as WebContents;
    const bootstrap = {
      endpoint: "http://127.0.0.1:49152/",
      pairingUrl: "http://127.0.0.1:49152/#token=fixture",
    };
    prewarmManagedLoopbackBootstrap(sender, async () => bootstrap);
    await expect(
      Reflect.apply(handlers.getManagedLoopbackBootstrap, handlers, [{}, sender]),
    ).resolves.toBe(bootstrap);
  });
});

describe("attachment IPC handlers stay off the event loop", () => {
  it("leaves the loop free while a disk read is pending, then returns the bytes", async () => {
    let resolveRead: (bytes: Buffer) => void = () => {};
    vi.mocked(readFile).mockImplementationOnce(
      () =>
        new Promise<Buffer>((resolve) => {
          resolveRead = resolve;
        }) as never,
    );

    const pending: Promise<Uint8Array> = Promise.resolve(
      handlers.readLocalImageFile({ url: "poracode-local://local/tmp/image.png" }),
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    // A real timer fires while the disk promise is deferred: the handler is
    // waiting on the disk, not holding the main loop.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    const bytes = Buffer.from([1, 2, 3]);
    resolveRead(bytes);
    await expect(pending).resolves.toEqual(bytes);
  });

  it("surfaces a disk read failure from the handler", async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error("EIO: disk read failed"));

    await expect(
      handlers.readLocalImageFile({ url: "poracode-local://local/tmp/image.png" }),
    ).rejects.toThrow("EIO: disk read failed");
  });

  it("does not resolve the save handler until the write lands", async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: join(tempDir ?? "/tmp", "saved.png"),
    } as never);
    let resolveWrite: () => void = () => {};
    vi.mocked(writeFile).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }) as never,
    );

    const pending: Promise<string | null> = Promise.resolve(
      handlers.saveImageFile({ data: new Uint8Array([1]), suggestedName: "saved.png" }),
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    resolveWrite();
    await expect(pending).resolves.toBe(join(tempDir ?? "/tmp", "saved.png"));
  });

  it("surfaces a disk write failure from the save handler", async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValueOnce({
      canceled: false,
      filePath: join(tempDir ?? "/tmp", "saved.png"),
    } as never);
    vi.mocked(writeFile).mockRejectedValueOnce(new Error("ENOSPC: no space left"));

    await expect(
      handlers.saveImageFile({ data: new Uint8Array([1]), suggestedName: "saved.png" }),
    ).rejects.toThrow("ENOSPC: no space left");
  });
});

describe("browser IPC", () => {
  it("feeds a host renderer the automation-replayed snapshot", () => {
    const state = { tabs: [], activeTabId: null };
    const manager = {
      snapshotForHost: vi.fn<() => typeof state>(() => state),
      snapshot: vi.fn<() => void>(),
    };
    const local = createHandlers(() => manager as never);

    const result = Reflect.apply(local.browserGetState, local, []);

    expect(result).toBe(state);
    expect(manager.snapshotForHost).toHaveBeenCalledTimes(1);
    expect(manager.snapshot).not.toHaveBeenCalled();
  });
});
