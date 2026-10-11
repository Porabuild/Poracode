import { beforeEach, describe, expect, it } from "vitest";

const state = new Map<string, string>();
const stateStore = {
  get: (key: string) => state.get(key) ?? null,
  set: (key: string, value: string) => state.set(key, value),
};

import { BrowserBookmarkStore } from "./browserBookmarks";

describe("BrowserBookmarkStore", () => {
  beforeEach(() => state.clear());

  it("adds and dedupes by url", () => {
    const s = new BrowserBookmarkStore(stateStore);
    s.add({ url: "https://a.com/", title: "A", createdAt: 1 });
    s.add({ url: "https://a.com/", title: "A again", createdAt: 2 });
    expect(s.list()).toHaveLength(1);
    expect(s.list()[0]?.title).toBe("A");
  });

  it("ignores non-http(s) urls", () => {
    const s = new BrowserBookmarkStore(stateStore);
    s.add({ url: "about:blank", title: "x", createdAt: 1 });
    expect(s.list()).toHaveLength(0);
  });

  it("removes by url", () => {
    const s = new BrowserBookmarkStore(stateStore);
    s.add({ url: "https://a.com/", title: "A", createdAt: 1 });
    s.remove("https://a.com/");
    expect(s.list()).toHaveLength(0);
  });

  it("persists across instances", () => {
    const s = new BrowserBookmarkStore(stateStore);
    s.add({ url: "https://a.com/", title: "A", createdAt: 1 });
    expect(new BrowserBookmarkStore(stateStore).list()).toHaveLength(1);
  });

  it("toggles and persists bar visibility", () => {
    const s = new BrowserBookmarkStore(stateStore);
    expect(s.isBarVisible()).toBe(false);
    s.setBarVisible(true);
    expect(s.isBarVisible()).toBe(true);
    expect(new BrowserBookmarkStore(stateStore).isBarVisible()).toBe(true);
  });
});
