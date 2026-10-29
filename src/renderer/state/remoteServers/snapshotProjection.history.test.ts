import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import { RemoteClientError, type RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetRuntimeHistoryNoticeCapabilityForTest,
  noteRuntimeHistoryNoticesCapability,
} from "../remote/historyNoticeCapability";
import {
  __resetThreadHistoryNoticeStoreForTest,
  readThreadHistoryNotice,
} from "../remote/historyNoticeStore";
import { useAppStore } from "../appStore";
import {
  forgetThreadRuntimeWindow,
  setOlderThreadHistoryContinuation,
  setOlderThreadHistoryInvalidation,
} from "../chatRuntimePersister";
import { remoteThreadId } from "../remoteProjection";
import { runtimeHistoryBoundary } from "../runtimeHistoryBoundary";
import type { RuntimeChatItem } from "../slices/runtimeEventSlice";
import { __resetBoundedCatalogForTest } from "./catalog/boundedCatalogController";
import { __resetBoundedHistoryForTest } from "./catalog/boundedHistory";
import {
  __resetEventSocketRegistryForTest,
  recordRemoteThreadAppliedSeq,
  setRemoteServerSnapshotSeq,
} from "./eventSocketRegistry";
import {
  createSnapshotProjectionActions,
  __resetOpenRemoteThreadRequestSeqForTest,
} from "./snapshotProjection";
import type { RemoteServerRecord, RemoteServersState } from "./types";

// This test supplies the store action's get/set bindings directly. Avoid
// constructing a second global remote store through catalog import cycles.
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({ servers: [], runtime: {}, openThread: null }) },
}));

const original = useAppStore.getState();
const connection = "history-install-host";
const viewThread = remoteThreadId(connection, "thread");
const server: RemoteServerRecord = {
  desktopId: connection,
  label: "History",
  endpoint: "http://127.0.0.1:1",
  accessToken: "fixture",
  scopes: ["session:read"],
};
const thread: Thread = {
  id: "thread",
  projectId: "project",
  title: "History",
  agentKind: "",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function page(
  start: number,
  end: number,
  seq: number,
): Awaited<ReturnType<RemoteDesktopClient["boundedThreadHistory"]>> {
  const goal: RuntimeChatItem = {
    id: "goal",
    type: "goal",
    state: "completed",
    streams: {},
    payload: { action: "set", objective: "Keep going" },
  };
  const tail: RuntimeChatItem[] = Array.from({ length: end - start + 1 }, (_, i) => ({
    id: `row-${start + i}`,
    type: "assistant_message",
    state: "completed",
    streams: {},
  }));
  return {
    negotiation: "legacy",
    page: {
      thread,
      runtimeItems: [goal, ...tail],
      runtimeNextCursor: start,
      snapshotSeq: seq,
      completedTurns: [],
      contextUsage: null,
      updatedAt: thread.updatedAt,
    },
  };
}

function harness() {
  const boundedThreadHistory = vi.fn<RemoteDesktopClient["boundedThreadHistory"]>();
  const client = { boundedThreadHistory } as unknown as RemoteDesktopClient;
  let state = { servers: [server], runtime: {}, openThread: null } as unknown as RemoteServersState;
  const actions = createSnapshotProjectionActions({
    get: () => state,
    set: (partial) => {
      state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    },
    withClient: (_key, invoke) => invoke(client),
    clientForServer: () => client,
    reportRemoteServerError: vi.fn<() => void>(),
    startRemoteServerEventStream: async () => {},
    activateRemoteTerminalFeed: () => {},
  });
  state = { ...state, ...actions };
  return { actions, boundedThreadHistory };
}

beforeEach(() => {
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} });
  __resetOpenRemoteThreadRequestSeqForTest();
  __resetRuntimeHistoryNoticeCapabilityForTest();
  __resetThreadHistoryNoticeStoreForTest();
});

afterEach(() => {
  forgetThreadRuntimeWindow(viewThread);
  setOlderThreadHistoryContinuation(null);
  setOlderThreadHistoryInvalidation(null);
  __resetBoundedCatalogForTest();
  __resetBoundedHistoryForTest();
  __resetEventSocketRegistryForTest();
  useAppStore.setState(original, true);
});

it("installs the projected ordinary overlap and cursor together through the real open action", async () => {
  const { actions, boundedThreadHistory } = harness();
  boundedThreadHistory
    .mockResolvedValueOnce(page(80, 150, 1))
    .mockResolvedValueOnce(page(120, 160, 2));
  expect(await actions.openRemoteThread(connection, "thread", { focus: false })).toBe(true);
  const readerRow = useAppStore.getState().runtimeItemsByIdByThread[viewThread]!["row-80"];
  expect(await actions.openRemoteThread(connection, "thread", { focus: false })).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toEqual([
    "goal",
    ...Array.from({ length: 81 }, (_, i) => `row-${80 + i}`),
  ]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[viewThread]!["row-80"]).toBe(readerRow);
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(80);
});

