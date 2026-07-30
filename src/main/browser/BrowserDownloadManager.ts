import { randomUUID } from "node:crypto";
import { shell, type DownloadItem, type Session, type WebContents } from "electron";
import {
  browserDownloadStateSchema,
  type BrowserDownloadInfo,
  type BrowserDownloadState,
} from "@/shared/ipc";
import { dbGetState, dbSetState } from "../db";

const PERSIST_KEY = "browser-downloads-v1";
const PERSIST_DEBOUNCE_MS = 250;
const MAX_DOWNLOADS = 500;

export type BrowserDownloadManagerEvent =
  | { type: "created"; download: BrowserDownloadInfo; webContentsId: number }
  | { type: "updated"; download: BrowserDownloadInfo }
  | { type: "removed"; downloadId: string };

export interface BrowserDownloadManagerOptions {
  onEvent?(event: BrowserDownloadManagerEvent): void;
}

interface BrowserDownloadRecord extends BrowserDownloadInfo {
  savePath: string;
}

interface LiveDownload {
  item: DownloadItem;
  cleanup(): void;
}

interface PersistedBrowserDownloads {
  downloads: BrowserDownloadRecord[];
}

/**
 * Owns downloads initiated by the embedded browser session. Callers operate on
 * opaque IDs; paths and Electron DownloadItem instances never leave main.
 */
export class BrowserDownloadManager {
  private readonly records = new Map<string, BrowserDownloadRecord>();
  private readonly liveItems = new Map<string, LiveDownload>();
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private readonly onWillDownload = (
    _event: Electron.Event,
    item: DownloadItem,
    webContents: WebContents,
  ): void => {
    if (this.disposed) return;
    const id = randomUUID();
    const record = recordFromItem(id, item);
    this.records.set(id, record);
    this.bindItem(id, item);
    this.prune();
    this.persistNow();
    this.emit({ type: "created", download: toInfo(record), webContentsId: webContents.id });
  };

  constructor(
    private readonly session: Session,
    private readonly options: BrowserDownloadManagerOptions = {},
  ) {
    this.load();
    this.session.on("will-download", this.onWillDownload);
  }

  list(): BrowserDownloadInfo[] {
    return this.sortedRecords().map(toInfo);
  }

  pause(downloadId: string): boolean {
    const item = this.liveItems.get(downloadId)?.item;
    const record = this.records.get(downloadId);
    if (!item || !record || record.state !== "progressing" || item.isPaused()) return false;
    item.pause();
    this.updateRecord(downloadId, item, "paused");
    return true;
  }

  resume(downloadId: string): boolean {
    const item = this.liveItems.get(downloadId)?.item;
    const record = this.records.get(downloadId);
    if (!item || !record || !item.canResume()) return false;
    if (
      record.state !== "paused" &&
      record.state !== "interrupted" &&
      record.state !== "cancelled"
    ) {
      return false;
    }
    item.resume();
    this.updateRecord(downloadId, item, "progressing");
    return true;
  }

  cancel(downloadId: string): boolean {
    const item = this.liveItems.get(downloadId)?.item;
    const record = this.records.get(downloadId);
    if (!item || !record || isTerminal(record.state)) return false;
    item.cancel();
    this.updateRecord(downloadId, item, "cancelled", Date.now());
    return true;
  }

  /** Removes history only; the downloaded file is not deleted. */
  remove(downloadId: string): boolean {
    const record = this.records.get(downloadId);
    if (!record || !isTerminal(record.state)) return false;
    this.cleanupItem(downloadId);
    this.records.delete(downloadId);
    this.persistNow();
    this.emit({ type: "removed", downloadId });
    return true;
  }

  async open(downloadId: string): Promise<boolean> {
    const record = this.records.get(downloadId);
    if (!record || record.state !== "completed" || !record.savePath) return false;
    try {
      return (await shell.openPath(record.savePath)) === "";
    } catch {
      return false;
    }
  }

  reveal(downloadId: string): boolean {
    const record = this.records.get(downloadId);
    if (!record || record.state !== "completed" || !record.savePath) return false;
    try {
      shell.showItemInFolder(record.savePath);
      return true;
    } catch {
      return false;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.removeListener("will-download", this.onWillDownload);
    for (const live of this.liveItems.values()) live.cleanup();
    this.liveItems.clear();
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.persistNow();
    }
  }

