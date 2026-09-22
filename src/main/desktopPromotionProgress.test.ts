import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<void>>(),
  execute: vi.fn<() => Promise<void>>(),
  destroyed: false,
  urls: [] as string[],
  options: [] as Array<{ title?: string }>,
}));
vi.mock("electron", () => ({
  BrowserWindow: class {
    constructor(options: { title?: string }) {
      state.options.push(options);
    }
    loadURL(url: string): Promise<void> {
      state.urls.push(url);
      return state.load();
    }
    webContents = { executeJavaScript: state.execute };
    isDestroyed(): boolean {
      return state.destroyed;
    }
    destroy(): void {
      state.destroyed = true;
    }
  },
}));
import { SUPPORTED_LOCALES } from "@/shared/locale";
import {
  openDesktopPromotionProgress,
  PROMOTION_PROGRESS_THRESHOLD_BYTES,
} from "./desktopPromotionProgress";
import { promotionProgressStringsFor } from "./i18n/promotionProgressLocale";

beforeEach(() => {
  state.destroyed = false;
  state.urls.length = 0;
  state.options.length = 0;
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

  it("stops delivering updates after a late close", async () => {
    const progress = openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES)!;
    progress.update(100, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    await vi.waitFor(() => expect(state.execute).toHaveBeenCalledOnce());
    progress.close();
    progress.update(200, PROMOTION_PROGRESS_THRESHOLD_BYTES);
    await Promise.resolve();
    await Promise.resolve();
    expect(state.execute).toHaveBeenCalledOnce();
  });

  it("does not open a window below the promotion threshold", () => {
    expect(openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES - 1)).toBeUndefined();
    expect(state.options).toHaveLength(0);
    expect(state.urls).toHaveLength(0);
  });

  it.each(SUPPORTED_LOCALES)("renders the %s catalog translation", (locale) => {
    const strings = promotionProgressStringsFor(locale);
    openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES, strings);
    expect(state.options[0]?.title).toBe(strings.title);
    expect(decodeURIComponent(state.urls[0] ?? "")).toContain(strings.body);
  });

  it("escapes translated html text before interpolation", () => {
    openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES, {
      title: "Promotion",
      body: `<b>bold</b> & "quoted" 'apostrophe'`,
    });
    const document = decodeURIComponent(state.urls[0] ?? "");
    expect(document).toContain(
      "&lt;b&gt;bold&lt;/b&gt; &amp; &quot;quoted&quot; &#39;apostrophe&#39;",
    );
    expect(document).not.toContain("<b>bold</b>");
  });

  it("keeps the default English strings when no locale strings are passed", () => {
    openDesktopPromotionProgress(PROMOTION_PROGRESS_THRESHOLD_BYTES);
    expect(state.options[0]?.title).toBe(promotionProgressStringsFor("en").title);
    expect(decodeURIComponent(state.urls[0] ?? "")).toContain(
      promotionProgressStringsFor("en").body,
    );
  });
});
