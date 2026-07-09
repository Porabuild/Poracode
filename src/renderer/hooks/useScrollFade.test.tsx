import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import { useScrollFade } from "./useScrollFade";

describe("useScrollFade", () => {
  // Regression: a non-memoized callback ref dropped the virtualizer's scroll
  // element on every parent re-render during dnd-kit drags.
  it("returns a stable setScrollContainer identity across renders", () => {
    const { result, rerender } = renderHook(() => useScrollFade<HTMLDivElement>());
    const firstSetter = result.current.setScrollContainer;
    rerender();
    rerender();
    rerender();
    expect(result.current.setScrollContainer).toBe(firstSetter);
  });

  it("does not cycle scrollEl null→element when its host re-renders", () => {
    const observedScrollEl: Array<HTMLElement | null> = [];
    function Host({ tick }: { tick: number }) {
      const { setScrollContainer, scrollEl } = useScrollFade<HTMLDivElement>();
      observedScrollEl.push(scrollEl);
      void tick;
      return <div ref={setScrollContainer} data-testid="scroller" />;
    }
    const { rerender } = render(<Host tick={0} />);
    // After mount, parent re-renders must not push `null` back through.
    observedScrollEl.length = 0;
    rerender(<Host tick={1} />);
    rerender(<Host tick={2} />);
    rerender(<Host tick={3} />);
    expect(observedScrollEl.every((el) => el !== null)).toBe(true);
  });

  it("publishes the latest scroll element via both scrollRef and scrollEl", () => {
    const { result } = renderHook(() => useScrollFade<HTMLDivElement>());
    expect(result.current.scrollEl).toBeNull();
    expect(result.current.scrollRef.current).toBeNull();

    const el = document.createElement("div");
    act(() => result.current.setScrollContainer(el));
    expect(result.current.scrollEl).toBe(el);
    expect(result.current.scrollRef.current).toBe(el);

    act(() => result.current.setScrollContainer(null));
    expect(result.current.scrollEl).toBeNull();
    expect(result.current.scrollRef.current).toBeNull();
  });

  it("does not rewrite identical fade CSS vars on repeated scroll updates", async () => {
    const { result } = renderHook(() => useScrollFade<HTMLDivElement>({ maxFadePx: 32 }));
    const el = document.createElement("div");
    Object.defineProperties(el, {
      scrollTop: { configurable: true, get: () => 10, set: () => undefined },
      scrollHeight: { configurable: true, get: () => 400 },
      clientHeight: { configurable: true, get: () => 200 },
    });
    const setProperty = vi.spyOn(el.style, "setProperty");
    act(() => result.current.setScrollContainer(el));
    await act(async () => {
      await Promise.resolve();
    });
    const writesAfterMount = setProperty.mock.calls.length;
    expect(writesAfterMount).toBeGreaterThan(0);

    el.dispatchEvent(new Event("scroll"));
    el.dispatchEvent(new Event("scroll"));
    el.dispatchEvent(new Event("scroll"));
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(setProperty.mock.calls.length).toBe(writesAfterMount);
  });
});
