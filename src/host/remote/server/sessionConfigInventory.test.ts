import { describe, expect, it } from "vitest";
import type { SessionConfigOptions, Thread, ThreadRuntimeSnapshot } from "@/shared/contracts";
import { SessionConfigInventory } from "./sessionConfigInventory";

const controls: SessionConfigOptions = [
  {
    type: "select",
    id: "model",
    name: "Model",
    role: "model",
    values: [{ value: "default", name: "Default" }],
    groups: [{ id: "main", name: "Main" }],
  },
];

function dbRow(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: "project",
    title: "Chat",
    agentKind: "acp-agent",
    config: { model: "default" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    archived: false,
    done: false,
    starred: false,
    createdAt: "2026-10-08T00:00:00Z",
    updatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

function runtimeSnapshot(overrides: Partial<ThreadRuntimeSnapshot>): ThreadRuntimeSnapshot {
  return {
    threadId: "thread-1",
    agentKind: "acp-agent",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
    ...overrides,
  };
}

describe("SessionConfigInventory", () => {
  it("overlays an event-installed array inventory onto served rows", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    const enriched = store.enrichThreadRow(row);
    expect(enriched.sessionConfigOptions).toEqual(controls);
    // The db row itself is never mutated; the overlay is per served copy.
    expect(row).not.toHaveProperty("sessionConfigOptions");
  });

  it("carries a null retirement visibly on pulls", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: null,
    });
    const enriched = store.enrichThreadRow(row);
    expect(enriched.sessionConfigOptions).toBeNull();
  });

  it("preserves the previous inventory when an event omits the field", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.observeThreadState({ threadId: row.id, agentKind: row.agentKind });
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("keeps serving after a same-scalar re-observation", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    const enriched = store.enrichThreadRow(row);
    expect(enriched.sessionConfigOptions).toEqual(controls);
  });

  it("returns rows without an entry untouched (older-host shape)", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    expect(store.enrichThreadRow(row)).toBe(row);
    expect(store.enrichThreadRow(row)).not.toHaveProperty("sessionConfigOptions");
  });

  it("refuses an entry without a known owner", () => {
    const store = new SessionConfigInventory();
    const row = dbRow({ agentKind: "other-agent" });
    store.observeThreadState({ threadId: row.id, sessionConfigOptions: controls });
    expect(store.enrichThreadRow(row)).toBe(row);
    expect(store.entryFor(row.id)).toBeUndefined();
  });

  it("rejects and retires an entry observed from a foreign owner", () => {
    const store = new SessionConfigInventory();
    const row = dbRow({ agentKind: "switched-agent" });
    store.observeThreadState({
      threadId: row.id,
      agentKind: "previous-agent",
      sessionConfigOptions: controls,
    });
    expect(store.enrichThreadRow(row)).toBe(row);
    // The stale-owner entry is retired, not merely bypassed for one read.
    expect(store.entryFor(row.id)).toBeUndefined();
  });

  it("keeps an entry whose owner matches the current db row", () => {
    const store = new SessionConfigInventory();
    const row = dbRow({ agentKind: "acp-agent" });
    store.observeThreadState({
      threadId: row.id,
      agentKind: "acp-agent",
      sessionConfigOptions: controls,
    });
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
    expect(store.entryFor(row.id)).toBeDefined();
  });

  it("retires the inventory when the session exits", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.retireThread(row.id);
    expect(store.enrichThreadRow(row)).toBe(row);
    expect(store.entryFor(row.id)).toBeUndefined();
  });

  it("drops entries for deleted threads on a full-list prune", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.retainThreads(new Set(["other-thread"]));
    expect(store.enrichThreadRow(row)).toBe(row);
  });

  it("keeps entries for threads the full list still contains", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.retainThreads(new Set([row.id]));
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("seeds a cold server from the opened-thread runtime snapshot", () => {
    const store = new SessionConfigInventory();
    const live = dbRow({ id: "live-thread" });
    const retired = dbRow({ id: "retired-thread" });
    const token = store.beginSeed();
    store.applySeed(token, [
      runtimeSnapshot({ threadId: live.id, sessionConfigOptions: controls }),
      runtimeSnapshot({ threadId: retired.id, sessionConfigOptions: null }),
      // An older supervisor (or a session that never negotiated) stores nothing.
      runtimeSnapshot({ threadId: "silent-thread" }),
    ]);
    expect(store.enrichThreadRow(live).sessionConfigOptions).toEqual(controls);
    expect(store.enrichThreadRow(retired).sessionConfigOptions).toBeNull();
    expect(store.entryFor("silent-thread")).toBeUndefined();
  });

  it("rejects a seed whose thread saw an event while the seed was in flight", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    const token = store.beginSeed();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: null })]);
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("rejects a seed issued before a retirement", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    const token = store.beginSeed();
    store.retireThread(row.id);
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    expect(store.enrichThreadRow(row)).toBe(row);
  });

  it("rejects a seed issued before a prune that removed entries", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    const token = store.beginSeed();
    store.retainThreads(new Set());
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    expect(store.enrichThreadRow(row)).toBe(row);
  });

  it("keeps a pending seed when the prune removes nothing", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    const token = store.beginSeed();
    store.retainThreads(new Set());
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("rejects a seed issued before a clear", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    store.observeThreadState({
      threadId: row.id,
      agentKind: row.agentKind,
      sessionConfigOptions: controls,
    });
    const token = store.beginSeed();
    store.clear();
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    expect(store.enrichThreadRow(row)).toBe(row);
  });

  it("consumes a seed token so a duplicate apply cannot rewrite entries", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    const token = store.beginSeed();
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: null })]);
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("ignores a seed payload that is not an array", () => {
    const store = new SessionConfigInventory();
    const row = dbRow();
    const token = store.beginSeed();
    store.applySeed(token, [runtimeSnapshot({ threadId: row.id, sessionConfigOptions: controls })]);
    // A same-generation apply with a malformed payload must not corrupt entries.
    store.applySeed(store.beginSeed(), undefined as unknown as ThreadRuntimeSnapshot[]);
    expect(store.enrichThreadRow(row).sessionConfigOptions).toEqual(controls);
  });

  it("skips seed entries without a string threadId", () => {
    const store = new SessionConfigInventory();
    const token = store.beginSeed();
    store.applySeed(token, [
      runtimeSnapshot({ threadId: undefined as unknown as string, sessionConfigOptions: controls }),
    ]);
    expect(store.entryFor(undefined as unknown as string)).toBeUndefined();
    expect(store.entryFor("")).toBeUndefined();
  });
  it("does not seed an inventory that has no runtime owner", () => {
    const store = new SessionConfigInventory();
    store.applySeed(store.beginSeed(), [
      (({ agentKind: _owner, ...snapshot }) => snapshot)(
        runtimeSnapshot({ sessionConfigOptions: controls }),
      ),
    ]);
    expect(store.entryFor("thread-1")).toBeUndefined();
  });
});
