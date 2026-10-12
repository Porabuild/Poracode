import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../appStore";
import {
  forgetThreadRuntimeWindow,
  seedOlderThreadRuntimeItemsCursor,
} from "../chatRuntimePersister";
import { projectRemoteThreadEvent, projectRemoteThreadSnapshot } from "../remoteProjection";
import { runtimeHistoryBoundary } from "../runtimeHistoryBoundary";
import {
  __resetEventSocketRegistryForTest,
  recordRemoteThreadAppliedSeq,
  remoteThreadAppliedSeq,
} from "../remoteServers/eventSocketRegistry";
import type { RuntimeChatItem } from "../slices/runtimeEventSlice";
import {
  canonicalText,
  connection,
  deltaFrame,
  historyResult,
  liveItem,
  seedCappedLiveItem,
  thread,
  viewThread,
} from "./cappedHistory.testFixtures";
import {
  applyThreadSnapshot,
  clearPendingRuntimeEvents,
  dispatchRemoteSupervisorEvent,
} from "./sync";

const original = useAppStore.getState();
const proof = () => ({
  threadId: viewThread,
  snapshotSeq: 110,
  isCurrent: () => true,
  lastSeenEventSeq: () => remoteThreadAppliedSeq(connection, thread.id),
});

beforeEach(() => {
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} });
});

afterEach(() => {
  clearPendingRuntimeEvents();
  forgetThreadRuntimeWindow(viewThread);
  __resetEventSocketRegistryForTest();
  useAppStore.setState(original, true);
});

describe.each(["ordinary", "unicode"] as const)("%s capped full-store catch-up", (kind) => {
  it.each(["updated", "completed"] as const)("installs an aligned committed %s item", (state) => {
    seedCappedLiveItem(kind);
    const previous = liveItem();
    const incoming = historyResult(kind, state).page;
    expect(
      incoming.runtimeItems[0]!.streams.assistant_text!.startsWith(
        previous.streams.assistant_text!,
      ),
    ).toBe(false);
    expect(previous.streamRetention!.assistant_text!.elidedChars).toBe(kind === "unicode" ? 2 : 1);
    const result = applyThreadSnapshot(projectRemoteThreadSnapshot(connection, incoming), {
      fromServer: true,
      lastSeenEventSeq: 100,
      committedPrefix: proof(),
    });
    expect(result.installedAuthoritativeHistory).toBe(true);
    expect(liveItem().streams.assistant_text === canonicalText(kind)).toBe(true);
    expect(liveItem().state).toBe(state);
    expect(liveItem().observedLive).toBe(true);
    expect(liveItem().streams.assistant_text!.isWellFormed()).toBe(true);
  });

  it.each([true, false])("keeps an unproven fromServer=%s snapshot conservative", (fromServer) => {
    seedCappedLiveItem(kind);
    const previous = liveItem();
    expect(
      applyThreadSnapshot(projectRemoteThreadSnapshot(connection, historyResult(kind).page), {
        fromServer,
        lastSeenEventSeq: 100,
      }).installedAuthoritativeHistory,
    ).toBe(false);
    expect(liveItem()).toBe(previous);
  });
});

it("rechecks the applied watermark after a queued renderer flush, before metadata or history writes", () => {
  seedCappedLiveItem("unicode");
  const incoming = projectRemoteThreadSnapshot(
    connection,
    historyResult("unicode", "completed").page,
  );
  dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(connection, deltaFrame(" queued")));
  const before = liveItem();
  // The flush can synchronously notify another consumer which advances the
  // sequence registry; the caller's already captured 100 is then obsolete.
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.runtimeItemsByIdByThread[viewThread]?.assistant !== before) {
      recordRemoteThreadAppliedSeq(connection, thread.id, 120);
    }
  });
  try {
    const result = applyThreadSnapshot(
      { ...incoming, thread: { ...incoming.thread, title: "stale" } },
      {
        fromServer: true,
        lastSeenEventSeq: 100,
        committedPrefix: proof(),
      },
    );
    expect(result.installedAuthoritativeHistory).toBe(false);
    expect(liveItem().streams.assistant_text!.endsWith(" queued")).toBe(true);
    expect(liveItem().state).toBe("updated");
    expect(useAppStore.getState().threads[0]!.title).toBe(thread.title);
  } finally {
    unsubscribe();
  }
});

