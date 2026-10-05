import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import { renderWithI18n } from "@/renderer/testUtils/i18n";
import { ChatScrollControls, type ChatScrollControlsHandle } from "./ChatScrollControls";

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: (
    selector: (state: { chatScrollToBottomTokens: Record<string, number> }) => unknown,
  ) => selector({ chatScrollToBottomTokens: {} }),
}));
vi.mock("@/renderer/state/panelResizeSignal", () => ({
  isPanelResizing: () => false,
  subscribePanelResize: () => () => undefined,
}));

afterEach(() => vi.restoreAllMocks());

function fixture() {
  let now = 1_000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  let height = 1_000;
  let top = 800;
  const element = document.createElement("div");
  const readHeight = vi.fn<() => number>(() => height);
  const readViewport = vi.fn<() => number>(() => 200);
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, get: readHeight },
    clientHeight: { configurable: true, get: readViewport },
    scrollTop: {
      configurable: true,
      get: () => top,
      set: (value: number) => {
        top = Math.max(0, Math.min(value, height - 200));
      },
    },
  });
  const controls = createRef<ChatScrollControlsHandle>();
  const view = renderWithI18n(
    <ChatScrollControls
      ref={controls}
      scrollRef={{ current: element }}
      contentRef={{ current: null }}
      layoutChangeToken={null}
      tailEntryId="tail"
      threadId="thread"
      tailLoaderVisible={false}
      initialScrollSettled
      initialScrollRevealDelayMs={0}
      virtualScrollToBottomRef={{ current: () => undefined }}
      onInitialScrollSettled={() => undefined}
    />,
  );
  now = 2_000;
  return {
    controls,
    element,
    readHeight,
    readViewport,
    view,
    setHeight: (value: number) => {
      height = value;
    },
    setTop: (value: number) => {
      top = value;
    },
    advance: () => {
      now += 100;
    },
    top: () => top,
    resetReads: () => {
      readHeight.mockClear();
      readViewport.mockClear();
    },
  };
}

describe("direct bottom-pin scroll acknowledgements", () => {
  it("avoids geometry reads and still releases on an untagged upward thumb drag", () => {
    const f = fixture();
    f.setHeight(1_200);
    act(() => f.controls.current?.onContentHeightChange());
    expect(f.top()).toBe(1_000);
    f.resetReads();
    act(() => {
      fireEvent.scroll(f.element);
    });
    expect(f.readHeight).not.toHaveBeenCalled();
    expect(f.readViewport).not.toHaveBeenCalled();
    f.advance();
    f.setTop(900);
    act(() => {
      fireEvent.scroll(f.element);
    });
    expect(f.readHeight).toHaveBeenCalled();
    expect(f.readViewport).toHaveBeenCalled();
    expect(f.controls.current?.isStickToBottom()).toBe(false);
    f.view.unmount();
  });

  it("still pins a resize after an acknowledged write", () => {
    const f = fixture();
    f.setHeight(1_200);
    act(() => f.controls.current?.onContentHeightChange());
    act(() => {
      fireEvent.scroll(f.element);
    });
    f.setHeight(1_400);
    act(() => f.controls.current?.onContentHeightChange());
    expect(f.top()).toBe(1_200);
    expect(f.controls.current?.isStickToBottom()).toBe(true);
    f.view.unmount();
  });

  it("reads geometry for an externally tagged move and preserves the next thumb drag", () => {
    const f = fixture();
    f.setHeight(1_400);
    f.setTop(1_000);
    act(() => {
      f.controls.current?.noteProgrammaticScroll(1_000);
      fireEvent.scroll(f.element);
    });
    f.advance();
    f.setTop(900);
    act(() => {
      fireEvent.scroll(f.element);
    });
    expect(f.controls.current?.isStickToBottom()).toBe(false);
    f.view.unmount();
  });

  it("honors a height clamp before acknowledgement and the next upward thumb drag", () => {
    const f = fixture();
    f.setHeight(1_200);
    act(() => f.controls.current?.onContentHeightChange());
    f.setHeight(1_000);
    f.setTop(800);
    f.resetReads();
    act(() => {
      fireEvent.scroll(f.element);
    });
    expect(f.readHeight).toHaveBeenCalled();
    expect(f.controls.current?.isStickToBottom()).toBe(true);
    f.advance();
    f.setTop(700);
    act(() => {
      fireEvent.scroll(f.element);
    });
    expect(f.controls.current?.isStickToBottom()).toBe(false);
    f.view.unmount();
  });
});
