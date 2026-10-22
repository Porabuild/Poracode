import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { StickyPrompt } from "./StickyPrompt";

const THREAD_ID = "thread-1";
const ROW_HEIGHT = 100;

const ENTRIES: ChatTimelineEntry[] = [
  { kind: "item", id: "prompt-1" },
  { kind: "item", id: "reply-1" },
  { kind: "item", id: "prompt-2" },
  { kind: "item", id: "reply-2" },
  { kind: "item", id: "reply-2b" },
];

function message(id: string, type: "user_message" | "assistant_message", text: string) {
  return {
    id,
    type,
    state: "completed",
    payload: { content: [{ kind: "text", text }] },
    streams: {},
  } satisfies RuntimeChatItem;
}

/**
 * A scroller whose rows are stacked ROW_HEIGHT apart. Moving `scrollTop` shifts
 * every row's client rect the way a real scroll would.
 */
function createScroller() {
  const scroller = document.createElement("div");
  let scrollTop = 0;
  scroller.getBoundingClientRect = () => new DOMRect(0, 0, 400, 2 * ROW_HEIGHT);
  ENTRIES.forEach((entry, index) => {
    const row = document.createElement("div");
    row.dataset.chatVirtualRow = "true";
    row.dataset.index = String(index);
    row.dataset.itemId = entry.id;
    row.getBoundingClientRect = () =>
      new DOMRect(0, index * ROW_HEIGHT - scrollTop, 400, ROW_HEIGHT);
    if (entry.id.startsWith("prompt-")) {
      const prompt = document.createElement("div");
      prompt.dataset.userMessage = "true";
      prompt.getBoundingClientRect = row.getBoundingClientRect;
      row.append(prompt);
    }
    scroller.append(row);
  });
  document.body.append(scroller);
  const scrollTo = (next: number) => {
    scrollTop = next;
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
      vi.runAllTimers();
    });
  };
  return { scroller, scrollTo };
}

function renderStickyPrompt(
  scroller: HTMLDivElement,
  props: Partial<Parameters<typeof StickyPrompt>[0]> = {},
) {
  const onScrollToEntry = vi.fn<(index: number) => void>();
  const result = render(
    <AppProvider>
      <StickyPrompt
        threadId={THREAD_ID}
        entries={ENTRIES}
        scrollElement={scroller}
        isEnabled
        onScrollToEntry={onScrollToEntry}
        {...props}
      />
    </AppProvider>,
  );
  act(() => {
    vi.runAllTimers();
  });
  return { ...result, onScrollToEntry };
}

describe("StickyPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    useChatFindStore.setState({ activeThreadId: null });
    useAppStore.setState({
      runtimeItemsByIdByThread: {
        [THREAD_ID]: {
          "prompt-1": message("prompt-1", "user_message", "First question"),
          "reply-1": message("reply-1", "assistant_message", "First answer"),
          "prompt-2": message("prompt-2", "user_message", "Second\nquestion"),
          "reply-2": message("reply-2", "assistant_message", "Second answer"),
          "reply-2b": message("reply-2b", "assistant_message", "More"),
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("stays hidden while the prompt for the visible content is on screen", () => {
    const { scroller, scrollTo } = createScroller();
    renderStickyPrompt(scroller);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    scrollTo(2 * ROW_HEIGHT - 12);
    expect(screen.getByRole("button", { name: "Scroll to prompt: First question" })).toBeVisible();
    scrollTo(2 * ROW_HEIGHT);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the prompt the visible content answers once it scrolls away", () => {
    const { scroller, scrollTo } = createScroller();
    const { onScrollToEntry } = renderStickyPrompt(scroller);

    scrollTo(ROW_HEIGHT);
    expect(screen.getByRole("button", { name: "Scroll to prompt: First question" })).toBeVisible();

    scrollTo(3 * ROW_HEIGHT);
    const button = screen.getByRole("button", { name: "Scroll to prompt: Second question" });
    expect(button).toHaveTextContent("Second question");

    fireEvent.click(button);
    expect(onScrollToEntry).toHaveBeenCalledWith(2);
  });

  it("keeps an 8px gap as the next prompt pushes the previous sticky prompt out", () => {
    const { scroller, scrollTo } = createScroller();
    renderStickyPrompt(scroller);
    scrollTo(ROW_HEIGHT);
    const button = screen.getByRole("button", { name: "Scroll to prompt: First question" });
    const bar = button.parentElement!;
    const wrapper = bar.parentElement!;
    wrapper.style.paddingTop = "8px";
    Object.defineProperty(bar, "offsetHeight", { configurable: true, value: 28 });

    scrollTo(2 * ROW_HEIGHT - 50);
    expect(bar.style.transform).toBe("translateY(0px)");
    scrollTo(2 * ROW_HEIGHT - 40);
    expect(bar.style.transform).toBe("translateY(-4px)");
    scrollTo(2 * ROW_HEIGHT - 20);
    expect(bar.style.transform).toBe("translateY(-24px)");
    scrollTo(2 * ROW_HEIGHT);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    scrollTo(3 * ROW_HEIGHT);
    expect(screen.getByRole("button", { name: "Scroll to prompt: Second question" })).toBeVisible();
  });

  it("updates the handoff when row layout changes without scrolling", () => {
    let notifyResize: () => void = () => undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          notifyResize = () => callback([], this);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const { scroller, scrollTo } = createScroller();
    renderStickyPrompt(scroller);
    scrollTo(ROW_HEIGHT);
    const bar = screen.getByRole("button", {
      name: "Scroll to prompt: First question",
    }).parentElement!;
    bar.parentElement!.style.paddingTop = "8px";
    Object.defineProperty(bar, "offsetHeight", { configurable: true, value: 28 });
    const nextPrompt = scroller.querySelector<HTMLElement>(
      '[data-item-id="prompt-2"] [data-user-message]',
    )!;
    let nextTop = 20;
    nextPrompt.getBoundingClientRect = () => new DOMRect(0, nextTop, 400, ROW_HEIGHT);
    scrollTo(2 * ROW_HEIGHT - 20);
    expect(bar.style.transform).toBe("translateY(-24px)");
    nextTop = 60;
    act(() => {
      notifyResize();
      vi.runAllTimers();
    });
    expect(bar.style.transform).toBe("translateY(0px)");
  });

  it("hides while Find in chat is open for the thread", () => {
    const { scroller, scrollTo } = createScroller();
    renderStickyPrompt(scroller);
    scrollTo(3 * ROW_HEIGHT);
    expect(screen.getByRole("button")).toBeInTheDocument();

    act(() => useChatFindStore.setState({ activeThreadId: THREAD_ID }));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("stays hidden until the transcript finishes its initial scroll", () => {
    const { scroller, scrollTo } = createScroller();
    renderStickyPrompt(scroller, { isEnabled: false });
    scrollTo(3 * ROW_HEIGHT);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
