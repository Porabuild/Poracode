import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbGetState = vi.hoisted(() => vi.fn<(key: string) => string | null>());
const dbSetState = vi.hoisted(() => vi.fn<(key: string, value: string) => void>());
const openPath = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>());
const showItemInFolder = vi.hoisted(() => vi.fn<(path: string) => void>());

vi.mock("../db", () => ({ dbGetState, dbSetState }));
vi.mock("electron", () => ({ shell: { openPath, showItemInFolder } }));

class FakeSession extends EventEmitter {
  emitDownload(item: FakeDownloadItem, webContentsId = 91): void {
    this.emit("will-download", {}, item, { id: webContentsId });
  }
}

class FakeDownloadItem extends EventEmitter {
  state: "progressing" | "completed" | "cancelled" | "interrupted" = "progressing";
  receivedBytes = 10;
  totalBytes = 100;
  paused = false;
  resumable = true;
  endTime = 0;
  savePath = "C:\\Users\\demo\\Downloads\\report.pdf";
  readonly pause = vi.fn<() => void>(() => {
    this.paused = true;
  });
  readonly resume = vi.fn<() => void>(() => {
    this.paused = false;
    this.state = "progressing";
  });
  readonly cancel = vi.fn<() => void>(() => {
    this.state = "cancelled";
  });

  getFilename(): string {
    return "report.pdf";
  }
  getURL(): string {
    return "https://example.test/report.pdf";
  }
  getMimeType(): string {
    return "application/pdf";
  }
  getState(): typeof this.state {
    return this.state;
  }
  getReceivedBytes(): number {
    return this.receivedBytes;
  }
  getTotalBytes(): number {
    return this.totalBytes;
  }
  getStartTime(): number {
    return 1_700_000_000;
  }
  getEndTime(): number {
    return this.endTime;
  }
  isPaused(): boolean {
    return this.paused;
  }
  canResume(): boolean {
    return this.resumable;
  }
  getSavePath(): string {
    return this.savePath;
  }
}

describe("BrowserDownloadManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbGetState.mockReturnValue(null);
    openPath.mockResolvedValue("");
  });

  it("subscribes once, emits renderer-safe metadata, and disposes all listeners", async () => {
    const { BrowserDownloadManager } = await import("./BrowserDownloadManager");
    const session = new FakeSession();
    const item = new FakeDownloadItem();
    const onEvent = vi.fn<(event: unknown) => void>();
    const manager = new BrowserDownloadManager(session as never, { onEvent });

    expect(session.listenerCount("will-download")).toBe(1);
    session.emitDownload(item, 17);

    const download = manager.list()[0]!;
    expect(download).toMatchObject({
      filename: "report.pdf",
      url: "https://example.test/report.pdf",
      state: "progressing",
    });
    expect(download).not.toHaveProperty("savePath");
    expect(onEvent).toHaveBeenCalledWith({
      type: "created",
      download,
      webContentsId: 17,
    });
    expect(item.listenerCount("updated")).toBe(1);
    expect(item.listenerCount("done")).toBe(1);

    manager.dispose();

    expect(session.listenerCount("will-download")).toBe(0);
    expect(item.listenerCount("updated")).toBe(0);
    expect(item.listenerCount("done")).toBe(0);
  });

  it("controls a live DownloadItem by opaque ID and tracks progress", async () => {
    const { BrowserDownloadManager } = await import("./BrowserDownloadManager");
    const session = new FakeSession();
    const item = new FakeDownloadItem();
    const manager = new BrowserDownloadManager(session as never);
    session.emitDownload(item);
    const id = manager.list()[0]!.id;

    expect(manager.pause(id)).toBe(true);
    expect(item.pause).toHaveBeenCalledOnce();
    expect(manager.list()[0]).toMatchObject({ state: "paused" });

    expect(manager.resume(id)).toBe(true);
    expect(item.resume).toHaveBeenCalledOnce();
    expect(manager.list()[0]).toMatchObject({ state: "progressing" });

    item.receivedBytes = 60;
    item.emit("updated", {}, "progressing");
    expect(manager.list()[0]).toMatchObject({ receivedBytes: 60 });

    expect(manager.cancel(id)).toBe(true);
    expect(item.cancel).toHaveBeenCalledOnce();
    expect(manager.list()[0]).toMatchObject({ state: "cancelled" });
    manager.dispose();
  });

  it("opens and reveals only completed downloads using the stored main-process path", async () => {
    const { BrowserDownloadManager } = await import("./BrowserDownloadManager");
    const session = new FakeSession();
    const item = new FakeDownloadItem();
    const manager = new BrowserDownloadManager(session as never);
    session.emitDownload(item);
    const id = manager.list()[0]!.id;

    expect(await manager.open(id)).toBe(false);
    expect(manager.reveal(id)).toBe(false);
    item.state = "completed";
    item.receivedBytes = 100;
    item.endTime = 1_700_000_010;
    item.resumable = false;
    item.emit("done", {}, "completed");

    expect(await manager.open(id)).toBe(true);
    expect(openPath).toHaveBeenCalledWith(item.savePath);
    expect(manager.reveal(id)).toBe(true);
    expect(showItemInFolder).toHaveBeenCalledWith(item.savePath);
    expect(await manager.open("missing-id")).toBe(false);
    expect(manager.reveal("missing-id")).toBe(false);
    manager.dispose();
  });

  it("persists history, marks stale in-flight entries interrupted, and never restores handles", async () => {
    dbGetState.mockReturnValue(
      JSON.stringify({
        downloads: [
          {
            id: "persisted-id",
            filename: "archive.zip",
            url: "https://example.test/archive.zip",
            mimeType: "application/zip",
            state: "progressing",
            receivedBytes: 50,
            totalBytes: 100,
            bytesPerSecond: 20,
            percentComplete: 50,
            startTime: 1_700_000_000_000,
            paused: false,
            canResume: true,
            savePath: "C:\\Users\\demo\\Downloads\\archive.zip",
            urlChain: ["https://example.test/archive.zip"],
            eTag: '"etag"',
            lastModified: "Tue, 01 Jan 2026 00:00:00 GMT",
          },
        ],
      }),
    );
    const { BrowserDownloadManager } = await import("./BrowserDownloadManager");
    const manager = new BrowserDownloadManager(new FakeSession() as never);

    expect(manager.list()).toEqual([
      expect.objectContaining({
        id: "persisted-id",
        state: "interrupted",
        canResume: false,
      }),
    ]);
    expect(manager.pause("persisted-id")).toBe(false);
    expect(manager.resume("persisted-id")).toBe(false);
    manager.dispose();
  });

  it("removes terminal history without deleting the file", async () => {
    const { BrowserDownloadManager } = await import("./BrowserDownloadManager");
    const session = new FakeSession();
    const item = new FakeDownloadItem();
    const onEvent = vi.fn<(event: unknown) => void>();
    const manager = new BrowserDownloadManager(session as never, { onEvent });
    session.emitDownload(item);
    const id = manager.list()[0]!.id;

    expect(manager.remove(id)).toBe(false);
    item.state = "completed";
    item.resumable = false;
    item.emit("done", {}, "completed");
    expect(manager.remove(id)).toBe(true);
    expect(manager.list()).toEqual([]);
    expect(onEvent).toHaveBeenLastCalledWith({ type: "removed", downloadId: id });
    expect(dbSetState).toHaveBeenLastCalledWith(
      "browser-downloads-v1",
      JSON.stringify({ downloads: [] }),
    );
    manager.dispose();
  });
});
