import { describe, expect, it } from "vitest";
import { create } from "zustand";
import type { RuntimeContentStreamKind, RuntimeEvent } from "@/shared/contracts";
import { assistantDisplayText } from "@/shared/assistantMessageText";
import { elisionNotice, HEAD_CHARS, TAIL_CHARS } from "@/shared/runtimeStreamRetentionPolicy";
import { joinWithElision } from "@/host/db/runtimeStreamCap";
import {
  collectChatMatches,
  getChatItemSearchText,
} from "@/renderer/components/find/chatFindMatches";
import {
  createInitialRuntimeEventState,
  createRuntimeEventSlice,
  toRuntimeChatItem,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./runtimeEventSlice";

const BUDGET = HEAD_CHARS + TAIL_CHARS;

function makeStore() {
  return create<RuntimeEventSlice>()((set, get, store) =>
    createRuntimeEventSlice(set as never, get as never, store as never),
  );
}

function start(threadId = "thread", itemId = "item:one"): RuntimeEvent {
  return { type: "item.started", threadId, itemId, itemType: "assistant_message" };
}

function delta(
  text: string,
  options: {
    threadId?: string;
    itemId?: string;
    stream?: RuntimeContentStreamKind;
    replace?: boolean;
  } = {},
): RuntimeEvent {
  return {
    type: "content.delta",
    threadId: "thread",
    itemId: "item:one",
    stream: "assistant_text",
    delta: text,
    ...options,
  };
}

function current(store: ReturnType<typeof makeStore>, threadId = "thread", itemId = "item:one") {
  return store.getState().runtimeItemsByIdByThread[threadId]![itemId]!;
}

function seeded(text: string, id = "item:one"): RuntimeChatItem {
  return { id, type: "assistant_message", state: "completed", streams: { assistant_text: text } };
}

describe("reducer stream retention", () => {
  it("bounds a continuously latest live item through 128M+ input units and completion", () => {
    const store = makeStore();
    const state = store.getState();
    state.applyRuntimeEvent("thread", start());
    const itemIndex = store.getState().runtimeItemsByIdByThread.thread;
    const structuralVersion = store.getState().runtimeStructuralVersionByThread.thread;
    const chunk = "H".repeat(TAIL_CHARS * 2);
    let total = 0;
    for (let index = 0; index < 16; index += 1) {
      const text = chunk + ` newest:${index}`;
      total += text.length;
      state.applyRuntimeEvent("thread", delta(text));
      const item = current(store);
      const retained = item.streamRetention!.assistant_text!;
      const stream = item.streams.assistant_text!;
      expect(stream.length).toBeLessThanOrEqual(BUDGET + 128);
      expect(stream.startsWith("H".repeat(HEAD_CHARS))).toBe(true);
      expect(stream.endsWith(` newest:${index}`)).toBe(true);
      expect(retained.elidedChars).toBe(total - HEAD_CHARS - TAIL_CHARS);
      expect(stream).toContain(elisionNotice(retained.elidedChars));
      // Only scalar metadata is retained; no input/delta/head/tail history is hidden here.
      expect(Object.values(retained).every((value) => typeof value === "number")).toBe(true);
      expect(store.getState().runtimeItemsByIdByThread.thread).toBe(itemIndex);
      expect(store.getState().runtimeStructuralVersionByThread.thread).toBe(structuralVersion);
      expect(store.getState().runtimeItemIdsByThread.thread).toEqual(["item:one"]);
    }
    const textBeforeCompletion = current(store).streams.assistant_text;
    state.applyRuntimeEvent("thread", {
      type: "item.completed",
      threadId: "thread",
      itemId: "item:one",
    });
    expect(current(store).streams.assistant_text).toBe(textBeforeCompletion);
    expect(current(store).state).toBe("completed");
    state.applyRuntimeEvent("thread", delta(" after completion"));
    expect(current(store).state).toBe("completed");
    expect(current(store).streams.assistant_text!.endsWith(" after completion")).toBe(true);
    expect(current(store).streamRetention!.assistant_text!.elidedChars).toBe(
      total + " after completion".length - BUDGET,
    );
  });

  it.each([BUDGET - 1, BUDGET])("preserves every unit in a %i-unit live stream", (length) => {
    const store = makeStore();
    const text = "\uD83D\uDE00" + "x".repeat(length - 3) + "\uD83D";
    store.getState().applyRuntimeEvents("thread", [start(), delta(text), delta("")]);
    expect(current(store).streams.assistant_text).toBe(text);
    expect(current(store).streamRetention).toBeUndefined();
  });

  it("resets one bucket on replace, including empty replaces, without touching siblings", () => {
    const store = makeStore();
    store
      .getState()
      .applyRuntimeEvents("thread", [
        start(),
        delta("a".repeat(BUDGET + 100)),
        delta("r".repeat(BUDGET + 20), { stream: "reasoning_text" }),
      ]);
    const reasoning = current(store).streamRetention!.reasoning_text;
    store
      .getState()
      .applyRuntimeEvents("thread", [
        delta("discarded"),
        delta("replacement", { replace: true }),
        delta(" tail"),
      ]);
    expect(current(store).streams.assistant_text).toBe("replacement tail");
    expect(current(store).streamRetention!.assistant_text).toEqual({
      headLimit: HEAD_CHARS,
      headChars: 0,
      tailStart: 0,
      elidedChars: 0,
      replacementRevision: 1,
    });
    expect(current(store).streamRetention!.reasoning_text).toBe(reasoning);
    store.getState().applyRuntimeEvent("thread", delta("b".repeat(BUDGET + 7), { replace: true }));
    expect(current(store).streamRetention!.assistant_text!.elidedChars).toBe(7);
    expect(current(store).streamRetention!.assistant_text!.replacementRevision).toBe(2);
    store.getState().applyRuntimeEvents("thread", [delta("", { replace: true }), delta("new")]);
    expect(current(store).streams.assistant_text).toBe("new");
    expect(current(store).streamRetention!.assistant_text).toEqual({
      headLimit: HEAD_CHARS,
      headChars: 0,
      tailStart: 0,
      elidedChars: 0,
      replacementRevision: 3,
    });
  });

  it("keeps coalesced batches equivalent to sequential events across threads and reused ids", () => {
    const sequential = makeStore();
    const batched = makeStore();
    const events = [
      start(),
      delta("x".repeat(BUDGET)),
      delta("one"),
      delta("two"),
      delta("old", { stream: "command_output" }),
      delta("fresh", { replace: true }),
      delta(" after replace"),
      delta("z".repeat(BUDGET + 31), { stream: "plan_text" }),
      start(),
    ];
    for (const event of events) sequential.getState().applyRuntimeEvent("thread", event);
    batched.getState().applyRuntimeEventBatches([
      { threadId: "thread", events },
      { threadId: "other", events: [start("other"), delta("other text", { threadId: "other" })] },
    ]);
    expect(current(batched)).toEqual(current(sequential));
    expect(current(batched, "other").streams.assistant_text).toBe("other text");
    expect(current(batched).streams.assistant_text).toBe("fresh after replace");
    expect(batched.getState().runtimeItemIdsByThread.thread).toEqual(["item:one"]);
    const before = current(batched);
    batched.getState().applyRuntimeEvent("thread", delta("ignored", { itemId: "unknown" }));
    expect(current(batched)).toBe(before);
  });

  it("retains a legacy host notice verbatim and counts only additional omitted source units", () => {
    // Previous-format persisted shape: no local offsets or original-length metadata.
    const hostText = joinWithElision("H".repeat(HEAD_CHARS), "T".repeat(TAIL_CHARS), 987654);
    const item = toRuntimeChatItem(seeded(hostText));
    expect(item.streams.assistant_text).toBe(hostText);
    expect(item.observedLive).toBeUndefined();
    const store = makeStore();
    store.getState().hydrateThreadRuntimeItems("thread", [item]);
    expect(current(store)).toBe(item);
    const appended = "N".repeat(TAIL_CHARS + 200);
    store.getState().applyRuntimeEvent("thread", delta(appended));
    const result = current(store);
    const meta = result.streamRetention!.assistant_text!;
    const text = result.streams.assistant_text!;
    expect(text.slice(0, meta.headChars)).toBe(hostText.slice(0, meta.headChars));
    expect(text).toContain(elisionNotice(987654));
    expect(meta.elidedChars).toBe(hostText.length + appended.length - meta.headChars - TAIL_CHARS);
    expect(text).toContain(elisionNotice(meta.elidedChars));
    expect(text.match(/\[\.\.\. poracode elided /g)).toHaveLength(2);
    expect(text.endsWith("N".repeat(TAIL_CHARS))).toBe(true);
    expect(text.length).toBeLessThanOrEqual(BUDGET + 256);
    // A direct in-memory hydration keeps offsets, rather than recapping its own notice as text.
    store.getState().evictThreadRuntimeItems("thread");
    store.getState().hydrateThreadRuntimeItems("thread", [result]);
    expect(current(store)).toBe(result);
    store.getState().applyRuntimeEvent("thread", delta("continued"));
    expect(current(store).streamRetention!.assistant_text!.elidedChars).toBe(
      meta.elidedChars + "continued".length,
    );
  });

  it("bounds direct hydration, snapshot conversion and older pages while preserving live overlap", () => {
    const source = seeded("L".repeat(BUDGET * 2), "older");
    expect(toRuntimeChatItem(source).streams.assistant_text!.length).toBeLessThanOrEqual(
      BUDGET + 256,
    );
    const store = makeStore();
    store.getState().hydrateThreadRuntimeItems("thread", [source]);
    const older = current(store, "thread", "older");
    expect(older.streams.assistant_text!.length).toBeLessThanOrEqual(BUDGET + 256);
    expect(source.streams.assistant_text!.length).toBe(BUDGET * 2);
    store.getState().applyRuntimeEvents("thread", [start(), delta("live")]);
    const live = current(store);
    store.getState().hydrateThreadRuntimeItems("thread", [seeded("stale")]);
    store
      .getState()
      .prependThreadRuntimeItems("thread", [
        seeded("O".repeat(BUDGET * 2), "oldest"),
        seeded("stale"),
        source,
      ]);
    expect(current(store)).toBe(live);
    expect(current(store, "thread", "older")).toBe(older);
    expect(current(store, "thread", "oldest").streams.assistant_text!.length).toBeLessThanOrEqual(
      BUDGET + 256,
    );
    expect(store.getState().runtimeItemIdsByThread.thread).toEqual(["oldest", "older", "item:one"]);
  });

  it.each(["clear", "evict", "trim", "reset", "truncate"] as const)(
    "does not transfer old retention metadata to an item id reused after %s",
    (removal) => {
      const store = makeStore();
      const state = store.getState();
      state.applyRuntimeEvents("thread", [
        start("thread", "anchor"),
        start(),
        delta("x".repeat(BUDGET + 7)),
      ]);
      switch (removal) {
        case "clear":
          state.clearThreadRuntimeEvents("thread");
          break;
        case "evict":
          state.evictThreadRuntimeItems("thread");
          break;
        case "trim":
          state.trimThreadRuntimeItems("thread", 1, 1);
          break;
        case "reset":
          store.setState(createInitialRuntimeEventState());
          break;
        case "truncate":
          state.applyRuntimeEvent("thread", {
            type: "runtime.truncated",
            threadId: "thread",
            itemId: "anchor",
            removedCompletedTurnAnchors: [],
          });
          break;
      }
      state.applyRuntimeEvents("thread", [start(), delta("clean")]);
      expect(current(store).streams.assistant_text).toBe("clean");
      expect(current(store).streamRetention).toBeUndefined();
    },
  );

  it("keeps retained display/copy and find text in agreement with an explicit gap", () => {
    const store = makeStore();
    store
      .getState()
      .applyRuntimeEvents("thread", [
        start(),
        delta(
          "HEAD-NEEDLE" +
            "h".repeat(HEAD_CHARS) +
            "MIDDLE-NEEDLE" +
            "t".repeat(TAIL_CHARS) +
            "TAIL-NEEDLE",
        ),
        { type: "item.completed", threadId: "thread", itemId: "item:one" },
      ]);
    const item = current(store);
    // AssistantMessage passes this shared display selection directly to CopyTextButton.
    expect(assistantDisplayText(item)).toBe(item.streams.assistant_text);
    expect(getChatItemSearchText(item)).toBe(assistantDisplayText(item));
    const entries = [{ kind: "item" as const, id: item.id }];
    const byId = { [item.id]: item };
    for (const query of ["HEAD-NEEDLE", "TAIL-NEEDLE", "poracode elided"]) {
      expect(collectChatMatches(byId, entries, query, true)).toHaveLength(1);
    }
    expect(collectChatMatches(byId, entries, "MIDDLE-NEEDLE", true)).toHaveLength(0);
    store.getState().applyRuntimeEvent("thread", delta("NEWEST-NEEDLE"));
    const advanced = current(store);
    expect(advanced.streams.assistant_text!.length).toBe(item.streams.assistant_text!.length);
    expect(assistantDisplayText(advanced).endsWith("NEWEST-NEEDLE")).toBe(true);
    expect(getChatItemSearchText(advanced)).toBe(assistantDisplayText(advanced));
    expect(
      collectChatMatches({ [advanced.id]: advanced }, entries, "NEWEST-NEEDLE", true),
    ).toHaveLength(1);
    store.getState().applyRuntimeEvent("thread", {
      type: "item.updated",
      threadId: "thread",
      itemId: item.id,
      payload: { displayAuthoritative: true, content: [{ kind: "text", text: "final display" }] },
    });
    expect(assistantDisplayText(current(store))).toBe("final display");
    expect(getChatItemSearchText(current(store))).toBe("final display");
  });
});
