import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<void>>(),
  execute: vi.fn<() => Promise<void>>(),
  destroyed: false,
}));
vi.mock("electron", () => ({
  BrowserWindow: class {
    loadURL = state.load;
    webContents = { executeJavaScript: state.execute };
    isDestroyed() {
      return state.destroyed;
    }
    destroy() {
      state.destroyed = true;
    }
  },
}));
import {
  openDesktopPromotionProgress,
  PROMOTION_PROGRESS_THRESHOLD_BYTES,
} from "./desktopPromotionProgress";

beforeEach(() => {
  state.destroyed = false;
  state.load.mockReset().mockResolvedValue();
  state.execute.mockReset().mockResolvedValue();
});

describe("promotion progress lifecycle", () => {
  it("waits for the document before delivering copy progress", async () => {
    let loaded!: () => void;
    state.load.mockReturnValue(
      new Promise<void>((resolve) => {
        loaded = resolve;
      }),
    );
    const progress = openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES)!;
    progress.update(100, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    expect(state.execute).not.toHaveBeenCalled();
    loaded();
    await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
  });

  it("drops pending updates after the copy closes the window", async () => {
    const progress = openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES)!;
    progress.update(100, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    progress.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("tolerates load and update failures without rejecting the copy", async () => {
    state.load.mockRejectedValueOnce(new Error("window closed during load"));
    const first = openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES)!;
    first.update(100, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.execute).not.toHaveBeenCalled();
    state.execute.mockRejectedValueOnce(new Error("window closed during update"));
    const second = openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES)!;
    second.update(100, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
  });
});
