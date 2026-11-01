import { describe, expect, it } from "vitest";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { selectThreadErrorDockStates } from "@/renderer/components/thread/threadErrorState";
import type { AppStoreState } from "./shared";
import { createRuntimeEventSlice, type RuntimeEventSlice } from "./runtimeEventSlice";

function makeStore() {
  return create<RuntimeEventSlice>()(
    subscribeWithSelector((set, get, store) =>
      createRuntimeEventSlice(set as never, get as never, store as never),
    ),
  );
}

describe("warning notices", () => {
  it("keeps an unmarked warning hidden", () => {
    const store = makeStore();
    store
      .getState()
      .applyRuntimeEvents("t1", [{ type: "warning", threadId: "t1", message: "retry" }]);
    expect(store.getState().runtimeItemIdsByThread["t1"] ?? []).toEqual([]);
  });

  it("appends a notice as a warning-severity error item shown in the notice dock", () => {
    const store = makeStore();
    store.getState().applyRuntimeEvents("t1", [
      { type: "warning", threadId: "t1", message: "Config: bad key", presentation: "notice" },
      { type: "error", threadId: "t1", message: "boom" },
    ]);

    const ids = store.getState().runtimeItemIdsByThread["t1"] ?? [];
    expect(ids).toHaveLength(2);
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.[ids[0]!]).toMatchObject({
      type: "error",
      state: "completed",
      payload: { message: "Config: bad key", severity: "warning" },
    });
    expect(selectThreadErrorDockStates(store.getState() as unknown as AppStoreState, "t1")).toEqual(
      [
        { sourceItemId: ids[0], message: "Config: bad key", severity: "warning" },
        { sourceItemId: ids[1], message: "boom" },
      ],
    );
  });
});

describe("error reasons", () => {
  it("keeps the provider-reported reason on the error item and its dock state", () => {
    const store = makeStore();
    store.getState().applyRuntimeEvents("t1", [
      { type: "error", threadId: "t1", message: "token expired", reason: "auth_required" },
      { type: "error", threadId: "t1", message: "boom" },
    ]);

    const ids = store.getState().runtimeItemIdsByThread["t1"] ?? [];
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.[ids[0]!]?.payload).toEqual({
      message: "token expired",
      reason: "auth_required",
    });
    expect(store.getState().runtimeItemsByIdByThread["t1"]?.[ids[1]!]?.payload).toEqual({
      message: "boom",
    });
    expect(selectThreadErrorDockStates(store.getState() as unknown as AppStoreState, "t1")).toEqual(
      [
        { sourceItemId: ids[0], message: "token expired", reason: "auth_required" },
        { sourceItemId: ids[1], message: "boom" },
      ],
    );
  });
});
