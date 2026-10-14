// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, WorkflowRun } from "@/shared/contracts";
import { estimateCacheValueBytes } from "./browserMetadataCacheProjection";

const { workflowGetRun } = vi.hoisted(() => ({
  workflowGetRun: vi.fn<(payload: unknown) => Promise<{ run: WorkflowRun | null }>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ workflowGetRun }),
}));

const location: ProjectLocation = { kind: "windows", path: "C:/repo" };
let store: typeof import("./workflowRunStore").useWorkflowRunStore;
let disposers: Array<() => void>;

function run(
  status: WorkflowRun["status"] = "completed",
  text = "tool and child evidence",
): WorkflowRun {
  return {
    runId: "run",
    status,
    totalTokens: 42,
    totalToolCalls: 2,
    agentCount: 2,
    phases: [
      {
        title: "Phase",
        agents: [
          {
            agentId: "phased",
            label: "Phased",
            tokens: 20,
            toolCalls: 1,
            chat: [{ role: "tool", title: "Child result", text }],
          },
        ],
      },
    ],
    unphasedAgents: [
      {
        agentId: "unphased",
        label: "Unphased",
        resultPreview: "result",
        chat: [{ role: "assistant", text }],
      },
    ],
  };
}

function subscribe(
  itemId = "item",
  chats = false,
  manifestPath = "/run.json",
  owner = location,
  transcriptDir = "/transcripts",
) {
  const dispose = store.getState().subscribe(itemId, manifestPath, owner, transcriptDir, chats);
  disposers.push(dispose);
  return dispose;
}

function deferred() {
  let resolve!: (value: { run: WorkflowRun | null }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ run: WorkflowRun | null }>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T00:00:00.000Z"));
  workflowGetRun.mockReset();
  workflowGetRun.mockResolvedValue({ run: run() });
  disposers = [];
  ({ useWorkflowRunStore: store } = await import("./workflowRunStore"));
});

afterEach(() => {
  for (const dispose of disposers) dispose();
  vi.useRealTimers();
});

