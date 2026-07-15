import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSmoothStreamedText } from "./useSmoothStreamedText";

function mediaQueryList(query: string, matches: boolean): MediaQueryList {
  return {
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
  };
}

describe("useSmoothStreamedText", () => {
  let nextFrameId: number;
  let frames: Map<number, FrameRequestCallback>;

  beforeEach(() => {
    nextFrameId = 1;
    frames = new Map();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      frames.delete(id);
    });
    vi.spyOn(window, "matchMedia").mockImplementation((query) => mediaQueryList(query, false));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function flushFrame(now: number): void {
    const pending = [...frames.values()];
    frames.clear();
    act(() => {
      for (const callback of pending) callback(now);
    });
  }

  it("does not query reduced motion when text is not streaming", () => {
    renderHook(() => useSmoothStreamedText("Complete", false));

    expect(window.matchMedia).not.toHaveBeenCalled();
  });

  it("reuses one reduced-motion query throughout a stream", () => {
    const initial = "Ready: ";
    const { rerender } = renderHook(({ text }) => useSmoothStreamedText(text, true), {
      initialProps: { text: initial },
    });

    rerender({ text: `${initial}${"streamed text ".repeat(20)}` });
    for (let frame = 0; frame < 8; frame += 1) flushFrame(1_000 + frame * 16);

    expect(window.matchMedia).toHaveBeenCalledTimes(1);
  });

  it("reveals appended streaming text progressively across animation frames", () => {
    const initial = "Ready: ";
    const target = `${initial}${"streamed text ".repeat(20)}`;
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: initial, streaming: true } },
    );

    rerender({ text: target, streaming: true });
    expect(result.current).toBe(initial);

    const lengths: number[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      flushFrame(1_000 + frame * 16);
      lengths.push(result.current.length);
    }

    expect(lengths.some((length) => length > initial.length && length < target.length)).toBe(true);
    expect(lengths.every((length, index) => index === 0 || length >= lengths[index - 1]!)).toBe(
      true,
    );

    for (let frame = 8; frame < 80 && frames.size > 0; frame += 1) {
      flushFrame(1_000 + frame * 16);
    }
    expect(result.current).toBe(target);
    expect(frames.size).toBe(0);
  });

  it("shows the full text immediately when streaming completes", () => {
    const initial = "Start ";
    const target = `${initial}${"remaining ".repeat(30)}`;
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: initial, streaming: true } },
    );

    rerender({ text: target, streaming: true });
    flushFrame(1_000);
    flushFrame(1_016);
    expect(result.current.length).toBeLessThan(target.length);

    rerender({ text: target, streaming: false });
    expect(result.current).toBe(target);
    expect(frames.size).toBe(0);
  });

  it("finishes a large burst without leaving a one-character tail", () => {
    const initial = "Start ";
    const target = `${initial}${"streamed text ".repeat(300)}`;
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: initial, streaming: true } },
    );

    rerender({ text: target, streaming: true });
    for (let frame = 0; frame < 600 && frames.size > 0; frame += 1) {
      flushFrame(1_000 + frame * 8);
    }

    expect(result.current).toBe(target);
    expect(frames.size).toBe(0);
  });

  it("snaps to non-append replacements instead of animating stale text", () => {
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: "Original", streaming: true } },
    );

    rerender({ text: `Original${" backlog".repeat(20)}`, streaming: true });
    flushFrame(1_000);
    rerender({ text: "Replacement", streaming: true });

    expect(result.current).toBe("Replacement");
    expect(frames.size).toBe(0);
  });

  it("does not animate when reduced motion is enabled", () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => mediaQueryList(query, true));
    const { result, rerender } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: "Before", streaming: true } },
    );

    rerender({ text: "Before and after", streaming: true });

    expect(result.current).toBe("Before and after");
    expect(frames.size).toBe(0);
  });

  it("cancels its pending frame when unmounted", () => {
    const { rerender, unmount } = renderHook(
      ({ text, streaming }) => useSmoothStreamedText(text, streaming),
      { initialProps: { text: "Before", streaming: true } },
    );

    rerender({ text: `Before${" more".repeat(20)}`, streaming: true });
    expect(frames.size).toBe(1);
    unmount();
    expect(frames.size).toBe(0);
  });
});
