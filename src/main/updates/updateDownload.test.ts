import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS,
  UPDATE_DOWNLOAD_PROGRESS_STALL_MS,
  UpdateDownloadStallError,
  createDownloadStallWatch,
  downloadUpdateWithStallFallback,
  type UpdaterCancelToken,
} from "./updateDownload";

function createTestToken(): UpdaterCancelToken & { cancelled: boolean } {
  const token = {
    cancelled: false,
    cancel() {
      token.cancelled = true;
    },
  };
  return token;
}

describe("createDownloadStallWatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cancels when the first progress event never arrives", () => {
    const watch = createDownloadStallWatch();
    const token = createTestToken();
    watch.start(token);

    vi.advanceTimersByTime(UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS - 1);
    expect(token.cancelled).toBe(false);

    vi.advanceTimersByTime(1_000);
    expect(token.cancelled).toBe(true);
    expect(watch.stalled).toBe(true);
    watch.stop();
  });

  it("uses the longer window after progress has started", () => {
    const watch = createDownloadStallWatch();
    const token = createTestToken();
    watch.start(token);
    watch.markProgress();

    vi.advanceTimersByTime(UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS + 5_000);
    expect(token.cancelled).toBe(false);

    vi.advanceTimersByTime(UPDATE_DOWNLOAD_PROGRESS_STALL_MS);
    expect(token.cancelled).toBe(true);
    watch.stop();
  });
});

describe("downloadUpdateWithStallFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the differential path when the download finishes", async () => {
    const setDifferentialDisabled = vi.fn<(disabled: boolean) => void>();
    await downloadUpdateWithStallFallback(async () => undefined, setDifferentialDisabled, {
      createToken: createTestToken,
    });

    expect(setDifferentialDisabled).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("retries as a full download after a differential stall", async () => {
    const setDifferentialDisabled = vi.fn<(disabled: boolean) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tokens: Array<UpdaterCancelToken & { cancelled: boolean }> = [];
    const downloadUpdate = vi.fn<(token: UpdaterCancelToken) => Promise<void>>(async (token) => {
      if (setDifferentialDisabled.mock.calls.at(-1)?.[0] === true) return;
      await new Promise<void>((_resolve, reject) => {
        const original = token.cancel.bind(token);
        token.cancel = () => {
          original();
          reject(new Error("cancelled"));
        };
      });
    });

    const running = downloadUpdateWithStallFallback(downloadUpdate, setDifferentialDisabled, {
      createToken: () => {
        const token = createTestToken();
        tokens.push(token);
        return token;
      },
    });

    await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS + 1_000);
    await running;

    expect(downloadUpdate).toHaveBeenCalledTimes(2);
    expect(setDifferentialDisabled.mock.calls).toEqual([[false], [true], [false]]);
    expect(tokens[0]?.cancelled).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      "[poracode] updater differential download stalled; retrying as a full download.",
    );
    warn.mockRestore();
  });

  it("surfaces a timeout when the full-download fallback also stalls", async () => {
    const downloadUpdate = vi.fn<(token: UpdaterCancelToken) => Promise<void>>(async (token) => {
      await new Promise<void>((_resolve, reject) => {
        const original = token.cancel.bind(token);
        token.cancel = () => {
          original();
          reject(new Error("cancelled"));
        };
      });
    });

    const running = downloadUpdateWithStallFallback(downloadUpdate, () => {}, {
      createToken: createTestToken,
    });
    const outcome = running.then(
      () => {
        throw new Error("expected the full-download fallback to stall");
      },
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS + 1_000);
    await vi.advanceTimersByTimeAsync(UPDATE_DOWNLOAD_FIRST_PROGRESS_STALL_MS + 1_000);
    await expect(outcome).resolves.toBeInstanceOf(UpdateDownloadStallError);
    expect(downloadUpdate).toHaveBeenCalledTimes(2);
  });
});
