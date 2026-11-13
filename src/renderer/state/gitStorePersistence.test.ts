import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitCacheState } from "./gitStorePersistence";

const prefix = "poracode-git-cache-v3:";
const day = 24 * 60 * 60 * 1000;
const status = {
  isRepo: true,
  branch: "main",
  tracking: "origin/main",
  hasRemote: true,
  remoteInfo: null,
  ahead: 0,
  behind: 0,
  staged: [],
  unstaged: [],
  totalInsertions: 0,
  totalDeletions: 0,
};
const worktree = { path: "/repo/current", branch: "feature", commit: "abc", isMain: false };
const pr = {
  number: 1,
  state: "merged" as const,
  title: "Current worktree PR",
  url: "https://github.com/owner/repo/pull/1",
  baseBranch: "main",
  isDraft: false,
  updatedAt: "2026-11-01T00:00:00Z",
};

function state(): GitCacheState {
  return {
    statuses: { project: status },
    worktrees: { project: [worktree] },
    branches: { project: { current: "main", branches: [] } },
    ghAvailable: { project: true },
    worktreeStatuses: { [worktree.path]: status },
    prData: { [worktree.path]: pr, "__branch:project": null },
    worktreeSourceInfo: {
      [worktree.path]: { sourceBranch: "main", commitsAhead: 1, sourceAhead: 0 },
    },
  };
}

