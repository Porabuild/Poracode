import { act, render } from "@testing-library/react";
import { useCallback, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { LegendListRef } from "@legendapp/list/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { removeRootCatalogThreads } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import type { ChatTimelineEntry } from "../chatPaneSelectors";
import {
  clearTimelineMeasurementCache,
  readTimelineMeasurements,
  writeTimelineMeasurements,
} from "./timelineMeasurementCache";
import { useTimelineMeasurements } from "./useTimelineMeasurements";

const entries: ChatTimelineEntry[] = [{ kind: "item", id: "stable" }];
const observations: { target: Element; callback: ResizeObserverCallback }[] = [];
let oldFontSize: number;
beforeEach(() => {
  observations.length = 0;
  clearTimelineMeasurementCache();
  oldFontSize = useSharedSettings.getState().guiChatFontSize;
  useAppStore.setState({
    threads: [],
    view: { kind: "home" },
    runtimeItemsByIdByThread: {
      t: { stable: { id: "stable", type: "assistant_message", state: "completed", streams: {} } },
    },
  });
  useAppStore.getState().createThread({
    threadId: "t",
    projectId: "project",
    agentKind: "test-agent",
    config: { model: "auto" },
    prompt: "Measurement owner",
    focus: false,
    suppressHostCreateIntent: true,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element) {
        observations.push({ target, callback: this.callback });
      }
      disconnect() {}
    },
  );
});
afterEach(() => {
  act(() => useSharedSettings.setState({ guiChatFontSize: oldFontSize }));
  vi.unstubAllGlobals();
});

function fixture(width: number, font = "14px") {
  const sizes = new Map([["stable", 184]]);
  const readSizes = vi.fn<() => { sizes: Map<string, number> }>(() => ({ sizes }));
  const setItemSize = vi.fn<(key: string, size: { height: number; width: number }) => void>();
  const list = { getState: readSizes, setItemSize } as unknown as LegendListRef;
  const controller: { snapshot?: () => void; element?: HTMLDivElement } = {};
  function Harness({
    currentWidth,
    currentFont,
    items,
  }: {
    currentWidth: number;
    currentFont: string;
    items: readonly ChatTimelineEntry[];
  }) {
    const widthRef = useRef(currentWidth);
    const entriesRef = useRef(items);
    const listRef = useRef<LegendListRef | null>(list);
    const scrollElementRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => {
      widthRef.current = currentWidth;
      entriesRef.current = items;
    });
    const bind = useCallback((element: HTMLDivElement | null) => {
      scrollElementRef.current = element;
      if (element)
        Object.defineProperty(element, "clientWidth", {
          configurable: true,
          get: () => widthRef.current,
        });
    }, []);
    const snapshot = useTimelineMeasurements({
      threadId: "t",
      hasItems: items.length > 0,
      entriesRef,
      listRef,
      scrollElementRef,
    });
    useLayoutEffect(() => {
      controller.element = scrollElementRef.current!;
      controller.snapshot = () => snapshot(list, scrollElementRef.current!);
    });
    return <div ref={bind} style={{ "--lc-chat-font-size": currentFont } as CSSProperties} />;
  }
  const view = render(<Harness currentWidth={width} currentFont={font} items={entries} />);
  return {
    ...controller,
    setItemSize,
    readSizes,
    view,
    rerender: (w: number, f = font, items = entries) =>
      view.rerender(<Harness currentWidth={w} currentFont={f} items={items} />),
    snapshot: () => controller.snapshot!(),
    resize: () =>
      act(() => {
        for (const observation of observations.filter((o) => o.target === controller.element))
          observation.callback(
            [
              {
                target: controller.element,
                contentRect: { width: controller.element!.clientWidth },
              } as unknown as ResizeObserverEntry,
            ],
            {} as ResizeObserver,
          );
      }),
  };
}

describe("timeline measurement lifecycle", () => {
  it("restores at the first usable width and admits that restoration only once", () => {
    writeTimelineMeasurements("t", "500:14px", [{ key: "stable", index: 0, size: 184 }]);
    const f = fixture(0);
    expect(f.setItemSize).not.toHaveBeenCalled();
    f.rerender(500);
    f.resize();
    expect(f.setItemSize).toHaveBeenCalledExactlyOnceWith("stable", { height: 184, width: 500 });
    f.resize();
    expect(f.setItemSize).toHaveBeenCalledTimes(1);
  });
  it("does not read the layout signature on structural transcript updates", () => {
    const f = fixture(500);
    const computedStyle = vi.spyOn(window, "getComputedStyle");
    f.rerender(500, "14px", [...entries, { kind: "item", id: "next" }]);
    expect(computedStyle).not.toHaveBeenCalled();
    computedStyle.mockRestore();
  });
  it("does not save old offscreen heights under a resized layout signature", () => {
    const f = fixture(500);
    f.rerender(300);
    f.resize();
    f.snapshot();
    expect(readTimelineMeasurements("t", "300:14px")).toEqual([]);
    f.rerender(500);
    f.resize();
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
  });
  it("invalidates snapshots after a font-only change without viewport notification", () => {
    const f = fixture(500);
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:14px")).toHaveLength(1);
    f.rerender(500, "18px");
    act(() => useSharedSettings.setState({ guiChatFontSize: oldFontSize === 18 ? 17 : 18 }));
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:18px")).toEqual([]);
  });
  it("clears the previous snapshot when its stable item is no longer present", () => {
    const f = fixture(500);
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:14px")).toHaveLength(1);
    f.rerender(500, "14px", [{ kind: "item", id: "new-running" }]);
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
  });

  it("keeps close and remount reuse while the owning thread remains", () => {
    const first = fixture(500);
    first.snapshot();
    first.view.unmount();
    expect(readTimelineMeasurements("t", "500:14px")).toHaveLength(1);

    const second = fixture(500);
    expect(second.setItemSize).toHaveBeenCalledExactlyOnceWith("stable", {
      height: 184,
      width: 500,
    });
  });

  it("does not resave a catalog-removed owner whose runtime items remain resident", () => {
    const f = fixture(500);
    f.snapshot();
    expect(readTimelineMeasurements("t", "500:14px")).toHaveLength(1);
    act(() => removeRootCatalogThreads(["t"]));
    expect(useAppStore.getState().threads.some((thread) => thread.id === "t")).toBe(false);
    expect(useAppStore.getState().runtimeItemsByIdByThread.t?.stable).toBeDefined();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);

    f.readSizes.mockClear();
    f.snapshot();
    expect(f.readSizes).not.toHaveBeenCalled();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([]);
  });

  it("does not treat an absent metadata row as confirmed snapshot retirement", () => {
    const f = fixture(500);
    f.snapshot();
    act(() => {
      useAppStore.setState({ threads: [] });
    });
    f.readSizes.mockClear();
    f.snapshot();

    expect(f.readSizes).not.toHaveBeenCalled();
    expect(readTimelineMeasurements("t", "500:14px")).toEqual([
      { key: "stable", index: 0, size: 184 },
    ]);
  });
});
