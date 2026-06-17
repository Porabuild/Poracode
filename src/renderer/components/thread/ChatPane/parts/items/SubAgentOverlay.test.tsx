import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallPayload } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { SubAgentOverlay } from "./SubAgentOverlay";

const mockBridge = {
  subagentSubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<{ history: [] }>>(),
  subagentUnsubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<void>>(),
};

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mockBridge,
}));

describe("SubAgentOverlay", () => {
  beforeEach(() => {
    mockBridge.subagentSubscribe.mockReset().mockResolvedValue({ history: [] });
    mockBridge.subagentUnsubscribe.mockReset().mockResolvedValue(undefined);
    useAppStore.setState({
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeRequestsByThread: {},
      runtimeStructuralVersionByThread: {},
      openSubAgentByThread: {},
    });
  });

  it("uses the shared compact panel chrome and content surface", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(<SubAgentOverlay threadId={threadId} />);

    const dialog = await screen.findByRole("dialog", {
      name: "Agent (rubber-duck): Critiquing opencode fix",
    });
    expect(dialog).toHaveClass("bg-[var(--content-background)]");
    expect(within(dialog).getByText("Working…")).toBeInTheDocument();

    const heading = within(dialog).getByRole("heading", {
      name: "Agent (rubber-duck): Critiquing opencode fix",
    });
    const header = heading.parentElement;
    if (!(header instanceof HTMLDivElement)) {
      throw new Error("missing subagent overlay header");
    }

    expect(header).toHaveClass("px-2", "py-1", "gap-2");
    expect(header).not.toHaveClass("bg-[var(--composer-surface)]");

    const closeButton = within(dialog).getByRole("button", { name: "Close subagent" });
    expect(closeButton).toHaveClass("rounded", "p-1", "text-muted/60");

    const icons = header.querySelectorAll("svg");
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveClass("size-3.5");
    expect(icons[1]).toHaveClass("size-3.5");
  });
});

function makeSubAgentItem(id: string): RuntimeChatItem {
  const payload: ToolCallPayload = {
    name: "Task",
    status: "running",
    args: {
      description: "Critiquing opencode fix",
      subagent_type: "rubber-duck",
    },
  };

  return {
    id,
    type: "tool_call",
    state: "started",
    payload,
    streams: {},
  };
}
