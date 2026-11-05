import { act, render, renderHook, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import { useChatFindStore } from "@/renderer/state/chatFindStore";
import type { PersistedPromptIndex } from "@/shared/ipc";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import type { ChatTimelineEntry } from "./chatPaneSelectors";
import { ChatPromptOverlays } from "./ChatPromptOverlays";
import { useVisibleRowRange } from "./useVisibleRowRange";

const { readThreadPromptIndex, cache } = vi.hoisted(() => ({
  cache: new Map<string, PersistedPromptIndex>(),
  readThreadPromptIndex: vi.fn<
    (threadId: string, signal?: AbortSignal) => Promise<PersistedPromptIndex | null>
  >(async () => ({ prompts: [], truncated: false })),
}));
vi.mock("@/renderer/state/threadPromptIndex", () => ({
  threadPromptIndexOwner: () => "host",
  shouldRefreshThreadPromptIndex: () => false,
  readCachedThreadPromptIndex: (threadId: string) => cache.get(threadId),
  readThreadPromptIndex: async (threadId: string, signal?: AbortSignal) => {
    const index = await readThreadPromptIndex(threadId, signal);
    if (index && !signal?.aborted) cache.set(threadId, index);
    return index;
  },
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
 * rows the way the virtualizer renumbers them when a page is prepended. Each row
 * rect read is counted so a frame's geometry pass can be measured.
 */
function createScroller() {
  const scroller = document.createElement("div");
  let scrollTop = 0;
  let rowRectCalls = 0;
  scroller.getBoundingClientRect = () => new DOMRect(100, 0, 1000, 2 * ROW_HEIGHT);
  const setEntries = (entries: readonly ChatTimelineEntry[]) => {
    scroller.replaceChildren(
      ...entries.map((entry, index) => {
        const row = document.createElement("div");
        row.dataset.chatVirtualRow = "true";
        row.dataset.index = String(index);
        row.dataset.itemId = entry.id;
        row.getBoundingClientRect = () => {
          rowRectCalls += 1;
          return new DOMRect(0, index * ROW_HEIGHT - scrollTop, 400, ROW_HEIGHT);
        };
        return row;
      }),
    );
  };
  setEntries(ENTRIES);
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
  return {
    scroller,
    scrollTo,
    setEntries,
    readRowRectCalls: () => rowRectCalls,
    resetRowRectCalls: () => {
      rowRectCalls = 0;
    },
  };
}

/** Reports once as soon as it observes, the way a real ResizeObserver does. */
class ImmediateResizeObserver {
  constructor(private readonly callback: () => void) {}
  observe() {
    this.callback();
  }
  unobserve() {}
  disconnect() {}
}

const noopScrollToEntry = () => undefined;
const noopJumpToPrompt = () => undefined;
const noopParentRender = () => undefined;

function OverlaysHost({
  scroller,
  entries,
  onParentRender,
}: {
  scroller: HTMLDivElement;
  entries: readonly ChatTimelineEntry[];
  onParentRender: () => void;
}) {
  onParentRender();
  return (
    <ChatPromptOverlays
      threadId={THREAD_ID}
      entries={entries}
      scrollElement={scroller}
      isEnabled
      pendingPromptId={null}
      onScrollToEntry={noopScrollToEntry}
      onJumpToPrompt={noopJumpToPrompt}
    />
  );
}

function renderHost(
  scroller: HTMLDivElement,
  entries: readonly ChatTimelineEntry[] = ENTRIES,
  onParentRender: () => void = () => undefined,
) {
  return render(
    <AppProvider>
      <OverlaysHost scroller={scroller} entries={entries} onParentRender={onParentRender} />
    </AppProvider>,
  );
}

const flushIndex = () =>
  act(async () => {
    await Promise.resolve();
  });

async function settle() {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  await flushIndex();
}

function stickyButton(name: string) {
  return screen
    .getAllByRole("button", { name })
    .find((button) => button.closest('[role="toolbar"]') === null);
}

function railTicks() {
  return within(screen.getByRole("toolbar")).getAllByRole("button");
}

function railTick(name: string) {
  return railTicks().find(
    (tick) => tick.getAttribute("aria-label") === `Scroll to prompt: ${name}`,
  );
}

describe("ChatPromptOverlays", () => {
  beforeEach(() => {
    readThreadPromptIndex.mockReset();
    cache.clear();
    readThreadPromptIndex.mockResolvedValue({ prompts: [], truncated: false });
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
      message("reply-2b", "assistant_message", "Final second answer"),
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  it("measures rows once per frame and feeds the first and last range to both surfaces", async () => {
    const { scroller, scrollTo, readRowRectCalls, resetRowRectCalls } = createScroller();
    let parentRenders = 0;
    renderHost(scroller, ENTRIES, () => {
      parentRenders += 1;
    });
    await settle();
    expect(screen.getByRole("toolbar")).toBeInTheDocument();

    const rendersBeforeScroll = parentRenders;
    resetRowRectCalls();
    scrollTo(ROW_HEIGHT);

    // One pass over the rendered rows serves both the sticky prompt and the
    // rail's range.
    expect(readRowRectCalls()).toBe(ENTRIES.length);
    // The sticky prompt follows the first visible row; the rail follows the last.
    expect(stickyButton("Scroll to prompt: First question")).toBeVisible();
    const firstTick = railTick("First question")!;
    const secondTick = railTick("Second question")!;
    expect(firstTick).not.toHaveAttribute("aria-current");
    expect(secondTick).toHaveAttribute("aria-current", "true");
    expect(firstTick!.firstElementChild).toHaveStyle({ transform: "scaleX(0.5)" });
    expect(secondTick!.firstElementChild).toHaveStyle({ transform: "scaleX(0.667)" });
    // Only the prompt chrome re-rendered; the parent (and its message list in
    // production) did not.
    expect(parentRenders).toBe(rendersBeforeScroll);
  });

  it("keeps both consumers on the same rows when older entries are prepended", async () => {
    const { scroller, scrollTo, setEntries } = createScroller();
    const view = renderHost(scroller);
    await settle();

    scrollTo(ROW_HEIGHT);
    expect(stickyButton("Scroll to prompt: First question")).toBeVisible();
    expect(railTick("Second question")).toHaveAttribute("aria-current", "true");

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
    setEntries(prepended);
    // The virtualizer keeps the reader on the same content, so the rows move
    // down by the prepended height and carry their new indexes.
    view.rerender(
      <AppProvider>
        <OverlaysHost scroller={scroller} entries={prepended} onParentRender={noopParentRender} />
      </AppProvider>,
    );

    // Before the next measurement the remembered row ids must resolve to their
    // shifted indexes; raw old indexes would point at the previous rows.
    expect(stickyButton("Scroll to prompt: First question")).toBeVisible();
    expect(railTick("Second question")).toHaveAttribute("aria-current", "true");
    expect(railTick("First question")).not.toHaveAttribute("aria-current");

    scrollTo(ROW_HEIGHT + older.length * ROW_HEIGHT);
    expect(stickyButton("Scroll to prompt: First question")).toBeVisible();
    expect(railTick("Second question")).toHaveAttribute("aria-current", "true");
  });

  it("resolves measured indices directly and remaps ids when the timeline changes", async () => {
    const { scroller, scrollTo, setEntries } = createScroller();
    const entries: ChatTimelineEntry[] = Array.from({ length: 2000 }, (_, index) => ({
      kind: "item",
      id: `entry-${index}`,
    }));
    setEntries(entries);
    const scan = vi.spyOn(entries, "findIndex");
    const { result, rerender } = renderHook(
      ({ entries: currentEntries }: { entries: readonly ChatTimelineEntry[] }) =>
        useVisibleRowRange(scroller, currentEntries),
      { initialProps: { entries } },
    );
    await settle();
    scrollTo(1500 * ROW_HEIGHT);
    expect(result.current).toEqual({ first: 1500, last: 1501 });
    scrollTo(1501 * ROW_HEIGHT);
    expect(result.current).toEqual({ first: 1501, last: 1502 });
    expect(scan).not.toHaveBeenCalled();

    const prepended: ChatTimelineEntry[] = [{ kind: "item", id: "older" }, ...entries];
    const prependScan = vi.spyOn(prepended, "findIndex");
    setEntries(prepended);
    rerender({ entries: prepended });
    // Resolve the same ids before the next geometry frame renumbers them.
    expect(result.current).toEqual({ first: 1502, last: 1503 });
    expect(prependScan).toHaveBeenCalledTimes(2);
    scrollTo(1502 * ROW_HEIGHT);
    expect(result.current).toEqual({ first: 1502, last: 1503 });
    prependScan.mockClear();
    scrollTo(1503 * ROW_HEIGHT);
    expect(result.current).toEqual({ first: 1503, last: 1504 });
    expect(prependScan).not.toHaveBeenCalled();

    const removed = prepended.filter((_, index) => index !== 1503);
    setEntries(removed);
    rerender({ entries: removed });
    expect(result.current).toBeNull();
    await settle();
    expect(result.current).toEqual({ first: 1503, last: 1504 });
  });
});
