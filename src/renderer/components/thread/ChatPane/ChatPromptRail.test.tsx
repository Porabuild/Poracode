import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import type { PersistedPromptIndex } from "@/shared/ipc";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { ChatPromptRail } from "./ChatPromptRail";

const { readThreadPromptIndex } = vi.hoisted(() => ({
  readThreadPromptIndex: vi.fn<
    (threadId: string, signal?: AbortSignal) => Promise<PersistedPromptIndex | null>
  >(async () => null),
}));
vi.mock("@/renderer/state/threadPromptIndex", () => ({
  threadPromptIndexOwner: () => "host",
  readCachedThreadPromptIndex: () => undefined,
  readThreadPromptIndex,
}));

/** A media query list that answers `matches` and ignores subscriptions. */
const mediaQueryList = (media: string, matches: boolean) => ({
  matches,
  media,
  onchange: null,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  addListener: () => undefined,
  removeListener: () => undefined,
  dispatchEvent: () => false,
});

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

function setItems(items: RuntimeChatItem[]) {
  useAppStore.setState({
    runtimeItemsByIdByThread: {
      [THREAD_ID]: Object.fromEntries(items.map((item) => [item.id, item])),
    },
  });
}

/**
 * A scroller whose rows are stacked ROW_HEIGHT apart. Moving `scrollTop` shifts
 * every row's client rect the way a real scroll would; `setEntries` rebuilds the
 * rows the way the virtualizer renumbers them when a page is prepended.
 */
function createScroller(initial: readonly ChatTimelineEntry[] = ENTRIES) {
  const scroller = document.createElement("div");
  let scrollTop = 0;
  scroller.getBoundingClientRect = () => new DOMRect(100, 0, 1000, 2 * ROW_HEIGHT);
  const setEntries = (entries: readonly ChatTimelineEntry[]) => {
    scroller.replaceChildren(
      ...entries.map((entry, index) => {
        const row = document.createElement("div");
        row.dataset.chatVirtualRow = "true";
        row.dataset.index = String(index);
        row.dataset.itemId = entry.id;
        row.getBoundingClientRect = () =>
          new DOMRect(0, index * ROW_HEIGHT - scrollTop, 400, ROW_HEIGHT);
        return row;
      }),
    );
  };
  setEntries(initial);
  // The rail portals into the thread pane that hosts the transcript.
  const pane = document.createElement("div");
  pane.dataset.poracodeThreadPane = "";
  pane.getBoundingClientRect = () => new DOMRect(0, 0, 1200, 800);
  pane.append(scroller);
  document.body.append(pane);
  const scrollTo = (next: number) => {
    scrollTop = next;
    act(() => {
      scroller.dispatchEvent(new Event("scroll"));
      vi.runAllTimers();
    });
  };
  return { scroller, scrollTo, setEntries };
}

function railElement(
  scroller: HTMLDivElement,
  props: Partial<Parameters<typeof ChatPromptRail>[0]> = {},
) {
  return (
    <AppProvider>
      <ChatPromptRail
        threadId={THREAD_ID}
        entries={ENTRIES}
        scrollElement={scroller}
        isEnabled
        pendingPromptId={null}
        onJumpToPrompt={vi.fn<(itemId: string) => void>()}
        {...props}
      />
    </AppProvider>
  );
}

async function renderRail(
  scroller: HTMLDivElement,
  props: Partial<Parameters<typeof ChatPromptRail>[0]> = {},
) {
  const onJumpToPrompt = vi.fn<(itemId: string) => void>();
  const result = render(railElement(scroller, { onJumpToPrompt, ...props }));
  act(() => {
    vi.runAllTimers();
  });
  await flushIndex();
  return { ...result, onJumpToPrompt };
}

/** Lets the mocked host index resolve and the rail apply it. */
const flushIndex = () =>
  act(async () => {
    await Promise.resolve();
  });