it("retries an open whose history reply crossed a server epoch change", async () => {
  const { actions, boundedThreadHistory } = harness();
  setRemoteServerSnapshotSeq(connection, 5, "old-instance");
  const delayed =
    Promise.withResolvers<Awaited<ReturnType<RemoteDesktopClient["boundedThreadHistory"]>>>();
  boundedThreadHistory
    .mockReturnValueOnce(delayed.promise)
    .mockResolvedValueOnce(page(120, 125, 3));
  const opened = actions.openRemoteThread(connection, "thread", { focus: false });
  setRemoteServerSnapshotSeq(connection, 3, "new-instance");
  delayed.resolve(page(80, 150, 500));

  await expect(opened).resolves.toBe(true);
  expect(boundedThreadHistory).toHaveBeenCalledTimes(2);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toEqual([
    "goal",
    ...Array.from({ length: 6 }, (_, i) => `row-${120 + i}`),
  ]);
});

it.each([
  [503, "persistence_read_refused", false],
  [503, "persistence_busy", false],
  [503, "persistence_degraded", false],
  [503, "persistence_unavailable", false],
  [401, "unauthorized", false],
  [404, "not_found", false],
  [413, "response_too_large", false],
  [499, "cancelled", false],
  [500, "persistence_identity_invalid", false],
  [503, "persistence_contaminated", true],
  [409, "runtime_history_notice_unsupported", true],
] as const)(
  "only offers history recovery for a gap refusal (%s %s)",
  async (status, code, recovery) => {
    const { actions, boundedThreadHistory } = harness();
    noteRuntimeHistoryNoticesCapability(connection, true);
    boundedThreadHistory.mockRejectedValueOnce(new RemoteClientError("Read refused", status, code));
    expect(
      await actions.openRemoteThread(connection, "thread", { focus: false, quiet: true }),
    ).toBe(false);
    expect(readThreadHistoryNotice(viewThread)?.needsReview ?? false).toBe(recovery);
  },
);

it("clears an unconfirmed gap warning when reopening history succeeds", async () => {
  const { actions, boundedThreadHistory } = harness();
  noteRuntimeHistoryNoticesCapability(connection, true);
  boundedThreadHistory
    .mockRejectedValueOnce(new RemoteClientError("Open gap", 503, "persistence_contaminated"))
    .mockResolvedValueOnce(page(80, 90, 1));
  expect(await actions.openRemoteThread(connection, "thread", { focus: false, quiet: true })).toBe(
    false,
  );
  expect(readThreadHistoryNotice(viewThread)?.needsReview).toBe(true);
  expect(await actions.openRemoteThread(connection, "thread", { focus: false })).toBe(true);
  expect(readThreadHistoryNotice(viewThread)?.needsReview).toBe(false);
});

it("does not pre-seed a stale projected snapshot's disjoint cursor before shared arbitration", async () => {
  const { actions, boundedThreadHistory } = harness();
  boundedThreadHistory
    .mockResolvedValueOnce(page(80, 90, 10))
    .mockResolvedValueOnce(page(120, 125, 5));
  await actions.openRemoteThread(connection, "thread", { focus: false });
  const generation = runtimeHistoryBoundary(viewThread).generation;
  recordRemoteThreadAppliedSeq(connection, "thread", 10);
  await actions.openRemoteThread(connection, "thread", { focus: false });
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(80);
  expect(runtimeHistoryBoundary(viewThread).generation).toBe(generation);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toContain("row-80");
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).not.toContain("row-120");
});

it("preserves a restored reader prefix while its first online attach awaits history", async () => {
  const { actions, boundedThreadHistory } = harness();
  const loaded = page(80, 150, 0).page.runtimeItems as RuntimeChatItem[];
  useAppStore.getState().hydrateThreadRuntimeItems(viewThread, loaded);
  runtimeHistoryBoundary(viewThread).cursor = 80;
  let resolve!: (value: ReturnType<typeof page>) => void;
  boundedThreadHistory.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const attached = actions.openRemoteThread(connection, "thread", {
    focus: false,
    preserveLoadedHistory: true,
  });
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toContain("row-80");
  resolve(page(120, 160, 1));
  expect(await attached).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toEqual([
    "goal",
    ...Array.from({ length: 81 }, (_, i) => `row-${80 + i}`),
  ]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[viewThread]!["row-80"]).toBe(loaded[1]);
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(80);
});

it("replaces a restored reader with an authoritative disjoint tail", async () => {
  const { actions, boundedThreadHistory } = harness();
  useAppStore
    .getState()
    .hydrateThreadRuntimeItems(viewThread, page(80, 90, 0).page.runtimeItems as RuntimeChatItem[]);
  runtimeHistoryBoundary(viewThread).cursor = 80;
  boundedThreadHistory.mockResolvedValueOnce(page(120, 125, 1));
  expect(
    await actions.openRemoteThread(connection, "thread", {
      focus: false,
      preserveLoadedHistory: true,
    }),
  ).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).not.toContain("row-80");
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(120);
});

it("still resets an unwatched projection for an ordinary open", async () => {
  const { actions, boundedThreadHistory } = harness();
  useAppStore
    .getState()
    .hydrateThreadRuntimeItems(viewThread, page(80, 150, 0).page.runtimeItems as RuntimeChatItem[]);
  boundedThreadHistory.mockResolvedValueOnce(page(120, 160, 1));
  expect(await actions.openRemoteThread(connection, "thread", { focus: false })).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).not.toContain("row-80");
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(120);
});
