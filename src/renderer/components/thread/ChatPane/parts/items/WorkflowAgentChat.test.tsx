import { act, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { PaneVisibility } from "@/renderer/paneVisibility";
import { WorkflowAgentChat } from "./WorkflowAgentChat";

const bridge = vi.hoisted(() => ({
  workflowAgentChat: vi.fn<() => Promise<{ events: RuntimeEvent[] }>>(),
  rowRendered: vi.fn<() => void>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
vi.mock("./ChatItemRow", () => ({
  ChatItemRow: ({ threadId, entry }: { threadId: string; entry: { id: string } }) => {
    bridge.rowRendered();
    const text = useAppStore(
      (state) => state.runtimeItemsByIdByThread[threadId]?.[entry.id]?.streams.assistant_text,
    );
    return <p>{text}</p>;
  },
}));

it("retains workflow data ownership while hidden and reveals its latest poll without clearing history", async () => {
  vi.useFakeTimers();
  const threadId = "wf-agent-chat:activity-test";
  const location = { kind: "posix" as const, path: "/fixture" };
  const events = (text: string): RuntimeEvent[] => [
    {
      type: "item.started",
      threadId,
      itemId: "reply",
      itemType: "assistant_message",
      payload: { role: "assistant", content: [] },
    },
    { type: "content.delta", threadId, itemId: "reply", stream: "assistant_text", delta: text },
  ];
  const body = (visible: boolean) => (
    <PaneVisibility value={visible}>
      <WorkflowAgentChat
        transcriptDir="/fixture/chat"
        agentId="activity-test"
        agentFinished={false}
        location={location}
        fallback={<p>Fallback</p>}
      />
    </PaneVisibility>
  );
  bridge.workflowAgentChat.mockResolvedValue({ events: events("First workflow response") });
  const view = render(body(true));
  try {
    await act(async () => {});
    expect(screen.getByText("First workflow response")).toBeVisible();
    view.rerender(body(false));
    await act(() => vi.advanceTimersByTime(120));
    bridge.rowRendered.mockClear();
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["reply"]);
    bridge.workflowAgentChat.mockResolvedValue({ events: events("Latest workflow response") });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(
      useAppStore.getState().runtimeItemsByIdByThread[threadId]?.reply?.streams.assistant_text,
    ).toBe("Latest workflow response");
    expect(screen.queryByText("Latest workflow response")).toBeNull();
    expect(bridge.rowRendered).not.toHaveBeenCalled();
    const reads = bridge.workflowAgentChat.mock.calls.length;
    view.rerender(body(true));
    expect(screen.getByText("Latest workflow response")).toBeVisible();
    expect(bridge.workflowAgentChat).toHaveBeenCalledTimes(reads);
    view.unmount();
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId] ?? []).toHaveLength(0);
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});
