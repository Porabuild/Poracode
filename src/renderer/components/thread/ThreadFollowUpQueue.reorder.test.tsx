import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/react";
import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { ThreadFollowUpQueue } from "./ThreadFollowUpQueue";

const dnd = vi.hoisted(() => ({
  start: undefined as (() => void) | undefined,
  end: undefined as ((event: DragEndEvent) => void) | undefined,
}));
const bridge = vi.hoisted(() => ({ reorderQueuedThreadFollowUp: vi.fn<() => Promise<void>>() }));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("@dnd-kit/react", () => ({
  DragDropProvider: (props: {
    children: ReactNode;
    onDragStart: () => void;
    onDragEnd: (event: DragEndEvent) => void;
  }) => {
    dnd.start = props.onDragStart;
    dnd.end = props.onDragEnd;
    return props.children;
  },
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  isSortable: () => true,
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));
const queue = {
  paused: false,
  items: [
    { id: "first", prompt: "First task", stagedAt: 1 },
    { id: "second", prompt: "Second task", stagedAt: 2 },
    { id: "third", prompt: "Third task", stagedAt: 3 },
  ],
};
function end(id: string, index: number, canceled = false) {
  act(() =>
    dnd.end?.({ canceled, operation: { source: { id, index } } } as unknown as DragEndEvent),
  );
}
beforeEach(() => bridge.reorderQueuedThreadFollowUp.mockReset().mockResolvedValue(undefined));

it("sends a stable before-ID after dragging without replacing an updated queue snapshot", async () => {
  const view = render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
  act(() => dnd.start?.());
  view.rerender(
    <ThreadFollowUpQueue
      threadId="thread"
      queue={{ ...queue, items: [...queue.items, { id: "new", prompt: "New task", stagedAt: 4 }] }}
    />,
  );
  end("third", 0);
  await waitFor(() =>
    expect(bridge.reorderQueuedThreadFollowUp).toHaveBeenCalledWith({
      threadId: "thread",
      id: "third",
      beforeId: "first",
    }),
  );
  expect(screen.getByText("New task")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("First task");
});

it("uses a null anchor to move to the end", async () => {
  render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
  act(() => dnd.start?.());
  end("first", 2);
  await waitFor(() =>
    expect(bridge.reorderQueuedThreadFollowUp).toHaveBeenCalledWith({
      threadId: "thread",
      id: "first",
      beforeId: null,
    }),
  );
});

it("can drop after a message appended remotely during a drag", async () => {
  const view = render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
  act(() => dnd.start?.());
  view.rerender(
    <ThreadFollowUpQueue
      threadId="thread"
      queue={{ ...queue, items: [...queue.items, { id: "new", prompt: "New task", stagedAt: 4 }] }}
    />,
  );
  end("first", 3);
  await waitFor(() =>
    expect(bridge.reorderQueuedThreadFollowUp).toHaveBeenCalledWith({
      threadId: "thread",
      id: "first",
      beforeId: null,
    }),
  );
});

it("does not send cancelled or unchanged drags", () => {
  render(<ThreadFollowUpQueue threadId="thread" queue={queue} />);
  act(() => dnd.start?.());
  end("third", 0, true);
  act(() => dnd.start?.());
  end("first", 0);
  expect(bridge.reorderQueuedThreadFollowUp).not.toHaveBeenCalled();
});

it("disables the handle when there is only one queued message", () => {
  render(<ThreadFollowUpQueue threadId="thread" queue={{ ...queue, items: [queue.items[0]!] }} />);
  expect(screen.getByRole("button", { name: "Reorder queued follow-up" })).toBeDisabled();
});
