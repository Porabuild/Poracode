import { beforeEach, describe, expect, it } from "vitest";
import type { BrowserDownloadInfo } from "@/shared/ipc";
import { useBrowserDownloadsStore } from "./browserDownloadsStore";

const olderDownload: BrowserDownloadInfo = {
  id: "older",
  filename: "older.zip",
  url: "https://example.test/older.zip",
  mimeType: "application/zip",
  state: "progressing",
  receivedBytes: 10,
  totalBytes: 100,
  startTime: 1,
  canResume: true,
};

const newerDownload: BrowserDownloadInfo = {
  ...olderDownload,
  id: "newer",
  filename: "newer.zip",
  startTime: 2,
};

describe("browserDownloadsStore", () => {
  beforeEach(() => useBrowserDownloadsStore.getState().setDownloads([]));

  it("inserts downloads in newest-first order and replaces updates in place", () => {
    const store = useBrowserDownloadsStore.getState();
    store.upsertDownload(olderDownload);
    store.upsertDownload(newerDownload);
    store.upsertDownload({ ...olderDownload, state: "paused", receivedBytes: 50 });

    expect(useBrowserDownloadsStore.getState().downloads).toEqual([
      newerDownload,
      { ...olderDownload, state: "paused", receivedBytes: 50 },
    ]);
  });

  it("removes a download by id", () => {
    const store = useBrowserDownloadsStore.getState();
    store.setDownloads([newerDownload, olderDownload]);
    store.removeDownload(newerDownload.id);

    expect(useBrowserDownloadsStore.getState().downloads).toEqual([olderDownload]);
  });
});
