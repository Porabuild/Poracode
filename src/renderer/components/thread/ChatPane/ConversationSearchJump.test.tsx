import { act, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@lingui/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { useConversationSearchTarget } from "@/renderer/commands/conversationSearchNavigation";
import { ConversationSearchJump } from "./ConversationSearchJump";
import type { ScrollToIndex } from "@/renderer/components/find/ChatFindBar";

const mocks = vi.hoisted(() => ({
  hydrate: vi.fn<() => Promise<void>>(),
  load: vi.fn<() => Promise<boolean>>(),
  locate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  warning: vi.fn<(message: string) => void>(),
  sourceCurrent: true,
  entries: [] as { kind: "item"; id: string }[],
}));
vi.mock("@heroui/react", () => ({
  toast: { warning: mocks.warning },
  Button: ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  hydrateThreadRuntimeItems: mocks.hydrate,
  loadOlderThreadRuntimeItems: mocks.load,
}));
vi.mock("./loadRuntimeItemThroughHistory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./loadRuntimeItemThroughHistory")>();
  return { ...actual, locateConversationSearchMatch: mocks.locate };
});
vi.mock("./chatPaneSelectors", () => ({
  selectVisibleThreadTimelineEntries: (...args: [unknown, string, string?]) =>
    mocks.entries.filter((entry) => entry.id !== args[2]),
}));
vi.mock("@/renderer/state/appStore", async () => {
  const { create } = await import("zustand");
  return { useAppStore: create(() => ({ runtimeItemsByIdByThread: {} })) };
});
vi.mock("@/renderer/commands/conversationSearchNavigation", async () => {
  const { create } = await import("zustand");
  const store = create(() => ({ target: null }));
  return {
    useConversationSearchTarget: store,
    isConversationSearchTargetCurrent: (target: unknown) =>
      mocks.sourceCurrent && store.getState().target === target,
  };
});

