import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCallPayload } from "@/shared/contracts";
import { AppProvider } from "@/renderer/components/ui/provider";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";
import { SubAgentOverlay } from "./SubAgentOverlay";
import { ActiveSubAgentTile } from "./ActiveSubAgentTile";

const mockBridge = {
  subagentSubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<{ history: [] }>>(),
  subagentUnsubscribe:
    vi.fn<(payload: { threadId: string; parentItemId: string }) => Promise<void>>(),
};

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => false,
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

  it("keeps the composer loader without a leading dot or duplicate agent description", () => {
    const threadId = "thread-1";
    const parentItem: RuntimeChatItem = {
      id: "parent-1",
      type: "tool_call",
      state: "started",
      payload: {
        name: "spawnAgent",
        status: "running",
        isSubAgent: true,
        args: { description: "protocol specialist" },
        progress: {
          model: "gpt-5.6-sol",
          effort: "ultra",
          description: "protocol specialist",
          stepCount: 5,
        },
      } satisfies ToolCallPayload,
      streams: {},
    };

    useAppStore.setState({
      runtimeItemIdsByThread: { [threadId]: [parentItem.id] },
      runtimeItemsByIdByThread: { [threadId]: { [parentItem.id]: parentItem } },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
    });

    const view = render(
      <AppProvider>
        <ActiveSubAgentTile threadId={threadId} />
      </AppProvider>,
    );

    const row = view.container.querySelector(".poracode-subagent-dock-row");
    expect(row).not.toBeNull();
    expect(
      row?.querySelector('[data-poracode-shimmer-text="Agent: protocol specialist"]'),
    ).toBeNull();
    expect(row?.textContent).not.toContain("specialist·GPT");
    expect(row?.querySelector(".poracode-pixel-loader")).not.toBeNull();
  });

  it("renders child messages through the main timeline parser", async () => {
    const threadId = "thread-1";
    const parentItem = makeSubAgentItem("parent-1");
    const prompt = makeChildItem("prompt-1", parentItem.id, "user_message", {
      content: [{ kind: "text", text: "Inspect the renderer." }],
    });
    const commandOne = makeChildItem("command-1", parentItem.id, "command_execution", {
      command: "pnpm run typecheck",
    });
    const hiddenPlan = makeChildItem("plan-1", parentItem.id, "plan", undefined, {
      plan_text: "internal plan",
    });
    const commandTwo = makeChildItem("command-2", parentItem.id, "command_execution", {
      command: "pnpm run lint",
    });
    const assistant = makeChildItem("assistant-1", parentItem.id, "assistant_message", undefined, {
      assistant_text: "## Child result\n\n- parsed markdown",
    });

    useAppStore.setState({
      runtimeItemIdsByThread: {
        [threadId]: [
          parentItem.id,
          prompt.id,
          commandOne.id,
          hiddenPlan.id,
          commandTwo.id,
          assistant.id,
        ],
      },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
          [prompt.id]: prompt,
          [commandOne.id]: commandOne,
          [hiddenPlan.id]: hiddenPlan,
          [commandTwo.id]: commandTwo,
          [assistant.id]: assistant,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <AppProvider>
        <SubAgentOverlay threadId={threadId} />
      </AppProvider>,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Inspect the renderer.")).toBeInTheDocument();
    expect(within(dialog).getByText("2 commands")).toBeInTheDocument();
    expect(
      await within(dialog).findByRole("heading", { name: "Child result" }, { timeout: 5_000 }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("listitem")).toHaveTextContent("parsed markdown");
    expect(within(dialog).queryByText("internal plan")).not.toBeInTheDocument();
  });

  it("does not present the final child tool group as live after the subagent completes", async () => {
    const threadId = "thread-1";
    const runningParent = makeSubAgentItem("parent-1");
    const parentItem: RuntimeChatItem = {
      ...runningParent,
      state: "completed",
      payload: { ...(runningParent.payload as ToolCallPayload), status: "success" },
    };
    const commandOne = makeChildItem("command-1", parentItem.id, "command_execution", {
      command: "pnpm run typecheck",
    });
    const commandTwo = makeChildItem("command-2", parentItem.id, "command_execution", {
      command: "pnpm run lint",
    });

    useAppStore.setState({
      runtimeItemIdsByThread: {
        [threadId]: [parentItem.id, commandOne.id, commandTwo.id],
      },
      runtimeItemsByIdByThread: {
        [threadId]: {
          [parentItem.id]: parentItem,
          [commandOne.id]: commandOne,
          [commandTwo.id]: commandTwo,
        },
      },
      runtimeStructuralVersionByThread: { [threadId]: 1 },
      openSubAgentByThread: { [threadId]: parentItem.id },
    });

    render(
      <AppProvider>
        <SubAgentOverlay threadId={threadId} />
      </AppProvider>,
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("2 commands").closest("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
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

function makeChildItem(
  id: string,
  parentItemId: string,
  type: RuntimeChatItem["type"],
  payload?: unknown,
  streams: RuntimeChatItem["streams"] = {},
): RuntimeChatItem {
  return {
    id,
    parentItemId,
    type,
    state: "completed",
    ...(payload !== undefined ? { payload } : {}),
    streams,
  };
}
