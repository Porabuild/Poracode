import { afterEach, describe, expect, it, vi } from "vitest";
import { TURN_CLIENT_CONTEXT_URL_MAX_LENGTH, turnClientContextSchema } from "@/shared/contracts";
import { createBrowserFocusCapture, type BrowserTabsApi } from "./browserFocusContext";

interface FakeTab {
  readonly id?: number;
  readonly windowId: number;
  readonly active: boolean;
  readonly title?: string;
  readonly url?: string;
}

/** Two browser windows; the side panel lives in `sidebarWindowId`. */
function fakeBrowser(tabs: FakeTab[], sidebarWindowId: number) {
  const query = vi.fn<BrowserTabsApi["tabs"]["query"]>(async (info) =>
    tabs.filter((tab) => tab.active === info.active && tab.windowId === info.windowId),
  );
  const api: BrowserTabsApi = {
    windows: {
      getCurrent: vi.fn<BrowserTabsApi["windows"]["getCurrent"]>(async () => ({
        id: sidebarWindowId,
      })),
    },
    tabs: { query },
  };
  return { api, query };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createBrowserFocusCapture", () => {
  it("reads the active tab of the sidebar's own window, not another focused window", async () => {
    const { api, query } = fakeBrowser(
      [
        { id: 10, windowId: 1, active: true, title: "Other window", url: "https://other.test/" },
        { id: 20, windowId: 2, active: true, title: "Sidebar window", url: "https://mine.test/a" },
        { id: 21, windowId: 2, active: false, title: "Background", url: "https://bg.test/" },
      ],
      2,
    );
    const capture = createBrowserFocusCapture(api);

    await expect(capture()).resolves.toEqual({
      browserFocus: {
        activeTab: { tabId: 20, title: "Sidebar window", url: "https://mine.test/a" },
      },
    });
    expect(query).toHaveBeenCalledWith({ active: true, windowId: 2 });
    expect(query.mock.calls.flat()).not.toContainEqual(
      expect.objectContaining({ lastFocusedWindow: true }),
    );
  });

  it("captures at call time, so each send sees the tab active then", async () => {
    const tabs: FakeTab[] = [{ id: 1, windowId: 3, active: true, title: "First" }];
    const { api } = fakeBrowser(tabs, 3);
    const capture = createBrowserFocusCapture(api);
    const first = await capture();
    tabs[0] = { id: 1, windowId: 3, active: false, title: "First" };
    tabs.push({ id: 2, windowId: 3, active: true, title: "Second" });
    const second = await capture();
    expect(first?.browserFocus?.activeTab?.tabId).toBe(1);
    expect(second?.browserFocus?.activeTab?.tabId).toBe(2);
  });

  it("bounds and sanitizes page metadata before it leaves the browser", async () => {
    const { api } = fakeBrowser(
      [
        {
          id: 5,
          windowId: 1,
          active: true,
          title: `Line\none\u0007${"t".repeat(400)}`,
          url: `https://user:secret@site.test/path?token=${"q".repeat(3000)}#frag`,
        },
      ],
      1,
    );
    const context = await createBrowserFocusCapture(api)();
    const tab = context!.browserFocus!.activeTab!;
    expect(tab.title).not.toContain("\n");
    expect(tab.title).not.toContain("\u0007");
    expect(tab.title!.length).toBe(300);
    expect(tab.url).toBe("https://site.test/path");
    expect(turnClientContextSchema.safeParse(context).success).toBe(true);
  });

  it.each([
    ["an OAuth fragment", "https://app.test/cb#access_token=ya29.secret&token_type=Bearer"],
    ["a presigned query", "https://bucket.test/o.pdf?X-Amz-Credential=AK&X-Amz-Signature=sig"],
    ["a magic-link token", "https://user:pw@app.test/login?token=reset-code"],
  ])("keeps only the origin and path of a URL with %s", async (_label, url) => {
    const { api } = fakeBrowser([{ id: 7, windowId: 1, active: true, url }], 1);
    const tab = (await createBrowserFocusCapture(api)())!.browserFocus!.activeTab!;
    expect(tab.url).toMatch(/^https:\/\/[a-z.]+\.test\/[a-z./]*$/);
    expect(tab.url).not.toMatch(/secret|sig|reset-code|pw|token/);
  });

  it("keeps a path at the limit and falls back to its origin when it overflows", async () => {
    const origin = "https://site.test";
    const atLimit = `${origin}/${"x".repeat(TURN_CLIENT_CONTEXT_URL_MAX_LENGTH - origin.length - 1)}`;
    for (const [url, expected] of [
      [atLimit, atLimit],
      [`${atLimit}x`, origin],
    ]) {
      const { api } = fakeBrowser([{ id: 7, windowId: 1, active: true, url: url! }], 1);
      const context = await createBrowserFocusCapture(api)();
      expect(context!.browserFocus!.activeTab!.url).toBe(expected);
      expect(turnClientContextSchema.safeParse(context).success).toBe(true);
    }
  });

  it("strips C1, line/paragraph separator and bidi characters from titles", async () => {
    const { api } = fakeBrowser(
      [{ id: 8, windowId: 1, active: true, title: "a\u0085b\u2028c\u2029d\u202ee\u2067f\u200fg" }],
      1,
    );
    const tab = (await createBrowserFocusCapture(api)())!.browserFocus!.activeTab!;
    expect(tab.title).toBe("a b c d e f g");
  });

  it("omits non-web URLs and unusable tab ids but still reports browser focus", async () => {
    for (const url of ["data:image/png;base64,AAAA", "file:///Users/me/Documents/tax.pdf"]) {
      const browser = fakeBrowser([{ id: 6, windowId: 1, active: true, title: "Img", url }], 1);
      await expect(createBrowserFocusCapture(browser.api)()).resolves.toEqual({
        browserFocus: { activeTab: { tabId: 6, title: "Img" } },
      });
    }
    const noId = fakeBrowser([{ id: -1, windowId: 1, active: true, title: "x" }], 1);
    await expect(createBrowserFocusCapture(noId.api)()).resolves.toEqual({ browserFocus: {} });
  });

  it("reports focus without a tab when the browser rejects", async () => {
    const api: BrowserTabsApi = {
      windows: { getCurrent: async () => Promise.reject(new Error("no window")) },
      tabs: { query: async () => [] },
    };
    await expect(createBrowserFocusCapture(api)()).resolves.toEqual({ browserFocus: {} });
  });

  it("never blocks a send longer than the timeout when the worker or browser hangs", async () => {
    vi.useFakeTimers();
    const api: BrowserTabsApi = {
      windows: { getCurrent: () => new Promise(() => {}) },
      tabs: { query: async () => [] },
    };
    const pending = createBrowserFocusCapture(api, 250)();
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toEqual({ browserFocus: {} });
  });

  it("still reports browser focus when the extension API is missing entirely", async () => {
    const globals = globalThis as { chrome?: unknown };
    const original = globals.chrome;
    try {
      delete globals.chrome;
      await expect(createBrowserFocusCapture()()).resolves.toEqual({ browserFocus: {} });
      // A page without the tabs/windows namespaces (plain `?surface=chat-sidebar`).
      globals.chrome = { runtime: {} };
      await expect(createBrowserFocusCapture()()).resolves.toEqual({ browserFocus: {} });
    } finally {
      if (original === undefined) delete globals.chrome;
      else globals.chrome = original;
    }
  });
});
