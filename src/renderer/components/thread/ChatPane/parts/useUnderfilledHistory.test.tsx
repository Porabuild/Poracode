import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { forgetRuntimeHistoryBoundary } from "@/renderer/state/runtimeHistoryBoundary";
import { useUnderfilledHistory } from "./useUnderfilledHistory";

afterEach(() => {
  cleanup();
  forgetRuntimeHistoryBoundary("pending-history");
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeHydrationStatus: {} });
});
it("waits for initial hydration admission before paging a committed hidden row", async () => {
  const threadId = "pending-history";
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeHydrationStatus: { [threadId]: "pending" },
  });
  const onStartReached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  function Reader() {
    const ref = useRef<HTMLDivElement>(null);
    useUnderfilledHistory({
      threadId,
      oldestVisibleEntryId: undefined,
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
              clientHeight: { value: 776 },
              scrollHeight: { value: 776 },
            });
        }}
      />
    );
  }
  render(<Reader />);
  act(() => useAppStore.setState({ runtimeItemIdsByThread: { [threadId]: ["hidden-child"] } }));
  expect(onStartReached).not.toHaveBeenCalled();
  await act(async () => {
    useAppStore.getState().setRuntimeHydrationStatus(threadId, null);
    await Promise.resolve();
  });
  expect(onStartReached).toHaveBeenCalledOnce();
  await act(async () => {
    useAppStore.setState({ runtimeItemIdsByThread: { [threadId]: ["hidden-child", "live-tail"] } });
    await Promise.resolve();
  });
  expect(onStartReached).toHaveBeenCalledOnce();
});