const exactItem = {
  id: "old-message",
  type: "user_message" as const,
  state: "completed" as const,
  payload: { content: [{ kind: "text", text: "needle" }] },
  streams: {},
};
function focusedResult(neighbors = true) {
  return {
    kind: "focused",
    threadId: "saved",
    itemId: "old-message",
    items: neighbors
      ? [
          {
            id: "before",
            type: "assistant_message",
            state: "completed",
            payload: {},
            streams: { assistant_text: "earlier reply" },
          },
          exactItem,
          { id: "after", type: "user_message", state: "completed", payload: {}, streams: {} },
        ]
      : [exactItem],
    neighbors,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  // The focused history window centers its chosen row on mount; jsdom has no
  // scrollIntoView, so stub it on the prototype for every rendered row.
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn<Element["scrollIntoView"]>(),
  });
  mocks.hydrate.mockResolvedValue();
  mocks.load.mockReset();
  mocks.locate.mockReset();
  mocks.locate.mockResolvedValue({ kind: "legacy" });
  mocks.warning.mockReset();
  mocks.entries = [];
  mocks.sourceCurrent = true;
  useAppStore.setState({ runtimeItemsByIdByThread: {} });
  useConversationSearchTarget.setState({
    target: {
      threadId: "saved",
      itemId: "old-message",
      source: { kind: "managed", activationSeq: 1 },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});
function mount(hiddenRuntimeItemId?: string) {
  const scroll = vi.fn<ScrollToIndex>();
  const beforeScroll = vi.fn<() => void>();
  const view = render(
    <I18nProvider i18n={i18n}>
      <ConversationSearchJump
        threadId="saved"
        ready
        {...(hiddenRuntimeItemId ? { hiddenRuntimeItemId } : {})}
        scrollToIndexRef={{ current: scroll }}
        beforeScroll={beforeScroll}
      />
    </I18nProvider>,
  );
  return { ...view, scroll, beforeScroll };
}
describe("matched message jump", () => {
  it("loads canonical older pages and centers the matched item after layout", async () => {
    mocks.load.mockResolvedValueOnce(true).mockImplementationOnce(async () => {
      useAppStore.setState({
        runtimeItemsByIdByThread: {
          saved: {
            "old-message": {
              id: "old-message",
              type: "user_message",
              state: "completed",
              streams: {},
            },
          },
        },
      });
      mocks.entries = [
        { kind: "item", id: "before" },
        { kind: "item", id: "old-message" },
      ];
      return true;
    });
    const { scroll, beforeScroll } = mount();
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(1, { align: "center" });
    expect(beforeScroll).toHaveBeenCalledTimes(2);
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("cancels a pending history jump without scrolling or reading another page", async () => {
    const pending = Promise.withResolvers<boolean>();
    mocks.load.mockReturnValueOnce(pending.promise);
    const { scroll } = mount();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      pending.resolve(true);
    });
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(scroll).not.toHaveBeenCalled();
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("reports a deleted or no-longer-visible match", async () => {
    mocks.load.mockResolvedValue(false);
    const { scroll } = mount();
    await act(async () => {});
    expect(mocks.warning).toHaveBeenCalledOnce();
    expect(scroll).not.toHaveBeenCalled();
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("uses the same list index as a virtualizer hiding an earlier dock row", async () => {
    mocks.load.mockImplementationOnce(async () => {
      useAppStore.setState({
        runtimeItemsByIdByThread: {
          saved: {
            "old-message": {
              id: "old-message",
              type: "user_message",
              state: "completed",
              streams: {},
            },
          },
        },
      });
      mocks.entries = [
        { kind: "item", id: "dock" },
        { kind: "item", id: "old-message" },
      ];
      return true;
    });
    const { scroll } = mount("dock");
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(scroll).toHaveBeenLastCalledWith(0, { align: "center" });
  });

  it("does not continue a jump after its authority changes during hydration", async () => {
    const pending = Promise.withResolvers<void>();
    mocks.hydrate.mockReturnValueOnce(pending.promise);
    const { scroll } = mount();
    mocks.sourceCurrent = false;
    await act(async () => pending.resolve());
    expect(mocks.load).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("does not request another page after its authority changes during older paging", async () => {
    const pending = Promise.withResolvers<boolean>();
    mocks.load.mockReturnValueOnce(pending.promise);
    const { scroll } = mount();
    await act(async () => {});
    mocks.sourceCurrent = false;
    await act(async () => pending.resolve(true));
    expect(mocks.load).toHaveBeenCalledOnce();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("keeps the in-list jump for a match already in the loaded transcript", async () => {
    useAppStore.setState({
      runtimeItemsByIdByThread: {
        saved: { "old-message": exactItem },
      },
    });
    mocks.entries = [{ kind: "item", id: "old-message" }];
    const { scroll } = mount();
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenLastCalledWith(0, { align: "center" });
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });

  it("opens a deep match in a focused window with one exact + one bounded read", async () => {
    mocks.locate.mockResolvedValue(focusedResult());
    const { scroll } = mount();
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(mocks.locate).toHaveBeenCalledOnce();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
    expect(screen.getByText("Exact match")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Return to conversation" })).toBeTruthy();
    expect(document.querySelector('[data-exact-match="true"]')).toBeTruthy();
  });

  it("returns to the live conversation from the focused context", async () => {
    mocks.locate.mockResolvedValue(focusedResult(false));
    mount();
    await act(() => vi.advanceTimersByTimeAsync(50));
    fireEvent.click(screen.getByRole("button", { name: "Return to conversation" }));
    expect(useConversationSearchTarget.getState().target).toBeNull();
    expect(screen.queryByRole("button", { name: "Return to conversation" })).toBeNull();
  });

  it("retires the focused context when the target thread changes", async () => {
    mocks.locate.mockResolvedValue(focusedResult());
    mount();
    await act(() => vi.advanceTimersByTimeAsync(50));
    expect(screen.getByRole("button", { name: "Return to conversation" })).toBeTruthy();
    act(() => {
      useConversationSearchTarget.setState({
        target: {
          threadId: "other-thread",
          itemId: "x",
          source: { kind: "managed", activationSeq: 1 },
        },
      });
    });
    expect(screen.queryByRole("button", { name: "Return to conversation" })).toBeNull();
  });

  it("does not attribute a deep result after its authority changes", async () => {
    const pending = Promise.withResolvers<unknown>();
    mocks.locate.mockReturnValueOnce(pending.promise);
    const { scroll } = mount();
    await act(async () => {});
    mocks.sourceCurrent = false;
    await act(async () => pending.resolve(focusedResult()));
    expect(screen.queryByRole("button", { name: "Return to conversation" })).toBeNull();
    expect(mocks.load).not.toHaveBeenCalled();
    expect(scroll).not.toHaveBeenCalled();
  });

  it("cancels an in-flight deep locate without showing a focused result", async () => {
    const pending = Promise.withResolvers<unknown>();
    mocks.locate.mockReturnValueOnce(pending.promise);
    mount();
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => pending.resolve(focusedResult()));
    expect(screen.queryByRole("button", { name: "Return to conversation" })).toBeNull();
    expect(useConversationSearchTarget.getState().target).toBeNull();
  });
});
