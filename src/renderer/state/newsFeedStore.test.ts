import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS_FEED_URL, NEWS_FEED_VERSION } from "@/shared/newsFeed";
import {
  NEWS_FEED_CACHE_KEY,
  NEWS_FEED_REFRESH_MS,
  NEWS_FEED_RETRY_MS,
  useNewsFeedStore,
} from "./newsFeedStore";

const item = { id: "hello", kind: "announcement", text: { en: "Hello" } };

function respond(body: unknown, ok = true) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response),
  );
}

describe("newsFeedStore", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers({ now, toFake: ["Date"] });
    localStorage.clear();
    useNewsFeedStore.setState({ feed: null, fetchedAt: 0, failedAt: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("fetches anonymously, then caches the raw document with its time", async () => {
    const fetchMock = respond({ version: NEWS_FEED_VERSION, items: [item] });
    vi.stubGlobal("fetch", fetchMock);

    await useNewsFeedStore.getState().refresh();

    expect(fetchMock).toHaveBeenCalledWith(NEWS_FEED_URL, { credentials: "omit" });
    expect(useNewsFeedStore.getState().feed?.items.map((entry) => entry.id)).toEqual(["hello"]);
    expect(JSON.parse(localStorage.getItem(NEWS_FEED_CACHE_KEY) ?? "{}")).toMatchObject({
      fetchedAt: now,
      feed: { version: NEWS_FEED_VERSION },
    });
  });

  it("refreshes at most every few hours after a success", async () => {
    const fetchMock = respond({ version: NEWS_FEED_VERSION, items: [item] });
    vi.stubGlobal("fetch", fetchMock);
    useNewsFeedStore.setState({ fetchedAt: now - NEWS_FEED_REFRESH_MS + 1 });

    await useNewsFeedStore.getState().refresh();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.setSystemTime(now + 1);
    await useNewsFeedStore.getState().refresh();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps the cached feed and backs off when the server is down or speaks a newer version", async () => {
    const cached = { paused: false, items: [] };
    useNewsFeedStore.setState({ feed: cached, fetchedAt: 0 });

    for (const fetchMock of [
      respond({}, false),
      respond({ version: NEWS_FEED_VERSION + 1, items: [item] }),
      vi.fn<typeof fetch>(() => Promise.reject(new Error("offline"))),
    ]) {
      useNewsFeedStore.setState({ failedAt: 0 });
      vi.stubGlobal("fetch", fetchMock);
      await useNewsFeedStore.getState().refresh();
      expect(useNewsFeedStore.getState().feed).toBe(cached);
      expect(useNewsFeedStore.getState().failedAt).toBe(now);

      await useNewsFeedStore.getState().refresh();
      expect(fetchMock).toHaveBeenCalledOnce();
    }

    vi.setSystemTime(now + NEWS_FEED_RETRY_MS);
    const recovered = respond({ version: NEWS_FEED_VERSION, items: [item] });
    vi.stubGlobal("fetch", recovered);
    await useNewsFeedStore.getState().refresh();
    expect(recovered).toHaveBeenCalledOnce();
    expect(useNewsFeedStore.getState().feed?.items).toHaveLength(1);
  });

  it("shares one request between concurrent refreshes", async () => {
    const fetchMock = respond({ version: NEWS_FEED_VERSION, items: [item] });
    vi.stubGlobal("fetch", fetchMock);
    await Promise.all([
      useNewsFeedStore.getState().refresh(),
      useNewsFeedStore.getState().refresh({ force: true }),
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("re-validates the cache on load and never trusts a future timestamp", async () => {
    localStorage.setItem(
      NEWS_FEED_CACHE_KEY,
      JSON.stringify({
        fetchedAt: now + 365 * 24 * 60 * 60_000,
        feed: { version: NEWS_FEED_VERSION, items: [item, { id: "Bad Id" }] },
      }),
    );
    vi.resetModules();
    const { useNewsFeedStore: fresh } = await import("./newsFeedStore");
    expect(fresh.getState().fetchedAt).toBe(now);
    expect(fresh.getState().feed?.items.map((entry) => entry.id)).toEqual(["hello"]);
  });
});
