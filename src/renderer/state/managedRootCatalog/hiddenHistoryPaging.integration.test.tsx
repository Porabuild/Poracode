import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES } from "@/shared/remote/historyReadContract";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hydrateThreadRuntimeItems,
  invalidateThreadRuntimeHydration,
  loadOlderThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import { selectVisibleThreadTimelineEntries } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { useUnderfilledHistory } from "@/renderer/components/thread/ChatPane/parts/useUnderfilledHistory";
import {
  activate,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";

beforeEach(setupManagedRootFixture);
afterEach(async () => {
  cleanup();
  invalidateThreadRuntimeHydration("hidden-history-goal");
  invalidateThreadRuntimeHydration("hidden-history-ordinary");
  invalidateThreadRuntimeHydration("collapsed-history");
  await teardownManagedRootFixture();
});

function UnderfilledHistoryReader({
  threadId,
  onStartReached,
}: {
  threadId: string;
  onStartReached: () => Promise<boolean>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const oldestVisibleEntryId = useAppStore(
    (state) => selectVisibleThreadTimelineEntries(state, threadId)[0]?.id,
  );
  useUnderfilledHistory({
    threadId,
    oldestVisibleEntryId,
    scrollElementRef: ref,
    onStartReached,
    onContentHeightChange: undefined,
  });
  return (
    <div
      ref={(element) => {
        ref.current = element;
        if (element)
          Object.defineProperties(element, {
            clientHeight: { configurable: true, value: 776 },
            scrollHeight: { configurable: true, value: 776 },
          });
      }}
    />
  );
}

it.each([false, true])(
  "continues real bounded child-only pages until their parent arrives (sparse goal: %s)",
  async (withGoal) => {
    const threadId = withGoal ? "hidden-history-goal" : "hidden-history-ordinary";
    const offset = withGoal ? 1 : 0;
    seedThread(threadId);
    const insert = getSqlite().prepare(
      "INSERT INTO thread_runtime_items(thread_id,item_id,position,type,state,payload,streams,parent_item_id) VALUES(?,?,?,?,'completed',?,?,?)",
    );
    insert.run(
      threadId,
      "parent",
      offset,
      "tool_call",
      JSON.stringify({ name: "Agent", input: { prompt: "Fixture delegation" } }),
      "{}",
      null,
    );
    insert.run(
      threadId,
      "child-answer",
      offset + 1,
      "assistant_message",
      "{}",
      // Exceed the actual serialized soft budget so each hidden child really
      // occupies its own page, independently of conservative fetch estimates.
      JSON.stringify({ assistant_text: "x".repeat(HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES) }),
      "parent",
    );
    insert.run(
      threadId,
      "child-command",
      offset + 2,
      "command_execution",
      JSON.stringify({ command: "printf fixture", exitCode: 0 }),
      "{}",
      "parent",
    );
    const prefix = withGoal ? ["goal"] : [];
    if (withGoal) {
      insert.run(
        threadId,
        "goal",
        0,
        "goal",
        JSON.stringify({ action: "set", objective: "Pinned older goal", status: "active" }),
        "{}",
        null,
      );
    }
    await activate();
    await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15000 });
    await hydrateThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
      ...prefix,
      "child-command",
    ]);
    expect(selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId)).toEqual([]);
    const observed: string[][] = [];
    const onStartReached = vi.fn<() => Promise<boolean>>(async () => {
      const loaded = await loadOlderThreadRuntimeItems(threadId);
      observed.push([...(useAppStore.getState().runtimeItemIdsByThread[threadId] ?? [])]);
      return loaded;
    });
    const view = render(
      <UnderfilledHistoryReader threadId={threadId} onStartReached={onStartReached} />,
    );
    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
        ...prefix,
        "parent",
        "child-answer",
        "child-command",
      ]),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(observed).toContainEqual([...prefix, "child-answer", "child-command"]);
    expect(selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId)).toHaveLength(1);
    expect(onStartReached.mock.calls.length).toBeLessThanOrEqual(3);
    const reads = onStartReached.mock.calls.length;
    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(onStartReached).toHaveBeenCalledTimes(reads);
    expect(
      getSqlite()
        .prepare("SELECT count(*) AS n FROM thread_runtime_items WHERE thread_id=?")
        .get(threadId),
    ).toEqual({ n: withGoal ? 4 : 3 });
  },
  60000,
);

it("counts hundreds of collapsed tool calls as one row and continues back to the prompt", async () => {
  const threadId = "collapsed-history";
  seedThread(threadId);
  const insert = getSqlite().prepare(
    "INSERT INTO thread_runtime_items(thread_id,item_id,position,type,state,payload,streams) VALUES(?,?,?,?,'completed',?,?)",
  );
  insert.run(
    threadId,
    "prompt",
    0,
    "user_message",
    JSON.stringify({ content: [{ kind: "text", text: "Read the project" }] }),
    "{}",
  );
  insert.run(
    threadId,
    "intro",
    1,
    "assistant_message",
    JSON.stringify({ content: [] }),
    JSON.stringify({ assistant_text: "I will read the project." }),
  );
  const toolCount = 600;
  const payload = JSON.stringify({
    name: "Read",
    kind: "read",
    status: "success",
    result: "x".repeat(4096),
  });
  getSqlite().transaction(() => {
    for (let index = 0; index < toolCount; index++) {
      insert.run(threadId, `tool-${index}`, index + 2, "tool_call", payload, "{}");
    }
  })();
  insert.run(
    threadId,
    "answer",
    toolCount + 2,
    "assistant_message",
    JSON.stringify({ content: [] }),
    JSON.stringify({ assistant_text: "The project has been read." }),
  );
  await activate({ preloadProcedures: { dbSetState: () => null } });
  await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15000 });
  await hydrateThreadRuntimeItems(threadId);
  // The first bounded response paints the answer; its byte budget leaves the
  // large collapsed group and the earlier messages for continuation pages.
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["answer"]);
  const observedRows: number[] = [];
  const onStartReached = vi.fn<() => Promise<boolean>>(async () => {
    const loaded = await loadOlderThreadRuntimeItems(threadId);
    observedRows.push(selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId).length);
    return loaded;
  });
  render(<UnderfilledHistoryReader threadId={threadId} onStartReached={onStartReached} />);
  await vi.waitFor(() =>
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]?.[0]).toBe("prompt"),
  );
  await vi.waitFor(() => expect(observedRows).toContain(2));
  expect(selectVisibleThreadTimelineEntries(useAppStore.getState(), threadId)).toHaveLength(4);
  expect(onStartReached.mock.calls.length).toBeLessThanOrEqual(3);
  expect(
    getSqlite()
      .prepare("SELECT count(*) AS n FROM thread_runtime_items WHERE thread_id=?")
      .get(threadId),
  ).toEqual({ n: toolCount + 3 });
}, 60000);
