import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ReasoningInline } from "./ReasoningInline";

function mediaQueryList(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn<MediaQueryList["addEventListener"]>(),
    removeEventListener: vi.fn<MediaQueryList["removeEventListener"]>(),
    addListener: vi.fn<MediaQueryList["addListener"]>(),
    removeListener: vi.fn<MediaQueryList["removeListener"]>(),
    dispatchEvent: vi.fn<MediaQueryList["dispatchEvent"]>(() => false),
  };
}

describe("ReasoningInline", () => {
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
    vi.spyOn(window, "matchMedia").mockImplementation(mediaQueryList);
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

  it("reveals appended Thinking preview text progressively", () => {
    const initial = "Checking the i18n provider";
    const target = `${initial} and the landing FAQ for all the pieces`;
    const view = renderInline(makeReasoningItem(initial));
    const preview = getPreview(view.container);

    expect(preview).toHaveTextContent(initial);

    view.rerender(
      <AppProvider>
        <ReasoningInline item={makeReasoningItem(target)} />
      </AppProvider>,
    );

    expect(preview).toHaveTextContent(initial);
    expect(preview).not.toHaveTextContent(target);

    flushFrame(1_000);
    flushFrame(1_016);
    flushFrame(1_032);

    expect(preview.textContent!.length).toBeGreaterThan(initial.length);
    expect(preview.textContent!.length).toBeLessThan(target.length);

    for (let frame = 3; frame < 80 && frames.size > 0; frame += 1) {
      flushFrame(1_000 + frame * 16);
    }

    expect(preview).toHaveTextContent(target);
  });
});

function renderInline(item: RuntimeChatItem) {
  return render(
    <AppProvider>
      <ReasoningInline item={item} />
    </AppProvider>,
  );
}

function getPreview(container: HTMLElement): HTMLElement {
  const preview = container.querySelector<HTMLElement>("span.truncate.italic");
  if (!preview) throw new Error("missing inline reasoning preview");
  return preview;
}

function makeReasoningItem(text: string): RuntimeChatItem {
  return {
    id: "reasoning-1",
    type: "reasoning",
    state: "updated",
    streams: { reasoning_text: text },
  };
}
