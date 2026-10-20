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
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  mocks.hydrate.mockResolvedValue();
  mocks.load.mockReset();
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
});