it.each(["thread", "sequence", "generation", "cache"])(
  "rejects a proof with invalid %s scope",
  (scope) => {
    seedCappedLiveItem("ordinary");
    const before = liveItem();
    const committedPrefix = {
      ...proof(),
      ...(scope === "thread" ? { threadId: "another-thread" } : {}),
      ...(scope === "sequence" ? { snapshotSeq: 109 } : {}),
      ...(scope === "generation" ? { isCurrent: () => false } : {}),
    };
    expect(
      applyThreadSnapshot(projectRemoteThreadSnapshot(connection, historyResult("ordinary").page), {
        fromServer: scope !== "cache",
        committedPrefix,
      }).installedAuthoritativeHistory,
    ).toBe(false);
    expect(liveItem()).toBe(before);
  },
);

it("rejects a proof whose connection is replaced by a synchronous flush observer", () => {
  seedCappedLiveItem("unicode");
  let current = true;
  const before = liveItem();
  dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(connection, deltaFrame(" queued")));
  const unsubscribe = useAppStore.subscribe((state) => {
    if (state.runtimeItemsByIdByThread[viewThread]?.assistant !== before) current = false;
  });
  try {
    const result = applyThreadSnapshot(
      projectRemoteThreadSnapshot(connection, historyResult("unicode", "completed").page),
      { fromServer: true, committedPrefix: { ...proof(), isCurrent: () => current } },
    );
    expect(result.installedAuthoritativeHistory).toBe(false);
    expect(liveItem().streams.assistant_text!.endsWith(" queued")).toBe(true);
    expect(liveItem().state).toBe("updated");
  } finally {
    unsubscribe();
  }
});

it("does not authorize a missing existing item record", () => {
  seedCappedLiveItem("ordinary");
  useAppStore.setState({ runtimeItemsByIdByThread: { [viewThread]: {} } });
  const ids = useAppStore.getState().runtimeItemIdsByThread[viewThread];
  const result = applyThreadSnapshot(
    projectRemoteThreadSnapshot(connection, historyResult("ordinary").page),
    { fromServer: true, committedPrefix: proof() },
  );
  expect(result.installedAuthoritativeHistory).toBe(false);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toBe(ids);
  expect(useAppStore.getState().runtimeItemsByIdByThread[viewThread]).toEqual({});
});

it.each(["identity", "type", "parent", "state", "payload", "stream", "empty", "order"])(
  "does not authorize an active %s regression with a stream proof",
  (regression) => {
    seedCappedLiveItem("ordinary");
    const before = liveItem();
    const incoming = projectRemoteThreadSnapshot(connection, historyResult("ordinary").page);
    const item = incoming.runtimeItems[0]!;
    if (regression === "identity") item.id = "unknown";
    if (regression === "type") item.type = "user_message";
    if (regression === "parent") item.parentItemId = "other-parent";
    if (regression === "state") item.state = "started";
    if (regression === "payload") item.payload = { stable: false };
    if (regression === "stream") item.streams = {};
    if (regression === "empty") incoming.runtimeItems = [];
    if (regression === "order") {
      const other: RuntimeChatItem = {
        id: "other",
        type: "assistant_message",
        state: "completed",
        streams: {},
      };
      useAppStore.getState().prependThreadRuntimeItems(viewThread, [other]);
      incoming.runtimeItems.push(other);
    }
    const ids = useAppStore.getState().runtimeItemIdsByThread[viewThread];
    expect(
      applyThreadSnapshot(incoming, { fromServer: true, committedPrefix: proof() })
        .installedAuthoritativeHistory,
    ).toBe(false);
    expect(liveItem()).toBe(before);
    expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toBe(ids);
  },
);

it("preserves H1 older reader objects and their cursor while replacing a clipped tail", () => {
  seedCappedLiveItem("unicode");
  const older: RuntimeChatItem[] = [80, 81, 82].map((n) => ({
    id: `older-${n}`,
    type: "assistant_message",
    state: "completed",
    streams: {},
  }));
  useAppStore.getState().prependThreadRuntimeItems(viewThread, older);
  seedOlderThreadRuntimeItemsCursor(viewThread, 80);
  const before = useAppStore.getState().runtimeItemsByIdByThread[viewThread]!;
  const incoming = projectRemoteThreadSnapshot(connection, historyResult("unicode").page);
  expect(
    applyThreadSnapshot(incoming, { fromServer: true, committedPrefix: proof() })
      .installedAuthoritativeHistory,
  ).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[viewThread]).toEqual([
    "older-80",
    "older-81",
    "older-82",
    "assistant",
  ]);
  for (const row of older)
    expect(useAppStore.getState().runtimeItemsByIdByThread[viewThread]![row.id]).toBe(
      before[row.id],
    );
  expect(runtimeHistoryBoundary(viewThread).cursor).toBe(80);
});