/** An index listing two prompts older than the loaded transcript. */
const OLDER_INDEX: PersistedPromptIndex = {
  prompts: [
    { itemId: "old-1", position: 0, text: "Oldest question\nwith a second line" },
    { itemId: "old-2", position: 2, text: "Older question" },
    { itemId: "prompt-1", position: 4, text: "First question" },
    { itemId: "prompt-2", position: 6, text: "Second question" },
  ],
  truncated: false,
};

const tickLabels = () =>
  screen.getAllByRole("button").map((tick) => tick.getAttribute("aria-label"));

/** Reports once as soon as it observes, the way a real ResizeObserver does. */
class ImmediateResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    this.callback();
  }
  unobserve() {}
  disconnect() {}
}

describe("ChatPromptRail", () => {
  beforeEach(() => {
    readThreadPromptIndex.mockReset();
    readThreadPromptIndex.mockResolvedValue(null);
    vi.stubGlobal("ResizeObserver", ImmediateResizeObserver);
    vi.stubGlobal("matchMedia", (query: string) => mediaQueryList(query, query.includes("fine")));
    vi.useFakeTimers({
      toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"],
    });
    useChatFindStore.setState({ activeThreadId: null });
    setItems([
      message("prompt-1", "user_message", "First question"),
      message("reply-1", "assistant_message", "First answer"),
      message("prompt-2", "user_message", "Second question"),
      message("reply-2", "assistant_message", "Working on it"),
      message(
        "reply-2b",
        "assistant_message",
        "Final **second**\nanswer with [a link](https://x.dev)",
      ),
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("first shows the complete prompt index without waiting for a new runtime item", async () => {
    let complete!: (index: PersistedPromptIndex) => void;
    readThreadPromptIndex.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const { scroller } = createScroller();
    render(railElement(scroller));
    expect(screen.queryByRole("button")).toBeNull();
    await act(async () => {
      complete(OLDER_INDEX);
    });
    expect(tickLabels()).toEqual([
      "Scroll to prompt: Oldest question with a second line",
      "Scroll to prompt: Older question",
      "Scroll to prompt: First question",
      "Scroll to prompt: Second question",
    ]);
  });

  it("draws one tick per prompt and marks the one the last visible row answers", async () => {
    const { scroller, scrollTo } = createScroller();
    await renderRail(scroller);

    expect(tickLabels()).toEqual([
      "Scroll to prompt: First question",
      "Scroll to prompt: Second question",
    ]);
    expect(screen.getAllByRole("button")[0]).toHaveAttribute("aria-current", "true");

    // The next prompt only grazes the bottom edge, so it is not visible yet.
    scrollTo(1);
    expect(screen.getAllByRole("button")[0]).toHaveAttribute("aria-current", "true");

    // Both prompts are visible; emphasize the lower one, even partially shown.
    scrollTo(ROW_HEIGHT / 2);
    const [first, second] = screen.getAllByRole("button");
    expect(first).not.toHaveAttribute("aria-current");
    expect(second).toHaveAttribute("aria-current", "true");
    expect(first!.firstElementChild).toHaveStyle({ transform: "scaleX(0.5)" });
    expect(second!.firstElementChild).toHaveStyle({ transform: "scaleX(0.667)" });

    scrollTo(3 * ROW_HEIGHT);
    expect(screen.getAllByRole("button")[1]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("button")[0]).not.toHaveAttribute("aria-current");

    scrollTo(0);
    expect(screen.getAllByRole("button")[0]).toHaveAttribute("aria-current", "true");
    expect(screen.getAllByRole("button")[1]).not.toHaveAttribute("aria-current");
  });

  it("moves the browsed window by wheel distance, not by event count", async () => {
    readThreadPromptIndex.mockResolvedValue({
      prompts: [
        ...Array.from({ length: 60 }, (_, index) => ({
          itemId: `old-${index}`,
          position: index * 2,
          text: `Old question ${index}`,
        })),
        { itemId: "prompt-1", position: 200, text: "First question" },
        { itemId: "prompt-2", position: 202, text: "Second question" },
      ],
      truncated: false,
    });
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();
    const labels = () =>
      screen.getAllByRole("button").map((tick) => tick.getAttribute("aria-label"));
    const before = labels();

    // 30 trackpad events of 1px are 30px: less than one tick, so nothing moves.
    for (let event = 0; event < 30; event += 1) {
      act(() => {
        screen
          .getByRole("toolbar")
          .dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }));
      });
    }
    expect(labels()).toEqual(before);
  });

  it("keeps a single tab stop on the active tick", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller);
    const [first, second] = screen.getAllByRole("button");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(second).toHaveAttribute("tabindex", "-1");
  });

  it("scrolls to the prompt of the pressed tick", async () => {
    const { scroller } = createScroller();
    const { onJumpToPrompt } = await renderRail(scroller);

    fireEvent.click(screen.getByRole("button", { name: "Scroll to prompt: Second question" }));
    expect(onJumpToPrompt).toHaveBeenCalledWith("prompt-2");
  });

  it("previews the prompt and its final reply as plain text while a tick is hovered", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller);
    const tick = screen.getByRole("button", { name: "Scroll to prompt: Second question" });

    expect(screen.queryByText(/Final second/)).not.toBeInTheDocument();
    fireEvent.pointerEnter(tick);
    expect(screen.getByText("Final second answer with a link")).toBeInTheDocument();
    expect(screen.queryByText("Working on it")).not.toBeInTheDocument();
  });

  it("closes the preview only after a short grace period", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller);
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Scroll to prompt: Second question" }),
    );

    fireEvent.pointerLeave(screen.getByRole("toolbar"));
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByText("Final second answer with a link")).toBeInTheDocument();

    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Scroll to prompt: First question" }),
    );
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("First answer")).toBeInTheDocument();

    fireEvent.pointerLeave(screen.getByRole("toolbar"));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("First answer")).not.toBeInTheDocument();
  });

  it("moves focus between ticks with the arrow keys and previews the focused one", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller);
    const [first, second] = screen.getAllByRole("button");

    first!.focus();
    fireEvent.keyDown(first!, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    expect(screen.getByText("Final second answer with a link")).toBeInTheDocument();

    fireEvent.keyDown(second!, { key: "ArrowUp" });
    expect(first).toHaveFocus();
  });

  it("slides the tick window with the arrow keys instead of focusing a clipped tick", async () => {
    readThreadPromptIndex.mockResolvedValue({
      prompts: [
        ...Array.from({ length: 60 }, (_, index) => ({
          itemId: `old-${index}`,
          position: index * 2,
          text: `Old question ${index}`,
        })),
        { itemId: "prompt-1", position: 200, text: "First question" },
        { itemId: "prompt-2", position: 202, text: "Second question" },
      ],
      truncated: false,
    });
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();

    // 62 prompts, the last one active: 24 ticks show, so 40 steps up leaves the window.
    const active = screen.getByRole("button", { name: /Second question/ });
    active.focus();
    for (let step = 0; step < 40; step += 1) {
      fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    }

    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Scroll to prompt: Old question 21",
    );
    expect(screen.getByText("Old question 21")).toBeInTheDocument();
  });

  it("keeps the same prompt active when an older page is prepended", async () => {
    const { scroller, scrollTo, setEntries } = createScroller();
    const { rerender } = await renderRail(scroller);
    scrollTo(3 * ROW_HEIGHT);
    expect(screen.getByRole("button", { name: /Second question/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    const older: ChatTimelineEntry[] = [
      { kind: "item", id: "prompt-0" },
      { kind: "item", id: "reply-0" },
    ];
    const prepended = [...older, ...ENTRIES];
    useAppStore.setState((state) => ({
      runtimeItemsByIdByThread: {
        [THREAD_ID]: {
          ...state.runtimeItemsByIdByThread[THREAD_ID],
          "prompt-0": message("prompt-0", "user_message", "Oldest question"),
          "reply-0": message("reply-0", "assistant_message", "Oldest answer"),
        },
      },
    }));
    // The virtualizer keeps the reader on the same content, so the rows move
    // down by the prepended height and carry their new indexes.
    setEntries(prepended);
    scrollTo(3 * ROW_HEIGHT + older.length * ROW_HEIGHT);
    rerender(railElement(scroller, { entries: prepended }));

    expect(tickLabels()).toEqual([
      "Scroll to prompt: Oldest question",
      "Scroll to prompt: First question",
      "Scroll to prompt: Second question",
    ]);
    expect(screen.getByRole("button", { name: /Second question/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("button", { name: /Oldest question/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("lists prompts the host knows about that paging has not loaded", async () => {
    readThreadPromptIndex.mockResolvedValue(OLDER_INDEX);
    const { scroller } = createScroller();
    const { onJumpToPrompt } = await renderRail(scroller);
    await flushIndex();

    expect(tickLabels()).toEqual([
      "Scroll to prompt: Oldest question with a second line",
      "Scroll to prompt: Older question",
      "Scroll to prompt: First question",
      "Scroll to prompt: Second question",
    ]);
    // Unloaded prompts are never the highlighted one; the loaded view decides.
    expect(screen.getAllByRole("button")[2]).toHaveAttribute("aria-current", "true");

    fireEvent.click(screen.getByRole("button", { name: /Older question/ }));
    expect(onJumpToPrompt).toHaveBeenCalledWith("old-2");
  });

  it("previews an unloaded prompt from the host text, without a reply", async () => {
    readThreadPromptIndex.mockResolvedValue(OLDER_INDEX);
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();

    fireEvent.pointerEnter(screen.getByRole("button", { name: /Older question/ }));
    expect(screen.getByText("Older question")).toBeInTheDocument();
    expect(screen.queryByText("First answer")).not.toBeInTheDocument();
  });

  it("shows progress on the tick of the prompt being paged in", async () => {
    readThreadPromptIndex.mockResolvedValue(OLDER_INDEX);
    const { scroller } = createScroller();
    const { rerender } = await renderRail(scroller);
    await flushIndex();
    const line = () =>
      screen.getByRole("button", { name: /Older question/ }).firstElementChild as HTMLElement;
    expect(line()).not.toHaveClass("animate-pulse");

    rerender(railElement(scroller, { pendingPromptId: "old-2" }));
    expect(line()).toHaveClass("animate-pulse");
  });

  it("ignores indexed prompts newer than the loaded transcript that paging can never reach", async () => {
    readThreadPromptIndex.mockResolvedValue({
      prompts: [
        { itemId: "prompt-1", position: 4, text: "First question" },
        { itemId: "hidden-newer", position: 5, text: "Never loadable" },
        { itemId: "prompt-2", position: 6, text: "Second question" },
      ],
      truncated: false,
    });
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();

    expect(tickLabels()).toEqual([
      "Scroll to prompt: First question",
      "Scroll to prompt: Second question",
    ]);
  });

  it("falls back to the loaded prompts when the host has no index", async () => {
    readThreadPromptIndex.mockResolvedValue(null);
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();
    expect(tickLabels()).toHaveLength(2);
  });

  it("reads the host index once per thread, not on every transcript change", async () => {
    const { scroller } = createScroller();
    const { rerender } = await renderRail(scroller);
    await flushIndex();
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(1);
    expect(readThreadPromptIndex).toHaveBeenCalledWith(THREAD_ID, expect.any(AbortSignal));

    const withNewPrompt: ChatTimelineEntry[] = [...ENTRIES, { kind: "item", id: "prompt-3" }];
    setItems([
      message("prompt-1", "user_message", "First question"),
      message("reply-1", "assistant_message", "First answer"),
      message("prompt-2", "user_message", "Second question"),
      message("reply-2", "assistant_message", "Working on it"),
      message("reply-2b", "assistant_message", "Done"),
      message("prompt-3", "user_message", "Third question"),
    ]);
    rerender(railElement(scroller, { entries: withNewPrompt }));
    await flushIndex();
    expect(readThreadPromptIndex).toHaveBeenCalledTimes(1);
    expect(tickLabels()).toContain("Scroll to prompt: Third question");
  });

  it("browses a long thread's ticks with the wheel instead of scrolling the transcript", async () => {
    // Sixty older prompts the host knows about, ahead of the two loaded ones.
    readThreadPromptIndex.mockResolvedValue({
      prompts: [
        ...Array.from({ length: 60 }, (_, index) => ({
          itemId: `old-${index}`,
          position: index * 2,
          text: `Old question ${index}`,
        })),
        { itemId: "prompt-1", position: 200, text: "First question" },
        { itemId: "prompt-2", position: 202, text: "Second question" },
      ],
      truncated: false,
    });
    const { scroller } = createScroller();
    const scrollBy = vi.fn<(options?: ScrollToOptions) => void>();
    scroller.scrollBy = scrollBy as HTMLElement["scrollBy"];
    await renderRail(scroller);
    await flushIndex();

    const mountedLabels = () =>
      screen.getAllByRole("button").map((tick) => tick.getAttribute("aria-label"));
    expect(mountedLabels()).not.toContain("Scroll to prompt: Old question 0");
    expect(mountedLabels()).toContain("Scroll to prompt: Second question");

    // Wheel up far enough to bring the oldest prompts into the window.
    for (let notch = 0; notch < 30; notch += 1) {
      const event = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
      act(() => {
        screen.getByRole("toolbar").dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(true);
    }
    expect(mountedLabels()).toContain("Scroll to prompt: Old question 0");
    expect(mountedLabels()).not.toContain("Scroll to prompt: Second question");
    expect(scrollBy).not.toHaveBeenCalled();

    // Leaving the rail snaps the window back to the prompt in view.
    fireEvent.pointerLeave(screen.getByRole("toolbar"));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(mountedLabels()).toContain("Scroll to prompt: Second question");
  });

  it("does nothing, not even read the host index, when the column leaves no gutter", async () => {
    readThreadPromptIndex.mockResolvedValue(OLDER_INDEX);
    const { scroller } = createScroller();
    scroller.getBoundingClientRect = () => new DOMRect(0, 0, 920, 2 * ROW_HEIGHT);
    await renderRail(scroller);
    await flushIndex();

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(readThreadPromptIndex).not.toHaveBeenCalled();
  });

  it("does nothing on a touch device", async () => {
    vi.stubGlobal("matchMedia", (query: string) => mediaQueryList(query, false));
    const { scroller } = createScroller();
    await renderRail(scroller);
    await flushIndex();

    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(readThreadPromptIndex).not.toHaveBeenCalled();
  });

  it("is not drawn when the transcript is outside a thread pane", async () => {
    const { scroller } = createScroller();
    document.body.append(scroller);
    await renderRail(scroller);
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("renders into the thread pane that hosts the transcript", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller);
    expect(scroller.closest("[data-poracode-thread-pane]")).toContainElement(
      screen.getByRole("toolbar"),
    );
  });

  it("is not drawn for a single prompt", async () => {
    const { scroller } = createScroller();
    await renderRail(scroller, { entries: ENTRIES.slice(0, 2) });
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("hides while Find in chat is open and before the initial scroll settles", async () => {
    const { scroller } = createScroller();
    const { rerender } = await renderRail(scroller, { isEnabled: false });
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();

    rerender(railElement(scroller));
    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    act(() => useChatFindStore.setState({ activeThreadId: THREAD_ID }));
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  });

  it("forwards wheel gestures over the rail to the transcript", async () => {
    const { scroller } = createScroller();
    const scrollBy = vi.fn<(options?: ScrollToOptions) => void>();
    scroller.scrollBy = scrollBy as HTMLElement["scrollBy"];
    const wheelSeen = vi.fn<(event: Event) => void>();
    scroller.addEventListener("wheel", wheelSeen);
    await renderRail(scroller);

    const event = new WheelEvent("wheel", { deltaY: 40, bubbles: true, cancelable: true });
    screen.getByRole("toolbar").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(wheelSeen).toHaveBeenCalledOnce();
    expect(scrollBy).toHaveBeenCalledWith({ top: 40 });
  });
});
