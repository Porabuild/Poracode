import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = new Map<string, string>();
vi.mock("../db", () => ({
  dbGetState: (k: string) => state.get(k) ?? null,
  dbSetState: (k: string, v: string) => {
    state.set(k, v);
  },
}));

import { BrowserHistoryStore, fetchSearchSuggestions } from "./browserHistory";

describe("BrowserHistoryStore", () => {
  beforeEach(() => state.clear());

  it("ranks frequent prefix matches first", () => {
    const h = new BrowserHistoryStore();
    h.record("https://github.com/", "GitHub", 1000);
    h.record("https://github.com/", "GitHub", 2000);
    h.record("https://example.com/gh", "Example GH", 1500);
    expect(h.query("git", 5)[0]?.url).toBe("https://github.com/");
  });

  it("dedupes by url and keeps the latest title", () => {
    const h = new BrowserHistoryStore();
    h.record("https://a.com/", "A", 1);
    h.record("https://a.com/", "A2", 2);
    const res = h.query("a.com", 5);
    expect(res).toHaveLength(1);
    expect(res[0]?.title).toBe("A2");
  });

  it("matches both title and url substrings", () => {
    const h = new BrowserHistoryStore();
    h.record("https://news.ycombinator.com/", "Hacker News", 1);
    expect(h.query("hacker", 5)).toHaveLength(1);
    expect(h.query("ycombinator", 5)).toHaveLength(1);
  });

  it("ignores non-http(s) urls", () => {
    const h = new BrowserHistoryStore();
    h.record("about:blank", "blank", 1);
    expect(h.query("blank", 5)).toHaveLength(0);
  });

  it("clears all entries", () => {
    const h = new BrowserHistoryStore();
    h.record("https://a.com/", "A", 1);
    h.clear();
    expect(h.query("a", 5)).toHaveLength(0);
  });
});

describe("fetchSearchSuggestions", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses the DuckDuckGo type=list format", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ["q", ["s1", "s2"]] }),
    );
    expect(await fetchSearchSuggestions("q", "ua")).toEqual(["s1", "s2"]);
  });

  it("parses an array of phrase objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => [{ phrase: "a" }, { phrase: "b" }] }),
    );
    expect(await fetchSearchSuggestions("q", "ua")).toEqual(["a", "b"]);
  });

  it("returns [] on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await fetchSearchSuggestions("q", "ua")).toEqual([]);
  });

  it("returns [] for an empty query without fetching", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchSearchSuggestions("  ", "ua")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
