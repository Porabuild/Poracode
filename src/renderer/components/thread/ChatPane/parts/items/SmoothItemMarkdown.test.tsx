import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SmoothItemMarkdown } from "./ItemMarkdown";

// Observe actual wrapper/hook display updates without lazy Markdown transforms.
vi.mock("@/renderer/deferredFeatures", () => ({
  DeferredItemMarkdownInner: ({ text }: { text: string }) => (
    <div data-testid="markdown">{text}</div>
  ),
}));

describe("rich chat reveal cadence", () => {
  let frames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;

  beforeEach(() => {
    frames = new Map();
    nextFrameId = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameId++;
      frames.set(id, callback);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
      removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      addListener: vi.fn<MediaQueryList["addListener"]>(),
      removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
    }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function frame(now: number) {
    const pending = [...frames.values()];
    frames.clear();
    act(() => {
      for (const callback of pending) callback(now);
    });
  }

  it("bounds rich updates on a high-refresh display and flushes exact completion", () => {
    const start = "## Start\n";
    const target = start + "**🌍 bold** _italic_\n".repeat(300);
    const view = render(<SmoothItemMarkdown text={start} isStreaming />);
    view.rerender(<SmoothItemMarkdown text={target} isStreaming />);
    const emissions: number[] = [];
    let previous = start;
    for (let tick = 0; tick < 120; tick += 1) {
      const now = 1_000 + (tick * 1_000) / 120;
      frame(now);
      const text = view.getByTestId("markdown").textContent!;
      expect(target.startsWith(text)).toBe(true);
      expect(text.length).toBeGreaterThanOrEqual(previous.length);
      if (text !== previous) emissions.push(now);
      previous = text;
    }
    expect(emissions.length).toBeGreaterThan(20);
    expect(emissions.length).toBeLessThanOrEqual(31);
    for (let i = 1; i < emissions.length; i += 1)
      expect(emissions[i]! - emissions[i - 1]!).toBeGreaterThanOrEqual(32);
    expect(previous.length).toBeLessThan(target.length);
    view.rerender(<SmoothItemMarkdown text={target} isStreaming={false} />);
    expect(view.getByTestId("markdown").textContent).toBe(target);
    expect(frames.size).toBe(0);
  });

  it("immediately replaces, shrinks and clears during an active stream", () => {
    const view = render(<SmoothItemMarkdown text="## Initial\n" isStreaming />);
    view.rerender(<SmoothItemMarkdown text={"## Initial\n" + "body ".repeat(200)} isStreaming />);
    frame(1_000);
    for (const text of ["**Replaced**\n", "**R", ""]) {
      view.rerender(<SmoothItemMarkdown text={text} isStreaming />);
      expect(view.getByTestId("markdown").textContent).toBe(text);
      expect(frames.size).toBe(0);
    }
  });

  it("bypasses cadence for reduced motion and cancels pending work on unmount", () => {
    vi.mocked(window.matchMedia).mockImplementation((query) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
      removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
      addListener: vi.fn<MediaQueryList["addListener"]>(),
      removeListener: vi.fn<MediaQueryList["removeListener"]>(),
      dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
    }));
    const view = render(<SmoothItemMarkdown text="## H\n" isStreaming />);
    const target = "## H\n**All text**\ud83c\udf0d\n";
    view.rerender(<SmoothItemMarkdown text={target} isStreaming />);
    expect(view.getByTestId("markdown").textContent).toBe(target);
    expect(frames.size).toBe(0);
    view.unmount();
    vi.mocked(window.matchMedia).mockRestore();
    const normal = render(<SmoothItemMarkdown text="**A**" isStreaming />);
    normal.rerender(<SmoothItemMarkdown text={"**A**" + " body".repeat(50)} isStreaming />);
    expect(frames.size).toBe(1);
    normal.unmount();
    expect(frames.size).toBe(0);
  });
});