  private bindItem(id: string, item: DownloadItem): void {
    const onUpdated = (_event: Electron.Event, state: "progressing" | "interrupted"): void => {
      this.updateRecord(id, item, state === "progressing" && item.isPaused() ? "paused" : state);
    };
    const onDone = (
      _event: Electron.Event,
      state: "completed" | "cancelled" | "interrupted",
    ): void => {
      const endTime = item.getEndTime();
      this.updateRecord(id, item, state, endTime > 0 ? secondsToMilliseconds(endTime) : Date.now());
      if (state === "completed" || !item.canResume()) this.cleanupItem(id);
      this.persistNow();
    };
    item.on("updated", onUpdated);
    item.on("done", onDone);
    this.liveItems.set(id, {
      item,
      cleanup: () => {
        item.removeListener("updated", onUpdated);
        item.removeListener("done", onDone);
      },
    });
  }

  private cleanupItem(id: string): void {
    this.liveItems.get(id)?.cleanup();
    this.liveItems.delete(id);
  }

  private updateRecord(
    id: string,
    item: DownloadItem,
    state: BrowserDownloadState,
    endTime?: number,
  ): void {
    const previous = this.records.get(id);
    if (!previous) return;
    const next = recordFromItem(id, item, state, previous.startTime, endTime);
    this.records.set(id, next);
    this.schedulePersist();
    this.emit({ type: "updated", download: toInfo(next) });
  }

  private load(): void {
    try {
      const raw = dbGetState(PERSIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedBrowserDownloads;
      if (!parsed || !Array.isArray(parsed.downloads)) return;
      for (const candidate of parsed.downloads) {
        if (!isBrowserDownloadRecord(candidate)) continue;
        // DownloadItem handles are session-local. In-flight records remain as
        // history after restart but cannot claim resumability without a handle.
        const staleInFlight = candidate.state === "progressing" || candidate.state === "paused";
        this.records.set(candidate.id, {
          ...toInfo(candidate),
          ...(staleInFlight ? { state: "interrupted" as const } : {}),
          canResume: false,
          savePath: candidate.savePath,
        });
      }
      this.prune();
    } catch {}
  }

  private prune(): void {
    if (this.records.size <= MAX_DOWNLOADS) return;
    for (const record of [...this.records.values()].sort((a, b) => a.startTime - b.startTime)) {
      if (this.records.size <= MAX_DOWNLOADS) break;
      if (this.liveItems.has(record.id)) continue;
      this.records.delete(record.id);
    }
  }

  private sortedRecords(): BrowserDownloadRecord[] {
    return [...this.records.values()].sort((a, b) => b.startTime - a.startTime);
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  private persistNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      dbSetState(PERSIST_KEY, JSON.stringify({ downloads: this.sortedRecords() }));
    } catch {}
  }

  private emit(event: BrowserDownloadManagerEvent): void {
    try {
      this.options.onEvent?.(event);
    } catch {}
  }
}

function recordFromItem(
  id: string,
  item: DownloadItem,
  state: BrowserDownloadState = normalizeItemState(item),
  startTime: number = secondsToMilliseconds(item.getStartTime()),
  endTime?: number,
): BrowserDownloadRecord {
  const totalBytes = Math.max(0, item.getTotalBytes());
  const receivedBytes = Math.max(0, item.getReceivedBytes());
  return {
    id,
    filename: item.getFilename(),
    url: item.getURL(),
    mimeType: item.getMimeType(),
    state,
    receivedBytes,
    totalBytes,
    startTime: startTime > 0 ? startTime : Date.now(),
    ...(endTime !== undefined ? { endTime } : {}),
    canResume: item.canResume(),
    savePath: item.getSavePath(),
  };
}

function normalizeItemState(item: DownloadItem): BrowserDownloadState {
  const state = item.getState();
  return state === "progressing" && item.isPaused() ? "paused" : state;
}

function secondsToMilliseconds(value: number): number {
  return Math.round(value * 1000);
}

function isTerminal(state: BrowserDownloadState): boolean {
  return state === "completed" || state === "cancelled" || state === "interrupted";
}

function toInfo(record: BrowserDownloadRecord): BrowserDownloadInfo {
  return {
    id: record.id,
    filename: record.filename,
    url: record.url,
    mimeType: record.mimeType,
    state: record.state,
    receivedBytes: record.receivedBytes,
    totalBytes: record.totalBytes,
    startTime: record.startTime,
    ...(record.endTime !== undefined ? { endTime: record.endTime } : {}),
    canResume: record.canResume,
  };
}

function isBrowserDownloadRecord(value: unknown): value is BrowserDownloadRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<BrowserDownloadRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.filename === "string" &&
    typeof record.url === "string" &&
    typeof record.mimeType === "string" &&
    browserDownloadStateSchema.safeParse(record.state).success &&
    typeof record.receivedBytes === "number" &&
    typeof record.totalBytes === "number" &&
    typeof record.startTime === "number" &&
    typeof record.canResume === "boolean" &&
    typeof record.savePath === "string"
  );
}
