import { beforeEach, describe, expect, it } from "vitest";
import type { SessionConfigOptions } from "@/shared/contracts/sessionConfigOptions";
import type { SessionRef, Thread } from "@/shared/contracts";
import { useAppStore } from "../appStore";
import { applyRootCatalogThreadRows } from "./rootCatalogRows";

const inventory: SessionConfigOptions = [
  {
    id: "mode",
    type: "select",
    role: "mode",
    currentValue: "fast",
    values: [{ value: "fast" }, { value: "careful" }],
    groups: [],
  },
  {
    id: "thought_level",
    type: "select",
    role: "effort",
    currentValue: "high",
    values: [{ value: "high" }, { value: "low" }],
    groups: [],
  },
];

const sessionRef: SessionRef = {
  providerSessionId: "session-a",
  discoveredAt: "2026-10-08T00:00:00.000Z",
  executionIdentity: "execution-scope-1",
};

function seedLiveThread(id: string, agentKind = "test-agent") {
  const store = useAppStore.getState();
  const thread = store.createThread({
    threadId: id,
    projectId: "project",
    agentKind,
    config: { model: "auto" },
    prompt: "Catalog inventory owner",
    focus: false,
    suppressHostCreateIntent: true,
  });
  // The live runtime write path: a thread-state event delivering the session's
  // inventory under the owning agentKind + sessionRef.
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    agentKind,
    canResumeWithConfig: true,
    config: thread.config,
    sessionRef,
    sessionConfigOptions: inventory,
  });
  const resident = useAppStore.getState().threads.find((row) => row.id === id);
  if (!resident) throw new Error(`thread ${id} not seeded`);
  return resident;
}

/**
 * A durable catalog page row: the resident thread as host storage serves it —
 * the volatile `sessionConfigOptions` key is omitted (the host has no column
 * for it), with the page's own durable fields refreshed.
 */
function durablePageOf(resident: Thread, overrides: Partial<Thread> = {}): Thread {
  const { sessionConfigOptions: _omitted, ...page } = resident;
  return { ...page, title: "Durable refresh", ...overrides };
}

function residentInventory(id: string): Thread["sessionConfigOptions"] {
  return useAppStore.getState().threads.find((row) => row.id === id)?.sessionConfigOptions;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    lastRuntimeConfigByThreadId: {},
    runtimeLaunchConfigByThreadId: {},
    threadMentionToolsAvailableByThreadId: {},
  });
});

describe("root catalog pages keep live session inventories", () => {
  it("carries a resident inventory through a page refresh that omits the field", () => {
    // Two background threads, the reproduction shape: both held inventories
    // from live events, then one durable page refreshed both rows.
    const focused = seedLiveThread("thread-focused");
    const background = seedLiveThread("thread-background");

    applyRootCatalogThreadRows(
      [durablePageOf(focused), durablePageOf(background, { title: "Other refresh" })],
      new Set(),
    );

    const focusedRow = useAppStore.getState().threads.find((row) => row.id === focused.id)!;
    const backgroundRow = useAppStore.getState().threads.find((row) => row.id === background.id)!;
    expect(focusedRow.sessionConfigOptions).toEqual(inventory);
    expect(backgroundRow.sessionConfigOptions).toEqual(inventory);
    // Durable page fields still apply on top of the carried inventory.
    expect(backgroundRow.title).toBe("Other refresh");
  });

  it("lets an explicit page inventory win over the resident one", () => {
    const nulled = seedLiveThread("thread-nulled");
    applyRootCatalogThreadRows([durablePageOf(nulled, { sessionConfigOptions: null })], new Set());
    expect(residentInventory("thread-nulled")).toBeNull();

    const emptied = seedLiveThread("thread-emptied");
    applyRootCatalogThreadRows([durablePageOf(emptied, { sessionConfigOptions: [] })], new Set());
    expect(residentInventory("thread-emptied")).toEqual([]);
  });

  it("does not carry the inventory to a page owned by a new session or provider", () => {
    const switchedProvider = seedLiveThread("thread-provider");
    applyRootCatalogThreadRows(
      [durablePageOf(switchedProvider, { agentKind: "other-agent" })],
      new Set(),
    );
    expect(residentInventory("thread-provider")).toBeUndefined();

    const newSession = seedLiveThread("thread-session");
    applyRootCatalogThreadRows(
      [
        durablePageOf(newSession, {
          sessionRef: { ...sessionRef, providerSessionId: "session-b" },
        }),
      ],
      new Set(),
    );
    expect(residentInventory("thread-session")).toBeUndefined();

    const newIdentity = seedLiveThread("thread-identity");
    applyRootCatalogThreadRows(
      [
        durablePageOf(newIdentity, {
          sessionRef: { ...sessionRef, executionIdentity: "execution-scope-2" },
        }),
      ],
      new Set(),
    );
    expect(residentInventory("thread-identity")).toBeUndefined();

    const unowned = seedLiveThread("thread-unowned");
    const { sessionRef: _dropped, ...pageWithoutRef } = durablePageOf(unowned);
    applyRootCatalogThreadRows([pageWithoutRef], new Set());
    expect(residentInventory("thread-unowned")).toBeUndefined();
  });

  it("does not resurrect the inventory on an inactive or archived page row", () => {
    const exited = seedLiveThread("thread-exited");
    applyRootCatalogThreadRows([durablePageOf(exited, { status: "inactive" })], new Set());
    expect(residentInventory("thread-exited")).toBeUndefined();

    const archived = seedLiveThread("thread-archived");
    applyRootCatalogThreadRows([durablePageOf(archived, { archived: true })], new Set());
    expect(residentInventory("thread-archived")).toBeUndefined();
  });

  it("keeps the carry for an error-status page row — a live runtime can still own it", () => {
    const errored = seedLiveThread("thread-errored");
    applyRootCatalogThreadRows(
      [durablePageOf(errored, { status: "error", errorMessage: "turn failed" })],
      new Set(),
    );
    expect(residentInventory("thread-errored")).toEqual(inventory);
  });

  it("treats a done page row as still session-eligible, not retired", () => {
    const done = seedLiveThread("thread-done");
    applyRootCatalogThreadRows(
      [durablePageOf(done, { done: true, status: "finished" })],
      new Set(),
    );
    expect(residentInventory("thread-done")).toEqual(inventory);
  });
});
