import { expect, it } from "vitest";
import { create } from "zustand";
import {
  createRuntimeEventSlice,
  type RuntimeChatItem,
  type RuntimeEventSlice,
} from "./runtimeEventSlice";
import {
  readRuntimeStructuralChangeHint,
  recordRuntimeStructuralChangeHint,
} from "../runtimeStructuralChanges";

function setup() {
  return create<RuntimeEventSlice>()((set, get, store) =>
    createRuntimeEventSlice(set as never, get as never, store as never),
  );
}

function row(id: string): RuntimeChatItem {
  return { id, type: "assistant_message", state: "completed", streams: {} };
}

it("trims an ordinary range while preserving named controls, identity and request state", () => {
  const store = setup();
  const control = row("control");
  const tail = row("tail");
  store.getState().hydrateThreadRuntimeItems("t", [row("old"), control, row("middle"), tail]);
  store.getState().applyRuntimeEvent("t", {
    type: "request.opened",
    threadId: "t",
    requestId: "request",
    requestType: "tool_call_approval",
    payload: { summary: "Read" },
  });
  const requests = store.getState().runtimeRequestsByThread.t;
  const version = store.getState().runtimeStructuralVersionByThread.t!;
  recordRuntimeStructuralChangeHint("t", version, new Set(["tail"]));
  store.getState().trimThreadRuntimeItems("t", 0, 3, new Set(["control"]));
  expect(store.getState().runtimeItemIdsByThread.t).toEqual(["control", "tail"]);
  expect(store.getState().runtimeItemsByIdByThread.t).toEqual({ control, tail });
  expect(store.getState().runtimeItemsByIdByThread.t!.control).toBe(control);
  expect(store.getState().runtimeRequestsByThread.t).toBe(requests);
  expect(store.getState().runtimeStructuralVersionByThread.t).toBe(version + 1);
  expect(readRuntimeStructuralChangeHint("t", version)).toBeNull();
});

it("keeps unmatched controls before pages, relocating canonical overlaps once without replacing live objects", () => {
  const store = setup();
  const control = row("control");
  store.getState().hydrateThreadRuntimeItems("t", [control, row("tail")]);
  store.getState().prependThreadRuntimeItems("t", [row("middle")], new Set(["control"]));
  expect(store.getState().runtimeItemIdsByThread.t).toEqual(["control", "middle", "tail"]);
  store
    .getState()
    .prependThreadRuntimeItems(
      "t",
      [row("before"), row("control"), row("after"), row("after")],
      new Set(["control"]),
    );
  expect(store.getState().runtimeItemIdsByThread.t).toEqual([
    "before",
    "control",
    "after",
    "middle",
    "tail",
  ]);
  expect(store.getState().runtimeItemsByIdByThread.t!.control).toBe(control);
  const ids = store.getState().runtimeItemIdsByThread.t;
  store.getState().prependThreadRuntimeItems("t", [row("before"), row("control"), row("after")]);
  expect(store.getState().runtimeItemIdsByThread.t).toBe(ids);
});
