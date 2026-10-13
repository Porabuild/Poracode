import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "./appStore";
import { useThreadRuntimeItem } from "./useThreadRuntimeItem";

vi.mock("./dbStorage", () => ({
  createDbStorage: () => ({ getItem: () => null, setItem() {}, removeItem() {} }),
}));

describe("useThreadRuntimeItem", () => {
  beforeEach(() => {
    useAppStore.setState({ runtimeItemsByIdByThread: {}, runtimeItemIdsByThread: {} });
  });

  it("keeps live item data correct across navigation, background updates and recovery", () => {
    const start = (threadId: string) =>
      useAppStore.getState().applyRuntimeEvent(threadId, {
        type: "item.started",
        threadId,
        itemId: "item",
        itemType: "assistant_message",
      });
    start("a");
    start("b");
    let renders = 0;
    const { result, rerender } = renderHook(
      ({ threadId }) => {
        renders++;
        return useThreadRuntimeItem(threadId, "item");
      },
      { initialProps: { threadId: "a" } },
    );
    const initial = result.current;
    const initialRenders = renders;
    act(() =>
      useAppStore.getState().applyRuntimeEvent("b", {
        type: "content.delta",
        threadId: "b",
        itemId: "item",
        stream: "assistant_text",
        delta: "background",
      }),
    );
    expect(result.current).toBe(initial);
    expect(renders).toBe(initialRenders);

    rerender({ threadId: "b" });
    expect(result.current?.streams.assistant_text).toBe("background");
    act(() =>
      useAppStore.getState().applyRuntimeEvent("b", {
        type: "item.completed",
        threadId: "b",
        itemId: "item",
      }),
    );
    expect(result.current?.state).toBe("completed");
    act(() => {
      useAppStore.getState().clearThreadRuntimeEvents("b");
    });
    expect(result.current).toBeUndefined();
    act(() => start("b"));
    expect(result.current?.state).toBe("started");
  });
});