describe("Git startup cache", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T00:00:00Z"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("migrates released v2 data without losing warm-start state or renewing its age", async () => {
    const initial = state();
    initial.prData["__branchname:project:feature"] = pr;
    initial.worktreeSourceInfo["__branch:project"] = {
      sourceBranch: "main",
      commitsAhead: 1,
      sourceAhead: 0,
    };
    const timestamp = Date.now() - 6 * day;
    localStorage.setItem(
      "poracode-git-cache-v2",
      JSON.stringify({ v: 2, ts: timestamp, ...initial }),
    );
    const cache = await import("./gitStorePersistence");
    expect(cache.loadGitCache()).toEqual(initial);
    expect(localStorage.getItem("poracode-git-cache-v2")).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(`${prefix}prData:__branchname:project:feature`)!).ts,
    ).toBe(timestamp);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache()).toEqual(initial);
  });

  it("restores the v2 bytes if migration hits quota and avoids repeated migration writes", async () => {
    const initial = state();
    const raw = JSON.stringify({ v: 2, ts: Date.now(), ...initial });
    localStorage.setItem("poracode-git-cache-v2", raw);
    const original = Storage.prototype.setItem;
    let writes = 0;
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      writes += 1;
      if (writes === 2) throw new Error("quota");
      original.call(this, key, value);
    });
    const cache = await import("./gitStorePersistence");
    expect(cache.loadGitCache()).toEqual(initial);
    expect(localStorage.getItem("poracode-git-cache-v2")).toBe(raw);
    expect(localStorage.length).toBe(1);
    const attempts = write.mock.calls.length;
    cache.persistGitCache(initial);
    expect(write).toHaveBeenCalledTimes(attempts);
  });

  it("preserves released cache lifetime across unrelated updates", async () => {
    const initial = state();
    initial.prData["/unknown-owner/old-worktree"] = pr;
    localStorage.setItem(
      "poracode-git-cache-v2",
      JSON.stringify({ v: 2, ts: Date.now() - 6 * day, ...initial }),
    );
    const cache = await import("./gitStorePersistence");
    const hydrated = { ...state(), ...cache.loadGitCache() };
    expect(hydrated.prData["/unknown-owner/old-worktree"]).toEqual(pr);
    vi.advanceTimersByTime(day + 1);
    cache.persistGitCache({ ...hydrated, statuses: { project: { ...status, ahead: 1 } } });
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache().prData?.["/unknown-owner/old-worktree"]).toEqual(pr);
  });

  it("writes only the changed record and restores current branch and PR data after restart", async () => {
    const cache = await import("./gitStorePersistence");
    cache.loadGitCache();
    const initial = state();
    cache.persistGitCache(initial);
    const write = vi.spyOn(Storage.prototype, "setItem");
    const updated = { ...initial, statuses: { project: { ...status, ahead: 1 } } };

    cache.persistGitCache(updated);
    cache.persistGitCache(updated);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toBe(`${prefix}statuses:project`);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache()).toEqual(updated);
  });

  it("expires the whole cache seven days after its last update without rewriting unchanged entries", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    cache.persistGitCache(initial);
    const originalPr = localStorage.getItem(`${prefix}prData:${worktree.path}`);
    vi.advanceTimersByTime(6 * day);
    cache.persistGitCache({ ...initial, statuses: { project: { ...status, ahead: 1 } } });
    expect(localStorage.getItem(`${prefix}prData:${worktree.path}`)).toBe(originalPr);
    vi.advanceTimersByTime(7 * day);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache().prData).toEqual(initial.prData);
    vi.advanceTimersByTime(1);
    vi.resetModules();
    const expired = await import("./gitStorePersistence");
    expect(expired.loadGitCache()).toEqual({});
    expect(localStorage.length).toBe(0);
  });

  it("keeps retained warm data fresh after a deletion-only update", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    cache.persistGitCache(initial);
    vi.advanceTimersByTime(6 * day);
    const updated = { ...initial, worktreeStatuses: {} };
    const write = vi.spyOn(Storage.prototype, "setItem");
    cache.persistGitCache(updated);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toBe(`${prefix}updated`);
    vi.advanceTimersByTime(2 * day);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect({ worktreeStatuses: {}, ...restarted.loadGitCache() }).toEqual(updated);
  });

  it("retains branch PRs, main-branch source information and summaries without a catalog", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    initial.worktrees = {};
    initial.prData["__branchname:project:feature"] = pr;
    initial.worktreeSourceInfo["__branch:project"] = {
      sourceBranch: "main",
      commitsAhead: 1,
      sourceAhead: 0,
    };
    cache.persistGitCache(initial);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect({ worktrees: {}, ...restarted.loadGitCache() }).toEqual(initial);
  });

  it("preserves unknown future records and legacy formats across writes and reset", async () => {
    const future = JSON.stringify({ v: 4, ts: Date.now(), value: status });
    const legacyFuture = JSON.stringify({ v: 99, opaque: true });
    localStorage.setItem(`${prefix}statuses:project`, future);
    localStorage.setItem("poracode-git-cache-v2", legacyFuture);
    const cache = await import("./gitStorePersistence");
    expect(cache.loadGitCache()).toEqual({});
    cache.persistGitCache(state());
    cache.clearGitCache();

    expect(localStorage.getItem(`${prefix}statuses:project`)).toBe(future);
    expect(localStorage.getItem("poracode-git-cache-v2")).toBe(legacyFuture);
    expect(localStorage.length).toBe(2);
  });

  it("preserves more than 512 useful PR badges without rewriting unchanged records", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    initial.prData = Object.fromEntries(
      Array.from({ length: 900 }, (_, i) => [
        `__branchname:project:feature-${i}`,
        { ...pr, number: i + 1 },
      ]),
    );
    cache.persistGitCache(initial);
    const write = vi.spyOn(Storage.prototype, "setItem");
    cache.persistGitCache(initial);
    expect(write).not.toHaveBeenCalled();
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache()).toEqual(initial);
  });

  it("preserves a valid large branch catalog with its order and metadata", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    initial.branches.project = {
      current: "main",
      defaultBranch: "origin/main",
      branches: Array.from({ length: 2400 }, (_, i) => ({
        name: `feature/long-lived-branch-${i}`,
        current: false,
        commit: "abcdef0123456789",
        isRemote: i % 2 === 0,
      })),
    };
    expect(JSON.stringify(initial.branches.project).length * 2).toBeGreaterThan(128 * 1024);
    cache.persistGitCache(initial);
    vi.resetModules();
    const restarted = await import("./gitStorePersistence");
    expect(restarted.loadGitCache()).toEqual(initial);
  });

  it("hydrates special cache keys as ordinary own properties", async () => {
    localStorage.setItem(
      `${prefix}prData:__proto__`,
      JSON.stringify({ v: 3, ts: Date.now(), value: pr }),
    );
    const cache = await import("./gitStorePersistence");
    const hydrated = cache.loadGitCache();

    expect(Object.getPrototypeOf(hydrated.prData)).toBe(Object.prototype);
    expect(Object.hasOwn(hydrated.prData!, "__proto__")).toBe(true);
    expect(hydrated.prData?.["__proto__"]).toEqual(pr);
  });

  it("drops malformed records but retains old valid entries while the cache is active", async () => {
    localStorage.setItem(
      `${prefix}statuses:expired`,
      JSON.stringify({ v: 3, ts: Date.now() - 7 * day, value: status }),
    );
    localStorage.setItem(
      `${prefix}worktrees:malformed`,
      JSON.stringify({ v: 3, ts: Date.now(), value: { not: "a list" } }),
    );
    localStorage.setItem(
      `${prefix}ghAvailable:project`,
      JSON.stringify({ v: 3, ts: Date.now(), value: true }),
    );
    const cache = await import("./gitStorePersistence");

    expect(cache.loadGitCache()).toEqual({
      statuses: { expired: status },
      ghAvailable: { project: true },
    });
    expect(localStorage.length).toBe(2);
  });

  it("retries failed storage writes and clears saved entries on reset", async () => {
    const cache = await import("./gitStorePersistence");
    const initial = state();
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("quota");
    });
    expect(() => cache.persistGitCache(initial)).not.toThrow();
    write.mockRestore();
    cache.persistGitCache(initial);
    expect(localStorage.length).toBeGreaterThan(0);
    cache.clearGitCache();
    expect(localStorage.length).toBe(0);
  });
});
