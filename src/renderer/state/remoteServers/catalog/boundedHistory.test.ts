import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { PersistedCompletedTurn } from "@/shared/ipc/schemas";
import type { RemoteBoundedThreadHistoryPage, RemoteDesktopClient } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import {
  __resetBoundedHistoryForTest,
  configureBoundedHistoryClient,
  forgetBoundedHistoryThread,
  forgetBoundedHistoryThreadByViewId,
  invokeBoundedRuntimeItemsPage,
  loadOlderBoundedCompletedTurns,
  mergeBoundedTailTurns,
  recordBoundedHistoryTail,
} from "./boundedHistory";
import {
  configureBoundedHistoryManagedRootClient,
  invokeManagedRootRuntimeItemsPage,
  readBoundedHistoryTail,
  recordManagedRootBoundedHistoryTail,
} from "./boundedHistoryRegistry";
import { bumpRemoteServerGeneration, setRemoteServerSnapshotSeq } from "../eventSocketRegistry";

const VIEW_THREAD_ID = remoteThreadId("d1", "rt-1");
const BASE_TIME = Date.parse("2026-01-01T00:00:00.000Z");

function threadRow(): Thread {
  return {
    id: "rt-1",
    projectId: "p1",
    title: "Thread rt-1",
    agentKind: "claude",
    config: {},
    status: "idle",
    createdAt: new Date(BASE_TIME).toISOString(),
    updatedAt: new Date(BASE_TIME).toISOString(),
  } as unknown as Thread;
}

function turn(index: number): PersistedCompletedTurn {
  return {
    startedAt: new Date(BASE_TIME + index * 10_000).toISOString(),
    endedAt: new Date(BASE_TIME + index * 10_000 + 5_000).toISOString(),
    anchorItemId: null,
  };
}

function historyPage(completedTurnsNextCursor: string | null): RemoteBoundedThreadHistoryPage {
  return {
    snapshotSeq: 3,
    thread: threadRow(),
    runtimeItems: [],
    completedTurns: Array.from({ length: 200 }, (_, index) => turn(450 + index)),
    completedTurnsNextCursor,
    contextUsage: null,
    reads: "bounded-v1",
    updatedAt: "now",
  };
}

interface TurnsCall {
  readonly threadId: string;
  readonly cursor: string | undefined;
  readonly limit: number | undefined;
  readonly hasCompletedTurnsLimit: boolean;
}

function makeTurnsClient(totalTurns: number, calls: TurnsCall[]) {
  return {
    boundedThreadTurns: async (input: {
      threadId: string;
      cursor?: string;
      limit?: number;
      completedTurnsLimit?: number;
    }) => {
      calls.push({
        threadId: input.threadId,
        cursor: input.cursor,
        limit: input.limit,
        hasCompletedTurnsLimit: Object.prototype.hasOwnProperty.call(input, "completedTurnsLimit"),
      });
      const bound = input.cursor === undefined ? totalTurns : Number(input.cursor.slice(4));
      const limit = input.limit ?? 200;
      const start = Math.max(0, bound - limit);
      const turns = Array.from({ length: bound - start }, (_, index) => turn(start + index));
      const nextBound = start;
      return {
        turns,
        completedTurnsNextCursor: nextBound > 0 ? `ct1.${nextBound}` : null,
        reads: "bounded-v1" as const,
      };
    },
  } as unknown as RemoteDesktopClient;
}

