import { act, cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { forgetRuntimeHistoryBoundary } from "@/renderer/state/runtimeHistoryBoundary";
import { useUnderfilledHistory } from "./useUnderfilledHistory";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetRuntimeHistoryBoundary("pending-history");
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeHydrationStatus: {} });
});

it("continues after collapsed rows finish committing their smaller height", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn<typeof cancelAnimationFrame>());
  let scrollHeight = 900;
  const onStartReached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  let notifyContentHeight!: () => void;
  function Reader() {
    const ref = useRef<HTMLDivElement>(null);
    const history = useUnderfilledHistory({
      threadId: "pending-history",
      oldestVisibleEntryId: "collapsed-group",
      scrollElementRef: ref,
      onStartReached,
      onContentHeightChange: undefined,
    });
    useLayoutEffect(() => {
      notifyContentHeight = history.notifyContentHeight;
    }, [history.notifyContentHeight]);
    return (
      <div
        ref={(element) => {
          ref.current = element;
          if (element)
            Object.defineProperties(element, {
              clientHeight: { value: 776 },
              scrollHeight: { get: () => scrollHeight },
            });
        }}
      />
    );
  }
  const view = render(<Reader />);
  act(notifyContentHeight);
  expect(onStartReached).not.toHaveBeenCalled();
  scrollHeight = 776;
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(onStartReached).toHaveBeenCalledOnce();
  // A failed boundary stays latched across further layout notifications.
  act(notifyContentHeight);
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(onStartReached).toHaveBeenCalledOnce();
  act(notifyContentHeight);
  view.unmount();
  expect(cancelAnimationFrame).toHaveBeenCalled();
});

it("rechecks a short history when its viewport becomes visible without changing rows", async () => {
  const frames: FrameRequestCallback[] = [];
  const observers: Array<{
    callback: ResizeObserverCallback;
    observe: ReturnType<typeof vi.fn<ResizeObserver["observe"]>>;
  }> = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn<typeof cancelAnimationFrame>());
  const disconnect = vi.fn<ResizeObserver["disconnect"]>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn<ResizeObserver["observe"]>();
      disconnect = disconnect;
      constructor(callback: ResizeObserverCallback) {
        observers.push({ callback, observe: this.observe });
      }
    },
  );
  let height = 0;
  const onStartReached = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
  function Reader() {
    const ref = useRef<HTMLDivElement>(null);
    useUnderfilledHistory({
      threadId: "pending-history",
      oldestVisibleEntryId: "collapsed-group",
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
              clientHeight: { get: () => height },
              scrollHeight: { value: 776 },
            });
        }}
      />
    );
  }
  const view = render(<Reader />);
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(onStartReached).not.toHaveBeenCalled();
  height = 776;
  const observer = observers[0];
  expect(observer).toBeDefined();
  expect(observer!.observe).toHaveBeenCalledWith(view.container.firstElementChild);
  await act(async () => {
    observer!.callback([], {} as ResizeObserver);
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(onStartReached).toHaveBeenCalledOnce();
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
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
  await act(() =>
    useAppStore.setState({ runtimeItemIdsByThread: { [threadId]: ["hidden-child"] } }),
  );
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