describe("workflowRunStore retention", () => {
  it("releases complete chats at zero subscribers while retaining warm stats without mutating prior snapshots", async () => {
    const complete = run("completed", "x".repeat(1024 * 1024));
    workflowGetRun.mockResolvedValue({ run: complete });
    const dispose = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    const before = store.getState();
    expect(before.byItemId.item?.run).toBe(complete);

    dispose();
    const cached = store.getState().byItemId.item?.run;
    expect(cached?.phases[0]?.agents[0]?.chat).toBeUndefined();
    expect(cached?.unphasedAgents[0]?.chat).toBeUndefined();
    expect(cached?.totalTokens).toBe(42);
    expect(cached?.totalToolCalls).toBe(2);
    expect(cached?.unphasedAgents[0]?.resultPreview).toBe("result");
    expect(before.byItemId.item?.run).toBe(complete);
    expect(complete.phases[0]?.agents[0]?.chat?.[0]?.text).toHaveLength(1024 * 1024);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not accumulate every visited workflow or its complete chats", async () => {
    for (let i = 0; i < 1000; i += 1) {
      const dispose = subscribe(`item-${i}`, true);
      await vi.advanceTimersByTimeAsync(0);
      dispose();
    }
    const entries = store.getState().byItemId;
    expect(Object.keys(entries)).toHaveLength(32);
    expect(entries["item-0"]).toBeUndefined();
    expect(entries["item-999"]?.run?.phases[0]?.agents[0]?.chat).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("applies a byte budget to inactive summaries while keeping oversized active snapshots intact", async () => {
    const warm = subscribe("warm");
    await vi.advanceTimersByTimeAsync(0);
    warm();
    const cached = store.getState().byItemId.warm;
    const large = run();
    large.summary = "x".repeat(1024 * 1024);
    workflowGetRun.mockResolvedValue({ run: large });
    const dispose = subscribe("large", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().byItemId.large?.run).toBe(large);
    dispose();
    expect(store.getState().byItemId.large).toBeUndefined();
    expect(store.getState().byItemId.warm).toBe(cached);
  });

  it("enforces the aggregate summary byte budget before the count limit", async () => {
    const summary = run();
    summary.summary = "x".repeat(128 * 1024);
    workflowGetRun.mockResolvedValue({ run: summary });
    for (let i = 0; i < 4; i += 1) {
      const dispose = subscribe(`summary-${i}`, true);
      await vi.advanceTimersByTimeAsync(0);
      dispose();
    }
    const entries = store.getState().byItemId;
    expect(Object.keys(entries)).toHaveLength(3);
    expect(entries["summary-0"]).toBeUndefined();
    expect(entries["summary-3"]).toBeDefined();
    expect(estimateCacheValueBytes(entries)).toBeLessThanOrEqual(1024 * 1024);
  });

  it("refreshes inactive LRU recency on reuse and refetches an evicted workflow", async () => {
    for (let i = 0; i < 32; i += 1) {
      const dispose = subscribe(`item-${i}`);
      await vi.advanceTimersByTimeAsync(0);
      dispose();
    }
    const cached = store.getState().byItemId["item-0"];
    const touch = subscribe("item-0");
    expect(store.getState().byItemId["item-0"]).toBe(cached);
    await vi.advanceTimersByTimeAsync(0);
    touch();
    const extra = subscribe("extra");
    await vi.advanceTimersByTimeAsync(0);
    extra();
    expect(store.getState().byItemId["item-0"]).toBeDefined();
    expect(store.getState().byItemId["item-1"]).toBeUndefined();
    subscribe("item-1", true);
    expect(store.getState().byItemId["item-1"]).toMatchObject({ run: null, loading: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().byItemId["item-1"]?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
  });

  it.each([10, 1000])(
    "bounds property-copy work after %i previously visited workflows",
    async (visits) => {
      for (let i = 0; i < visits; i += 1) {
        const dispose = subscribe(`past-${i}`, true);
        await vi.advanceTimersByTimeAsync(0);
        dispose();
      }
      workflowGetRun.mockImplementation(async () => ({ run: run("running") }));
      subscribe("active", true);
      await vi.advanceTimersByTimeAsync(0);
      const copiedEntryCounts: number[] = [];
      const byItemId = new Proxy(store.getState().byItemId, {
        ownKeys(target) {
          const keys = Reflect.ownKeys(target);
          copiedEntryCounts.push(keys.length);
          return keys;
        },
      });
      store.setState({ byItemId });
      await vi.advanceTimersByTimeAsync(1500);
      expect(copiedEntryCounts).toEqual([Math.min(visits, 32) + 1]);
    },
  );

  it("keeps actively subscribed evidence and snapshot identity through unrelated cache pressure", async () => {
    subscribe("active", true);
    await vi.advanceTimersByTimeAsync(0);
    const active = store.getState().byItemId.active;
    for (let i = 0; i < 40; i += 1) {
      const dispose = subscribe(`idle-${i}`, true);
      await vi.advanceTimersByTimeAsync(0);
      dispose();
    }
    expect(store.getState().byItemId.active).toBe(active);
    expect(active?.run?.phases[0]?.agents[0]?.chat?.[0]?.text).toBe("tool and child evidence");
    expect(Object.keys(store.getState().byItemId)).toHaveLength(33);
  });
});

describe("workflowRunStore subscriptions", () => {
  it("shares one live poll between summary and detail subscribers and releases details only after the last viewer leaves", async () => {
    const complete = run("running");
    workflowGetRun.mockResolvedValue({ run: complete });
    subscribe();
    const first = subscribe("item", true);
    const second = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(workflowGetRun).toHaveBeenCalledTimes(1);
    expect(workflowGetRun).toHaveBeenLastCalledWith({
      manifestPath: "/run.json",
      location,
      transcriptDir: "/transcripts",
      includeAgentChats: true,
    });
    first();
    first();
    expect(store.getState().byItemId.item?.run).toBe(complete);
    second();
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1500);
    expect(workflowGetRun).toHaveBeenCalledTimes(2);
    expect(workflowGetRun.mock.lastCall?.[0]).not.toHaveProperty("includeAgentChats");
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeUndefined();
  });

  it("refetches all agent details when a terminal warm summary is reopened", async () => {
    const dispose = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    const summary = store.getState().byItemId.item?.run;
    subscribe("item", true);
    expect(store.getState().byItemId.item?.run).toBe(summary);
    await vi.advanceTimersByTimeAsync(0);
    expect(workflowGetRun).toHaveBeenCalledTimes(2);
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
    expect(store.getState().byItemId.item?.run?.unphasedAgents[0]?.chat).toBeDefined();
  });

  it("does not overlap requests when a detail viewer joins a pending summary read", async () => {
    const pending = deferred();
    workflowGetRun.mockReturnValueOnce(pending.promise);
    subscribe();
    await vi.advanceTimersByTimeAsync(0);
    subscribe("item", true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(workflowGetRun).toHaveBeenCalledTimes(1);
    pending.resolve({ run: run() });
    await vi.advanceTimersByTimeAsync(0);
    expect(workflowGetRun).toHaveBeenCalledTimes(2);
    expect(workflowGetRun.mock.lastCall?.[0]).toHaveProperty("includeAgentChats", true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not let a pending detailed reply restore chats after the last detail viewer leaves", async () => {
    const pending = deferred();
    workflowGetRun.mockReturnValueOnce(pending.promise);
    subscribe();
    const disposeDetails = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    disposeDetails();
    pending.resolve({ run: run() });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeUndefined();
    expect(store.getState().byItemId.item?.run?.unphasedAgents[0]?.chat).toBeUndefined();
    expect(workflowGetRun).toHaveBeenCalledTimes(1);
  });

  it("reloads terminal details when a viewer returns while summary subscribers remain", async () => {
    subscribe();
    const details = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    details();
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeUndefined();
    subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    expect(workflowGetRun).toHaveBeenCalledTimes(2);
    expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps snapshots stable for identical results and follows missing/error retry cadence", async () => {
    workflowGetRun.mockResolvedValue({ run: null });
    subscribe();
    await vi.advanceTimersByTimeAsync(0);
    const empty = store.getState();
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState()).toBe(empty);
    workflowGetRun.mockRejectedValue(new Error("read failed"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState().byItemId.item?.error).toBe("read failed");
    const failed = store.getState();
    const calls = workflowGetRun.mock.calls.length;
    const extra = subscribe();
    await vi.advanceTimersByTimeAsync(2999);
    expect(workflowGetRun).toHaveBeenCalledTimes(calls);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getState()).toBe(failed);
    extra();
    const complete = run("running");
    delete complete.phases[0]!.agents[0]!.chat;
    delete complete.unphasedAgents[0]!.chat;
    workflowGetRun.mockResolvedValue({ run: complete });
    await vi.advanceTimersByTimeAsync(3000);
    const ready = store.getState();
    await vi.advanceTimersByTimeAsync(1500);
    expect(store.getState()).toBe(ready);
  });

  it("drops empty pending entries and consumes the eventual result without rearming a poll", async () => {
    const pending = deferred();
    workflowGetRun.mockReturnValueOnce(pending.promise);
    const dispose = subscribe("item", true);
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    expect(store.getState().byItemId.item).toBeUndefined();
    pending.resolve({ run: run("running") });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().byItemId.item).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["completed", "failed", "cancelled"] as const)(
    "stops polling for %s but retains active details",
    async (status) => {
      workflowGetRun.mockResolvedValue({ run: run(status) });
      subscribe("item", true);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(workflowGetRun).toHaveBeenCalledTimes(1);
      expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    { name: "manifest", manifest: "/new.json", owner: location, transcriptDir: "/transcripts" },
    {
      name: "transcript directory",
      manifest: "/run.json",
      owner: location,
      transcriptDir: "/new-transcripts",
    },
    {
      name: "remote host",
      manifest: "/run.json",
      owner: { ...location, remoteServerId: "new-host" },
      transcriptDir: "/transcripts",
    },
    {
      name: "project location",
      manifest: "/run.json",
      owner: { ...location, path: "C:/other" },
      transcriptDir: "/transcripts",
    },
  ])(
    "fences pending results when the latest $name replaces the owner without losing active subscribers",
    async ({ manifest, owner, transcriptDir }) => {
      const pending = deferred();
      workflowGetRun.mockReturnValueOnce(pending.promise);
      const oldDetails = subscribe("item", true);
      await vi.advanceTimersByTimeAsync(0);
      const latestStats = subscribe("item", false, manifest, owner, transcriptDir);
      expect(store.getState().byItemId.item?.run).toBeNull();
      await vi.advanceTimersByTimeAsync(0);
      const latest = store.getState();
      expect(workflowGetRun.mock.lastCall?.[0]).toEqual({
        manifestPath: manifest,
        location: owner,
        transcriptDir,
        includeAgentChats: true,
      });
      pending.resolve({ run: run("failed", "stale evidence") });
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState()).toBe(latest);
      latestStats();
      expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
      oldDetails();
      const warm = store.getState().byItemId.item;
      subscribe("item", true, manifest, owner, transcriptDir);
      expect(store.getState().byItemId.item).toBe(warm);
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState().byItemId.item?.run?.phases[0]?.agents[0]?.chat).toBeDefined();
    },
  );

  it("does not reuse a warm summary across remote hosts and ignores an obsolete owner's error", async () => {
    const dispose = subscribe();
    await vi.advanceTimersByTimeAsync(0);
    dispose();
    const pending = deferred();
    workflowGetRun.mockReturnValueOnce(pending.promise);
    subscribe("item", false, "/run.json", { ...location, remoteServerId: "other-host" });
    expect(store.getState().byItemId.item?.run).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    subscribe("item", false, "/new.json");
    await vi.advanceTimersByTimeAsync(0);
    const latest = store.getState();
    pending.reject(new Error("obsolete host"));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState()).toBe(latest);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resolve", "reject"] as const)(
    "fences an old %s after zero-ref teardown and same-key resubscribe",
    async (settle) => {
      const pending = deferred();
      workflowGetRun.mockReturnValueOnce(pending.promise);
      const old = subscribe("item", true);
      await vi.advanceTimersByTimeAsync(0);
      old();
      subscribe("item", true);
      await vi.advanceTimersByTimeAsync(0);
      const latest = store.getState();
      if (settle === "resolve") pending.resolve({ run: run("failed", "old") });
      else pending.reject(new Error("old error"));
      await vi.advanceTimersByTimeAsync(0);
      expect(store.getState()).toBe(latest);
      old();
      expect(store.getState()).toBe(latest);
    },
  );
});