describe("boundedHistory", () => {
  beforeEach(() => {
    __resetBoundedHistoryForTest();
    useAppStore.setState({ runtimeCompletedTurnsByThread: {} });
  });

  it.each(["remote", "managed-root"] as const)(
    "retains only continuation metadata for a %s history snapshot",
    (connectionKind) => {
      const page = historyPage("ct1.450");
      let viewId = VIEW_THREAD_ID;
      if (connectionKind === "managed-root") {
        const client = {} as RemoteDesktopClient;
        configureBoundedHistoryManagedRootClient(() => ({
          client,
          seq: 7,
          authority: "proof-test",
        }));
        recordManagedRootBoundedHistoryTail({ threadId: "rt-1", page });
        viewId = "rt-1";
      } else {
        recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page });
      }

      const tail = readBoundedHistoryTail(viewId);
      expect(tail?.proof).toEqual({ reads: "bounded-v1" });
      expect(tail?.proof).not.toBe(page);
      expect(tail?.cursor).toBe("ct1.450");
      expect(tail?.snapshotSeq).toBe(3);
    },
  );

  it("continues older completed turns losslessly across ct1 pages", async () => {
    const calls: TurnsCall[] = [];
    const client = makeTurnsClient(650, calls);
    configureBoundedHistoryClient((_desktopId, invoke) => invoke(client));
    // The bounded history tail returned the newest 200 turns (450..649) and
    // the install (applyThreadSnapshot) placed exactly those in the store.
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.450") });
    useAppStore.setState({
      runtimeCompletedTurnsByThread: {
        [VIEW_THREAD_ID]: Array.from({ length: 200 }, (_, index) => ({
          startedAt: BASE_TIME + (450 + index) * 10_000,
          endedAt: BASE_TIME + (450 + index) * 10_000 + 5_000,
          anchorItemId: null,
        })),
      },
    });

    let more = true;
    let guard = 0;
    while (more && guard < 10) {
      more = await loadOlderBoundedCompletedTurns(VIEW_THREAD_ID);
      guard += 1;
    }

    const records = useAppStore.getState().runtimeCompletedTurnsByThread[VIEW_THREAD_ID] ?? [];
    expect(records).toHaveLength(650);
    expect(new Set(records.map((record) => `${record.startedAt}:${record.endedAt}`)).size).toBe(
      650,
    );
    // Strict cursor semantics: the first continuation used the tail's exact
    // cursor, and the turns route takes `limit` (never `completedTurnsLimit`).
    expect(calls[0]?.cursor).toBe("ct1.450");
    expect(calls.every((call) => call.limit === 200)).toBe(true);
    expect(calls.every((call) => call.hasCompletedTurnsLimit === false)).toBe(true);
    expect(calls.map((call) => call.cursor)).toEqual(["ct1.450", "ct1.250", "ct1.50"]);
  });

  it("captures the host identity without keeping the history input in continuation callbacks", async () => {
    const calls: TurnsCall[] = [];
    configureBoundedHistoryClient((_desktopId, invoke) => invoke(makeTurnsClient(650, calls)));
    let recording = true;
    recordBoundedHistoryTail({
      get desktopId() {
        if (!recording) throw new Error("History input must not outlive recording");
        return "d1";
      },
      threadId: "rt-1",
      page: historyPage("ct1.450"),
    });
    recording = false;
    expect(readBoundedHistoryTail(VIEW_THREAD_ID)?.cursor).toBe("ct1.450");
    await expect(loadOlderBoundedCompletedTurns(VIEW_THREAD_ID)).resolves.toBe(true);
    expect(calls[0]?.cursor).toBe("ct1.450");
  });

  it("preserves loaded older turns when a bounded tail is installed", () => {
    const older = Array.from(
      { length: 50 },
      (_, index) =>
        ({
          startedAt: BASE_TIME + index * 10_000,
          endedAt: BASE_TIME + index * 10_000 + 5_000,
          anchorItemId: null,
        }) as const,
    );
    useAppStore.setState({ runtimeCompletedTurnsByThread: { [VIEW_THREAD_ID]: [...older] } });
    const snapshot = {
      ...historyPage("ct1.450"),
      completedTurns: Array.from({ length: 200 }, (_, index) => turn(450 + index)),
    };
    const merged = mergeBoundedTailTurns(snapshot, VIEW_THREAD_ID);
    expect(merged.completedTurns).toHaveLength(250);
    expect(merged.completedTurns[0]?.startedAt).toBe(
      older[0]?.startedAt ? new Date(older[0].startedAt).toISOString() : undefined,
    );
  });

  it("replaces the turn level when the bounded tail is complete", () => {
    useAppStore.setState({
      runtimeCompletedTurnsByThread: {
        [VIEW_THREAD_ID]: [{ startedAt: BASE_TIME, endedAt: BASE_TIME + 1000, anchorItemId: null }],
      },
    });
    const snapshot = historyPage(null);
    const merged = mergeBoundedTailTurns(snapshot, VIEW_THREAD_ID);
    expect(merged).toBe(snapshot);
  });

  it("routes older runtime items through the bounded items route only with a tail", async () => {
    const itemsCalls: unknown[] = [];
    const client = {
      boundedThreadHistoryItems: async (input: unknown) => {
        itemsCalls.push(input);
        return {
          negotiation: "bounded" as const,
          page: { items: [], nextCursor: 4, reads: "bounded-v1" as const },
        };
      },
    } as unknown as RemoteDesktopClient;
    expect(
      await invokeBoundedRuntimeItemsPage(client, "d1", {
        threadId: "rt-1",
        limit: 500,
        beforePosition: 5,
      }),
    ).toBeUndefined();

    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.450") });
    const page = await invokeBoundedRuntimeItemsPage(client, "d1", {
      threadId: "rt-1",
      limit: 500,
      beforePosition: 5,
    });
    expect(page).toEqual({ items: [], nextCursor: 4 });
    expect(itemsCalls).toHaveLength(1);
    const input = itemsCalls[0] as { beforePosition: number; after: unknown };
    expect(input.beforePosition).toBe(5);
    expect(input.after).toBeDefined();
  });

  it("forgets continuation state for a removed server", async () => {
    const calls: TurnsCall[] = [];
    configureBoundedHistoryClient((_desktopId, invoke) => invoke(makeTurnsClient(10, calls)));
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.5") });
    const { forgetBoundedHistoryForServer } = await import("./boundedHistory");
    forgetBoundedHistoryForServer("d1");
    expect(await loadOlderBoundedCompletedTurns(VIEW_THREAD_ID)).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("drops an in-flight older page once the tail is invalidated", async () => {
    let releasePage!: (page: unknown) => void;
    const client = {
      boundedThreadTurns: () =>
        new Promise((resolve) => {
          releasePage = resolve;
        }),
    } as unknown as RemoteDesktopClient;
    configureBoundedHistoryClient((_desktopId, invoke) => invoke(client));
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.450") });
    useAppStore.setState({
      runtimeCompletedTurnsByThread: {
        [VIEW_THREAD_ID]: Array.from({ length: 200 }, (_, index) => ({
          startedAt: BASE_TIME + (450 + index) * 10_000,
          endedAt: BASE_TIME + (450 + index) * 10_000 + 5_000,
          anchorItemId: null,
        })),
      },
    });

    const pending = loadOlderBoundedCompletedTurns(VIEW_THREAD_ID);
    // A truncate/reset/removal lands while the page is in flight.
    forgetBoundedHistoryThread("d1", "rt-1");
    releasePage({
      turns: [turn(449)],
      completedTurnsNextCursor: "ct1.449",
      reads: "bounded-v1",
    });

    await expect(pending).resolves.toBe(false);
    // No old cursor/rows may append to the current history.
    expect(useAppStore.getState().runtimeCompletedTurnsByThread[VIEW_THREAD_ID]).toHaveLength(200);
    expect(readBoundedHistoryTail(VIEW_THREAD_ID)).toBeUndefined();
  });

  it("resumes normally from a fresh tail recorded after invalidation", async () => {
    const calls: TurnsCall[] = [];
    configureBoundedHistoryClient((_desktopId, invoke) => invoke(makeTurnsClient(650, calls)));
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.450") });
    forgetBoundedHistoryThreadByViewId(VIEW_THREAD_ID);
    expect(readBoundedHistoryTail(VIEW_THREAD_ID)).toBeUndefined();
    expect(await loadOlderBoundedCompletedTurns(VIEW_THREAD_ID)).toBe(false);
    expect(calls).toHaveLength(0);

    // Re-opening the thread installs a new bounded tail: continuation resumes.
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.250") });
    expect(await loadOlderBoundedCompletedTurns(VIEW_THREAD_ID)).toBe(true);
    expect(calls[0]?.cursor).toBe("ct1.250");
  });

  it.each(["remote", "managed-root"] as const)(
    "rejects %s item and turn pages that finish after their session is replaced",
    async (kind) => {
      let releaseItems!: (value: unknown) => void;
      let releaseTurns!: (value: unknown) => void;
      let generation = 1;
      const client = {
        boundedThreadHistoryItems: () =>
          new Promise((resolve) => {
            releaseItems = resolve;
          }),
        boundedThreadTurns: () =>
          new Promise((resolve) => {
            releaseTurns = resolve;
          }),
      } as unknown as RemoteDesktopClient;
      let viewId = VIEW_THREAD_ID;
      if (kind === "managed-root") {
        configureBoundedHistoryManagedRootClient(() => ({
          client,
          seq: generation,
          authority: "root-test",
        }));
        recordManagedRootBoundedHistoryTail({ threadId: "rt-1", page: historyPage("ct1.450") });
        viewId = "rt-1";
      } else {
        configureBoundedHistoryClient((_desktopId, invoke) => invoke(client));
        recordBoundedHistoryTail({
          desktopId: "d1",
          threadId: "rt-1",
          page: historyPage("ct1.450"),
        });
      }
      const payload = { threadId: "rt-1", limit: 50, beforePosition: 100 };
      const items =
        kind === "managed-root"
          ? invokeManagedRootRuntimeItemsPage(payload)
          : invokeBoundedRuntimeItemsPage(client, "d1", payload);
      const turns = loadOlderBoundedCompletedTurns(viewId);
      generation += 1;
      if (kind === "remote") bumpRemoteServerGeneration("d1");
      releaseItems({
        negotiation: "bounded",
        page: { items: ["old"], nextCursor: 50, reads: "bounded-v1" },
      });
      releaseTurns({
        turns: [turn(449)],
        completedTurnsNextCursor: "ct1.449",
        reads: "bounded-v1",
      });
      await expect(items).resolves.toBeUndefined();
      await expect(turns).resolves.toBe(false);
      expect(readBoundedHistoryTail(viewId)).toBeUndefined();
      expect(useAppStore.getState().runtimeCompletedTurnsByThread[viewId]).toBeUndefined();
    },
  );

  it("rejects an old remote page after the same endpoint restarts its event epoch", async () => {
    let releaseItems!: (value: unknown) => void;
    const client = {
      boundedThreadHistoryItems: () =>
        new Promise((resolve) => {
          releaseItems = resolve;
        }),
    } as unknown as RemoteDesktopClient;
    setRemoteServerSnapshotSeq("d1", 40, "before");
    recordBoundedHistoryTail({ desktopId: "d1", threadId: "rt-1", page: historyPage("ct1.450") });
    const pending = invokeBoundedRuntimeItemsPage(client, "d1", {
      threadId: "rt-1",
      limit: 50,
      beforePosition: 100,
    });
    setRemoteServerSnapshotSeq("d1", 0, "after");
    releaseItems({
      negotiation: "bounded",
      page: { items: ["old"], nextCursor: 50, reads: "bounded-v1" },
    });
    await expect(pending).resolves.toBeUndefined();
  });
});

void vi;
