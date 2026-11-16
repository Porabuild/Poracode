import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "@/renderer/components/ui/provider";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { ChatItemRow } from "./ChatItemRow";
import { ToolCallEntranceScope } from "./toolCallEntrance";

const EMPTY_IDS: readonly string[] = [];

function Timeline({ threadId = "thread", showRows = true }) {
  const ids = useAppStore((state) => state.runtimeItemIdsByThread[threadId] ?? EMPTY_IDS);
  return (
    <AppProvider>
      <ToolCallEntranceScope key={threadId} threadId={threadId}>
        {showRows && ids.length > 0 ? (
          <ChatItemRow
            threadId={threadId}
            entry={
              ids.length === 1
                ? { kind: "item", id: ids[0]! }
                : { kind: "tool_call_group", id: `group:${ids[0]}`, itemIds: ids }
            }
            isLastEntry
            checkpointRevert={null}
          />
        ) : null}
      </ToolCallEntranceScope>
    </AppProvider>
  );
}

function history(count = 2): RuntimeChatItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `old-${index}`,
    type: "command_execution",
    state: "completed",
    payload: { command: `echo old-${index}`, exitCode: 0 },
    streams: {},
  }));
}

function hydrate(items = history(), threadId = "thread") {
  act(() => {
    useAppStore.getState().hydrateThreadRuntimeItems(threadId, items);
  });
}

function arrive(id: string) {
  act(() => {
    useAppStore.getState().applyRuntimeEvents("thread", [
      {
        type: "item.started",
        threadId: "thread",
        itemId: id,
        itemType: "command_execution",
        payload: { command: `echo ${id}` },
      },
      { type: "item.completed", threadId: "thread", itemId: id },
    ]);
  });
}

function entering(container: HTMLElement) {
  return container.querySelectorAll(".animate-tool-call-enter");
}

describe("tool-call entrance", () => {
  beforeEach(() => {
    useAppStore.getState().clearThreadRuntimeEvents("thread");
    useAppStore.getState().clearThreadRuntimeEvents("other");
  });

  it("opens existing history immediately, including items observed live earlier", () => {
    hydrate(history().map((item) => ({ ...item, observedLive: true })));
    const view = render(<Timeline />);
    expect(screen.getByText(/echo old-1/)).toBeInTheDocument();
    expect(entering(view.container)).toHaveLength(0);
  });

  it("skips asynchronously loaded history and animates only a subsequent live arrival", () => {
    const view = render(<Timeline />);
    hydrate();
    expect(entering(view.container)).toHaveLength(0);

    arrive("new");
    expect(entering(view.container)).toHaveLength(1);
    expect(entering(view.container)[0]).toHaveTextContent("echo new");
    // jsdom has no AnimationEvent, so React registers its WebKit fallback.
    fireEvent(entering(view.container)[0]!, new Event("webkitAnimationEnd", { bubbles: true }));
    expect(entering(view.container)).toHaveLength(0);
  });

  it("keeps a new group's arrival without replaying its already visible first item", () => {
    const view = render(<Timeline />);
    arrive("first");
    arrive("second");
    expect(entering(view.container)).toHaveLength(1);
    expect(entering(view.container)[0]).toHaveTextContent("echo second");
  });

  it("does not replay arrivals on virtual remount or reopening the thread", () => {
    hydrate();
    const view = render(<Timeline />);
    arrive("new");
    expect(entering(view.container)).toHaveLength(1);
    view.rerender(<Timeline showRows={false} />);
    view.rerender(<Timeline />);
    expect(entering(view.container)).toHaveLength(0);
    view.rerender(<Timeline threadId="other" />);
    view.rerender(<Timeline />);
    expect(screen.getByText(/echo new/)).toBeInTheDocument();
    expect(entering(view.container)).toHaveLength(0);
  });

  it("reveals overflow history immediately and preserves the next live entrance", () => {
    hydrate(history(10));
    const view = render(<Timeline />);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText(/echo old-0/)).toBeInTheDocument();
    expect(entering(view.container)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Show less" }));
    expect(entering(view.container)).toHaveLength(0);
    arrive("new");
    expect(entering(view.container)).toHaveLength(1);
  });

  it("does not treat opening a collapsed group as a new tool arrival", () => {
    hydrate();
    const view = render(<Timeline />);
    fireEvent.click(screen.getByRole("button", { name: /2 commands/i }));
    arrive("new");
    fireEvent.click(screen.getByRole("button", { name: /3 commands/i }));
    expect(screen.getByText(/echo new/)).toBeInTheDocument();
    expect(entering(view.container)).toHaveLength(0);
  });

  it("does not animate hidden rows from a live batch when Show all reveals them", () => {
    hydrate();
    const view = render(<Timeline />);
    act(() => {
      useAppStore.getState().applyRuntimeEvents(
        "thread",
        Array.from({ length: 10 }, (_, index) => ({
          type: "item.started" as const,
          threadId: "thread",
          itemId: `batch-${index}`,
          itemType: "command_execution" as const,
          payload: { command: `echo batch-${index}` },
        })),
      );
    });
    expect(entering(view.container)).toHaveLength(8);
    for (const row of entering(view.container)) {
      fireEvent(row, new Event("webkitAnimationEnd", { bubbles: true }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByText(/echo batch-0/)).toBeInTheDocument();
    expect(entering(view.container)).toHaveLength(0);
  });

  it("keeps live entrances for pending edits in an expanded same-file group", () => {
    const payload = {
      name: "Edit",
      kind: "edit",
      locations: [{ path: "src/example.ts" }],
      status: "running",
    };
    hydrate(history().map((item) => ({ ...item, type: "tool_call", payload, observedLive: true })));
    const view = render(<Timeline />);
    fireEvent.click(screen.getByRole("button", { name: /2 edits:/i }));
    expect(entering(view.container)).toHaveLength(0);
    act(() => {
      useAppStore.getState().applyRuntimeEvent("thread", {
        type: "item.started",
        threadId: "thread",
        itemId: "new-edit",
        itemType: "tool_call",
        payload,
      });
    });
    expect(entering(view.container)).toHaveLength(1);
    expect(entering(view.container)[0]).toHaveTextContent("example.ts");
  });
});
