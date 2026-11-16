import { useState, type ReactNode } from "react";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import type { Thread } from "@/shared/contracts";
import { useAppStore } from "@/renderer/state/appStore";
import { SideChatThreadView } from "./SideChatThreadView";

const ownership = vi.hoisted(() => ({
  retain: vi.fn<(threadId: string) => void>(),
  release: vi.fn<() => void>(),
}));
vi.mock("@/renderer/state/runtimeInterestHydration", () => ({
  retainRuntimeThreadReader: (threadId: string) => {
    ownership.retain(threadId);
    return { release: ownership.release };
  },
}));
vi.mock("./useSideChatThreadRestore", () => ({
  useSideChatThreadRestore: () => ({ present: true }),
}));
vi.mock("@/renderer/dnd", () => ({
  CompactDndProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/renderer/views/MainView/parts/AppContent/parts/ThreadPane", () => ({
  ThreadPane: ({ threadId }: { threadId: string }) => {
    const text = useAppStore(
      (state) => state.runtimeItemsByIdByThread[threadId]?.reply?.streams.assistant_text,
    );
    const [draft, setDraft] = useState("");
    return (
      <div>
        <p>{text}</p>
        <input
          aria-label="Side draft"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
    );
  },
}));

it("retains history interest and draft while hidden, then reveals the latest stream", async () => {
  const threadId = "retained-side";
  const source = { id: "source", projectId: "project" } as Thread;
  useAppStore.getState().hydrateThreadRuntimeItems(threadId, [
    {
      id: "reply",
      type: "assistant_message",
      state: "started",
      streams: { assistant_text: "Before hide" },
    },
  ]);
  const view = render(<SideChatThreadView threadId={threadId} source={source} visible />);
  const input = screen.getByRole("textbox", { name: "Side draft" });
  fireEvent.change(input, { target: { value: "Unsent draft" } });
  view.rerender(<SideChatThreadView threadId={threadId} source={source} visible={false} />);
  await waitFor(() => expect(input).not.toBeVisible());
  expect(ownership.release).not.toHaveBeenCalled();
  act(() =>
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "content.delta",
      threadId,
      itemId: "reply",
      stream: "assistant_text",
      delta: " and after hide",
    }),
  );
  expect(screen.queryByText(/and after hide/)).toBeNull();
  view.rerender(<SideChatThreadView threadId={threadId} source={source} visible />);
  expect(screen.getByText("Before hide and after hide")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Side draft" })).toBe(input);
  expect(input).toHaveValue("Unsent draft");
  expect(ownership.retain).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(ownership.release).toHaveBeenCalledTimes(1);
});
