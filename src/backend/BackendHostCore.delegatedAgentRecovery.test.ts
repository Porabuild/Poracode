/** Real persistence/host lifecycle; only the supervisor process is inert. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { closeDatabase, getSqlite, initDatabase } from "@/host/db/connection";
import { dbUpsertProject, dbUpsertThread } from "@/host/db/projectsThreads";
import { dbApplyThreadRuntimeEvents, dbReadThreadRuntimeItems } from "@/host/db/runtimeItems";
import { applyThreadRuntimeEventsNow } from "@/host/db/runtimeItemsWriter";
import { RuntimeDurableGapStore } from "@/host/db/runtimeDurableGap";
import {
  beginRuntimeFence,
  getRuntimeContamination,
  releaseRuntimeFence,
  resetRuntimePersistenceForTests,
  runThreadRuntimeMutation,
  runtimePersistenceController,
} from "@/host/db/runtimePersistenceRuntime";
import { nativeBindingEnv, sqliteAvailable, testThread } from "@/host/db/runtimeItems.testFixtures";
import { BackendHostCore } from "./BackendHostCore";

const supervisor = vi.hoisted(() => ({
  options: null as null | { onReset(): void; onEvent(event: SupervisorEvent): void },
}));
vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    constructor(options: typeof supervisor.options) {
      supervisor.options = options;
    }
    dispose = async () => {};
    runThreadMutation = async (_id: string, operation: () => Promise<unknown>) => operation();
    getPeerCanonicalCapabilities = () => ({ supportsCanonicalCredit: false, generation: null });
    setEventBackpressured = () => {};
  },
}));

const THREAD = "thread-retired";
function start(id: string, crossagent = false): Extract<RuntimeEvent, { type: "item.started" }> {
  return {
    type: "item.started",
    threadId: THREAD,
    itemId: id,
    itemType: "tool_call",
    payload: {
      name: crossagent ? "Crossagent" : "Delegate",
      status: "running",
      ...(crossagent ? { isCrossagent: true, crossagentStatus: "running" } : { isSubAgent: true }),
    },
  };
}
function item(id: string) {
  return dbReadThreadRuntimeItems(THREAD).find((row) => row.id === id);
}

// Drain continuation microtasks without timers or manually invoking settlement.
async function continuations() {
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

describe.skipIf(!sqliteAvailable)("BackendHostCore retired delegated-agent recovery", () => {
  let dir: string;
  let path: string;
  let host: BackendHostCore | undefined;
  let published: SupervisorEvent[];

  function openHost() {
    host = new BackendHostCore({
      baseDir: dir,
      dbPath: path,
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/unused",
        wslHelpersDir: "/unused",
        secretStorageKey: "test",
      },
      onEvent: (event) => published.push(event),
      onReset: () => {},
    });
    return host;
  }
  beforeEach(() => {
    if (nativeBindingEnv) process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING = nativeBindingEnv;
    dir = mkdtempSync(join(tmpdir(), "poracode-delegated-recovery-"));
    path = join(dir, "state.sqlite");
    initDatabase(path);
    resetRuntimePersistenceForTests();
    dbUpsertProject(
      {
        id: "project-1",
        name: "Recovery",
        location: { kind: "posix", path: dir },
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      0,
    );
    dbUpsertThread({ ...testThread(), id: THREAD }, 0);
    published = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(async () => {
    await host?.dispose();
    host = undefined;
    resetRuntimePersistenceForTests();
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.PORACODE_BETTER_SQLITE3_NATIVE_BINDING;
    vi.restoreAllMocks();
  });

  it("recovers actual unclean-epoch orphans after acknowledgement before publishing reset", async () => {
    // Model the crashed boot's durable arm/touch without a clean-close owner.
    const crashed = new RuntimeDurableGapStore();
    crashed.bind(getSqlite());
    crashed.arm();
    crashed.touch(THREAD);
    applyThreadRuntimeEventsNow(THREAD, [start("old-native"), start("old-cross", true)]);
    closeDatabase();
    const core = openHost();
    await continuations();
    expect(getRuntimeContamination(THREAD)?.reason).toBe("unclean-epoch");
    expect(item("old-native")).toMatchObject({ state: "started" });
    dbUpsertThread({ ...testThread(), id: "unrelated-thread" }, 1);
    const mutations = vi.spyOn(runtimePersistenceController, "runThreadMutation");
    vi.mocked(console.warn).mockClear();
    for (let index = 0; index < 20; index++) {
      const threadId = "unrelated-thread";
      dbApplyThreadRuntimeEvents(threadId, [
        {
          type: "item.started",
          threadId,
          itemId: `unrelated-${index}`,
          itemType: "assistant_message",
        },
      ]);
      await runThreadRuntimeMutation(threadId, "truncate", () => {});
      await continuations();
    }
    expect(mutations.mock.calls.filter(([threadId]) => threadId === THREAD)).toEqual([]);
    expect(console.warn).not.toHaveBeenCalled();
    expect(item("old-native")).toMatchObject({ state: "started" });
    const gap = core.getThreadRuntimeGap(THREAD)!;
    expect((await core.acknowledgeThreadRuntimeGap(THREAD, gap.token)).outcome).toBe("applied");
    expect(getRuntimeContamination(THREAD)).toBeNull();
    for (const id of ["old-native", "old-cross"])
      expect(item(id)).toMatchObject({ state: "completed", payload: { status: "error" } });
    const completed = published.findIndex((event) => event.type === "thread-runtime-events");
    const reset = published.findIndex((event) => event.type === "thread-reset");
    expect(completed).toBeGreaterThanOrEqual(0);
    expect(completed).toBeLessThan(reset);
    expect(dbApplyThreadRuntimeEvents(THREAD, [start("fresh")]).kind).toBe("accepted");
    await runThreadRuntimeMutation(THREAD, "truncate", () => {});
    await continuations();
    expect(item("fresh")).toMatchObject({ state: "started", payload: { status: "running" } });
  });

  it("automatically repairs committed and pending old starts when a held reset fence releases", async () => {
    closeDatabase();
    openHost();
    dbApplyThreadRuntimeEvents(THREAD, [start("old-committed", true)]);
    await runThreadRuntimeMutation(THREAD, "truncate", () => {});
    const fence = beginRuntimeFence(THREAD);
    dbApplyThreadRuntimeEvents(THREAD, [
      { ...start("old-pending"), payload: { name: "Delegate", status: "running" } },
      {
        type: "item.updated",
        threadId: THREAD,
        itemId: "old-pending",
        payload: { isSubAgent: true },
      },
    ]);
    supervisor.options!.onReset();
    // Replacement supervisor work lands while the retired-generation task waits.
    dbApplyThreadRuntimeEvents(THREAD, [start("fresh", true)]);
    expect(item("old-committed")).toMatchObject({ state: "started" });
    releaseRuntimeFence(fence);
    await continuations();
    for (const id of ["old-committed", "old-pending"])
      expect(item(id)).toMatchObject({ state: "completed", payload: { status: "error" } });
    expect(item("fresh")).toMatchObject({ state: "started", payload: { status: "running" } });
    const completions = published.flatMap((event) =>
      event.type === "thread-runtime-events" ? event.events : [],
    );
    expect(
      completions.filter((event) => event.type === "item.completed").map((event) => event.itemId),
    ).toEqual(["old-committed", "old-pending"]);
  });

  it("retries after another thread frees a globally saturated scheduler slot", async () => {
    closeDatabase();
    openHost();
    applyThreadRuntimeEventsNow(THREAD, [start("old", true)]);
    const targetFence = beginRuntimeFence(THREAD);
    const otherFences = Array.from({ length: 31 }, (_, index) =>
      beginRuntimeFence(`slot-${index}`),
    );
    try {
      supervisor.options!.onReset();
      await continuations();
      dbApplyThreadRuntimeEvents(THREAD, [start("fresh")]);
      releaseRuntimeFence(otherFences.pop()!);
      await continuations();
      releaseRuntimeFence(targetFence);
      await continuations();
      expect(item("old")).toMatchObject({ state: "completed", payload: { status: "error" } });
      expect(item("fresh")).toMatchObject({ state: "started", payload: { status: "running" } });
    } finally {
      releaseRuntimeFence(targetFence);
      for (const fence of otherFences) releaseRuntimeFence(fence);
    }
  });

  it("repairs successive retired captures without consuming a later live generation", async () => {
    closeDatabase();
    openHost();
    applyThreadRuntimeEventsNow(THREAD, [start("generation-one")]);
    const fence = beginRuntimeFence(THREAD);
    supervisor.options!.onReset();
    dbApplyThreadRuntimeEvents(THREAD, [start("generation-two", true)]);
    supervisor.options!.onReset();
    dbApplyThreadRuntimeEvents(THREAD, [start("generation-three")]);
    releaseRuntimeFence(fence);
    await continuations();
    for (const id of ["generation-one", "generation-two"])
      expect(item(id)).toMatchObject({ state: "completed", payload: { status: "error" } });
    expect(item("generation-three")).toMatchObject({
      state: "started",
      payload: { status: "running" },
    });
  });

  it("does not write deferred work after disposal begins", async () => {
    closeDatabase();
    const core = openHost();
    applyThreadRuntimeEventsNow(THREAD, [start("old")]);
    const fence = beginRuntimeFence(THREAD);
    supervisor.options!.onReset();
    const disposal = core.disposeSupervisor();
    releaseRuntimeFence(fence);
    await disposal;
    expect(item("old")).toMatchObject({ state: "started" });
    expect(published).toEqual([]);
  });
});
