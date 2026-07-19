import { describe, expect, it } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { AppStoreState } from "@/renderer/state/appStore";
import {
  selectActiveNativeSubAgentThreadIds,
  selectActiveSubAgentParentItemIds,
  selectThreadHasActiveNativeSubAgent,
} from "@/renderer/state/subAgentSelectors";
import {
  selectChatScrollAnchor,
  selectChildTimelineEntries,
  selectVisibleThreadRuntimeItemIds,
  selectVisibleThreadTimelineEntries,
} from "./chatPaneSelectors";

describe("chatPaneSelectors", () => {
  it("parses subagent children with the same visibility and grouping rules as the main thread", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["parent", "command-1", "plan", "command-2", "error", "assistant", "other"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          parent: {
            id: "parent",
            type: "tool_call",
            state: "started",
            payload: { name: "Task", status: "running", isSubAgent: true },
            streams: {},
          },
          "command-1": {
            id: "command-1",
            parentItemId: "parent",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run typecheck" },
            streams: {},
          },
          plan: {
            id: "plan",
            parentItemId: "parent",
            type: "plan",
            state: "completed",
            streams: { plan_text: "internal plan" },
          },
          "command-2": {
            id: "command-2",
            parentItemId: "parent",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run lint" },
            streams: {},
          },
          error: {
            id: "error",
            parentItemId: "parent",
            type: "error",
            state: "completed",
            payload: { message: "hidden error row" },
            streams: {},
          },
          assistant: {
            id: "assistant",
            parentItemId: "parent",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "Child result" },
          },
          other: {
            id: "other",
            parentItemId: "different-parent",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "Unrelated" },
          },
        },
      },
      runtimeStructuralVersionByThread: { t1: 1 },
    } as unknown as AppStoreState;

    expect(selectChildTimelineEntries(state, "t1", "parent")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:command-1",
        itemIds: ["command-1", "command-2"],
      },
      { kind: "item", id: "assistant" },
    ]);
  });

  it("anchors the main chat to its visible tail instead of a hidden subagent child", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["parent", "assistant", "child"] },
      runtimeItemsByIdByThread: {
        t1: {
          parent: {
            id: "parent",
            type: "tool_call",
            state: "completed",
            payload: { name: "spawnAgent", status: "success", isSubAgent: true },
            streams: {},
          },
          assistant: {
            id: "assistant",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "Parent result" },
          },
          child: {
            id: "child",
            parentItemId: "parent",
            type: "assistant_message",
            state: "updated",
            streams: { assistant_text: "Hidden child output" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectChatScrollAnchor(state, "t1")).toBe("assistant:13:completed");
  });

  it("keeps completed reasoning items in the transcript so the user can expand them later", () => {
    // The `Reasoning` component renders a collapsed "Thought" disclosure for
    // completed items with text. Filtering them out here would erase that
    // affordance entirely.
    const state = {
      runtimeItemIdsByThread: {
        t1: ["user-1", "reasoning-1", "assistant-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "user-1": {
            id: "user-1",
            type: "user_message",
            state: "completed",
            streams: {},
          },
          "reasoning-1": {
            id: "reasoning-1",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "thinking" },
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "done" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(state, "t1")).toEqual([
      "user-1",
      "reasoning-1",
      "assistant-1",
    ]);
  });

  it("hides completed assistant messages with no renderable content", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["empty", "streaming", "stream-text", "payload-text", "payload-image"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          empty: {
            id: "empty",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "" },
          },
          streaming: {
            id: "streaming",
            type: "assistant_message",
            state: "started",
            streams: {},
          },
          "stream-text": {
            id: "stream-text",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "answer" },
          },
          "payload-text": {
            id: "payload-text",
            type: "assistant_message",
            state: "completed",
            payload: { content: [{ kind: "text", text: "payload answer" }] },
            streams: {},
          },
          "payload-image": {
            id: "payload-image",
            type: "assistant_message",
            state: "completed",
            payload: {
              content: [
                { kind: "image", mimeType: "image/png", dataUrl: "data:image/png;base64,eA==" },
              ],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(state, "t1")).toEqual([
      "streaming",
      "stream-text",
      "payload-text",
      "payload-image",
    ]);
  });

  it("keeps plan and goal runtime items out of the inline transcript", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["assistant-1", "plan-1", "goal-1", "plan-2", "assistant-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "before" },
          },
          "plan-1": {
            id: "plan-1",
            type: "plan",
            state: "updated",
            streams: { plan_text: "- [ ] Build dock" },
          },
          "goal-1": {
            id: "goal-1",
            type: "goal",
            state: "completed",
            payload: { action: "set", objective: "Ship goal dock", status: "active" },
            streams: {},
          },
          "plan-2": {
            id: "plan-2",
            type: "plan",
            state: "updated",
            streams: { plan_text: "- [ ] Keep dock only" },
          },
          "assistant-2": {
            id: "assistant-2",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "after" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(state, "t1")).toEqual(["assistant-1", "assistant-2"]);
  });

  it("defers unnamed tool calls until an update provides a display name", () => {
    const itemIds = ["assistant-1", "tool-1"];
    const unnamedItems = {
      "assistant-1": {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "before" },
      },
      "tool-1": {
        id: "tool-1",
        type: "tool_call",
        state: "started",
        payload: { status: "running" },
        streams: {},
      },
    };
    const unnamedState = {
      runtimeItemIdsByThread: { deferred: itemIds },
      runtimeItemsByIdByThread: { deferred: unnamedItems },
      runtimeStructuralVersionByThread: { deferred: 1 },
    } as unknown as AppStoreState;
    const namedState = {
      ...unnamedState,
      runtimeItemsByIdByThread: {
        deferred: {
          ...unnamedItems,
          "tool-1": {
            ...unnamedItems["tool-1"],
            state: "updated",
            payload: { name: "Read", status: "running" },
          },
        },
      },
      runtimeStructuralVersionByThread: { deferred: 2 },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(unnamedState, "deferred")).toEqual(["assistant-1"]);
    expect(selectVisibleThreadTimelineEntries(unnamedState, "deferred")).toEqual([
      { kind: "item", id: "assistant-1" },
    ]);
    expect(selectVisibleThreadRuntimeItemIds(namedState, "deferred")).toEqual(itemIds);
    expect(selectVisibleThreadTimelineEntries(namedState, "deferred")).toEqual([
      { kind: "item", id: "assistant-1" },
      { kind: "item", id: "tool-1" },
    ]);
  });

  it("groups adjacent tool calls into one timeline entry", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["assistant-1", "tool-1", "mcp-1", "image-1", "command-1", "assistant-2", "tool-3"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "before" },
          },
          "tool-1": {
            id: "tool-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Viewing src/a.ts", status: "success" },
            streams: {},
          },
          "mcp-1": {
            id: "mcp-1",
            type: "mcp_tool_call",
            state: "completed",
            payload: { name: "mcp__github__search", status: "success" },
            streams: {},
          },
          "image-1": {
            id: "image-1",
            type: "image_view",
            state: "completed",
            payload: { name: "ViewImage", status: "success", args: { path: "screen.png" } },
            streams: {},
          },
          "command-1": {
            id: "command-1",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run lint" },
            streams: {},
          },
          "assistant-2": {
            id: "assistant-2",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "after" },
          },
          "tool-3": {
            id: "tool-3",
            type: "tool_call",
            state: "completed",
            payload: { name: "Viewing src/b.ts", status: "success" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      { kind: "item", id: "assistant-1" },
      {
        kind: "tool_call_group",
        id: "tool-call-group:tool-1",
        itemIds: ["tool-1", "mcp-1", "image-1", "command-1"],
      },
      { kind: "item", id: "assistant-2" },
      { kind: "item", id: "tool-3" },
    ]);
  });

  it("folds reasoning into adjacent tool-call groups as glue", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["reasoning-1", "tool-1", "command-1", "assistant-1", "reasoning-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "reasoning-1": {
            id: "reasoning-1",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "planning the change" },
          },
          "tool-1": {
            id: "tool-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Viewing src/a.ts", status: "success" },
            streams: {},
          },
          "command-1": {
            id: "command-1",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run lint" },
            streams: {},
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "done" },
          },
          "reasoning-2": {
            id: "reasoning-2",
            type: "reasoning",
            state: "updated",
            streams: { reasoning_text: "wrapping up" },
          },
        },
      },
    } as unknown as AppStoreState;

    // Providers emit a Thought before nearly every tool call; treating them as
    // run breakers would disable grouping outright.
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:reasoning-1",
        itemIds: ["reasoning-1", "tool-1", "command-1"],
      },
      { kind: "item", id: "assistant-1" },
      { kind: "item", id: "reasoning-2" },
    ]);
  });

  it("groups a lone tool call together with its surrounding thoughts", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["reasoning-1", "tool-1", "reasoning-2", "assistant-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "reasoning-1": {
            id: "reasoning-1",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "planning" },
          },
          "tool-1": {
            id: "tool-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Viewing src/a.ts", status: "success" },
            streams: {},
          },
          "reasoning-2": {
            id: "reasoning-2",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "reviewing" },
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "done" },
          },
        },
      },
    } as unknown as AppStoreState;

    // Thoughts are group members like any other tool row, so `thought → tool
    // → thought` is a group of three.
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:reasoning-1",
        itemIds: ["reasoning-1", "tool-1", "reasoning-2"],
      },
      { kind: "item", id: "assistant-1" },
    ]);
  });

  it("groups same-file edits even when thoughts sit between them", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["edit-1", "reasoning-1", "edit-2", "reasoning-2", "edit-3", "assistant-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "edit-1": {
            id: "edit-1",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 10, removed: 2 },
            },
            streams: {},
          },
          "reasoning-1": {
            id: "reasoning-1",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "Now update the mobile section." },
          },
          "edit-2": {
            id: "edit-2",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 20, removed: 4 },
            },
            streams: {},
          },
          "reasoning-2": {
            id: "reasoning-2",
            type: "reasoning",
            state: "completed",
            streams: { reasoning_text: "Now update the desktop submenu." },
          },
          "edit-3": {
            id: "edit-3",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 5, removed: 1 },
            },
            streams: {},
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "done" },
          },
        },
      },
    } as unknown as AppStoreState;

    // Thoughts are glue: the run still collapses into one group, and the
    // group body merges the consecutive same-file edits into one edit row.
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:edit-1",
        itemIds: ["edit-1", "reasoning-1", "edit-2", "reasoning-2", "edit-3"],
      },
      { kind: "item", id: "assistant-1" },
    ]);
  });

  it("still groups consecutive same-file edits with no intervening items", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["edit-1", "edit-2", "edit-3", "assistant-1"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "edit-1": {
            id: "edit-1",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 10, removed: 2 },
            },
            streams: {},
          },
          "edit-2": {
            id: "edit-2",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 20, removed: 4 },
            },
            streams: {},
          },
          "edit-3": {
            id: "edit-3",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/ComposerAddMenu.tsx",
              changeKind: "edit",
              diffSummary: { added: 5, removed: 1 },
            },
            streams: {},
          },
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "done" },
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:edit-1",
        itemIds: ["edit-1", "edit-2", "edit-3"],
      },
      { kind: "item", id: "assistant-1" },
    ]);
  });

  it("keeps active Workflow tool calls as standalone background items", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["tool-1", "workflow-1", "tool-2"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "tool-1": {
            id: "tool-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Read", status: "success" },
            streams: {},
          },
          "workflow-1": {
            id: "workflow-1",
            type: "tool_call",
            state: "started",
            payload: { name: "Workflow", status: "running" },
            streams: {},
            observedLive: true,
          },
          "tool-2": {
            id: "tool-2",
            type: "tool_call",
            state: "completed",
            payload: { name: "Glob", status: "success" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectActiveSubAgentParentItemIds(state, "t1")).toEqual(["workflow-1"]);
    expect(selectThreadHasActiveNativeSubAgent(state, "t1")).toBe(false);
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      { kind: "item", id: "tool-1" },
      { kind: "item", id: "workflow-1" },
      { kind: "item", id: "tool-2" },
    ]);
  });

  it("drops workflows hydrated from history (not observed live this session)", () => {
    const state = {
      runtimeItemIdsByThread: { t1: ["workflow-replayed"] },
      runtimeItemsByIdByThread: {
        t1: {
          "workflow-replayed": {
            id: "workflow-replayed",
            type: "tool_call",
            state: "completed",
            payload: { name: "Workflow", status: "success" },
            streams: {},
            // No observedLive — seeded from the DB on thread reopen. The
            // launching process is gone; the composer dock must stay empty.
          },
        },
      },
      runtimeStructuralVersionByThread: { t1: 1 },
    } as unknown as AppStoreState;

    expect(selectActiveSubAgentParentItemIds(state, "t1")).toEqual([]);
  });

  it("tracks running native Agent calls without retaining completed ones", () => {
    const itemIds = ["agent-running", "agent-completed", "workflow-completed"];
    const items = {
      "agent-running": {
        id: "agent-running",
        type: "tool_call",
        state: "started",
        payload: {
          name: "Agent",
          status: "running",
          args: { subagent_type: "Explore" },
        },
        streams: {},
      },
      "agent-completed": {
        id: "agent-completed",
        type: "tool_call",
        state: "completed",
        payload: {
          name: "Agent",
          status: "success",
          args: { subagent_type: "Explore" },
        },
        streams: {},
      },
      "workflow-completed": {
        id: "workflow-completed",
        type: "tool_call",
        state: "completed",
        payload: { name: "Workflow", status: "success" },
        streams: {},
        observedLive: true,
      },
    };
    const activeState = {
      runtimeItemIdsByThread: { t1: itemIds },
      runtimeItemsByIdByThread: { t1: items },
      runtimeStructuralVersionByThread: { t1: 1 },
    } as unknown as AppStoreState;
    const settledState = {
      runtimeItemIdsByThread: { t1: itemIds },
      runtimeItemsByIdByThread: {
        t1: {
          ...items,
          "agent-running": {
            ...items["agent-running"],
            state: "completed",
            payload: { ...items["agent-running"].payload },
          },
        },
      },
      runtimeStructuralVersionByThread: { t1: 2 },
    } as unknown as AppStoreState;

    expect(selectActiveSubAgentParentItemIds(activeState, "t1")).toEqual([
      "agent-running",
      "workflow-completed",
    ]);
    expect(selectThreadHasActiveNativeSubAgent(activeState, "t1")).toBe(true);
    expect(selectActiveSubAgentParentItemIds(settledState, "t1")).toEqual(["workflow-completed"]);
    expect(selectThreadHasActiveNativeSubAgent(settledState, "t1")).toBe(false);

    const projectThreads = [{ id: "t1" }] as Thread[];
    expect(selectActiveNativeSubAgentThreadIds(activeState, projectThreads)).toEqual(["t1"]);
    const settledThreadIds = selectActiveNativeSubAgentThreadIds(settledState, projectThreads);
    expect(settledThreadIds).toEqual([]);
    expect(selectActiveNativeSubAgentThreadIds(settledState, projectThreads)).toBe(
      settledThreadIds,
    );
  });

  it("hides Crossagents run_agent calls and only treats the synthetic tile as an agent", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["tool-1", "raw-run", "failed-run", "list-1", "sub:run-1", "raw-spawn"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "tool-1": {
            id: "tool-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Viewing src/a.ts", status: "success" },
            streams: {},
          },
          "raw-run": {
            id: "raw-run",
            type: "mcp_tool_call",
            state: "started",
            payload: { name: "mcp__crossagents__run_agent", status: "running" },
            streams: {},
          },
          "failed-run": {
            id: "failed-run",
            type: "mcp_tool_call",
            state: "completed",
            payload: { name: "mcp__crossagents__run_agent", status: "error" },
            streams: {},
          },
          "list-1": {
            id: "list-1",
            type: "mcp_tool_call",
            state: "completed",
            payload: { name: "mcp__crossagents__list_agents", status: "success" },
            streams: {},
          },
          "sub:run-1": {
            id: "sub:run-1",
            type: "tool_call",
            state: "started",
            payload: {
              name: "Codex · GPT-5.5",
              status: "running",
              isCrossagent: true,
            },
            streams: {},
          },
          "raw-spawn": {
            id: "raw-spawn",
            type: "tool_call",
            state: "completed",
            payload: { name: "spawn_agent", serverId: "crossagents", status: "success" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(state, "t1")).toEqual([
      "tool-1",
      "failed-run",
      "list-1",
      "sub:run-1",
      "raw-spawn",
    ]);
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:tool-1",
        itemIds: ["tool-1", "failed-run", "list-1"],
      },
      { kind: "item", id: "sub:run-1" },
      { kind: "item", id: "raw-spawn" },
    ]);
    // The synthetic tile still drives the active sub-agent strip.
    expect(selectActiveSubAgentParentItemIds(state, "t1")).toEqual(["sub:run-1"]);
  });

  it("groups adjacent edits with the rest of the tool-call run", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: [
          "assistant-1",
          "edit-1",
          "edit-2",
          "command-1",
          "command-2",
          "assistant-2",
          "edit-3",
          "edit-4",
        ],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "assistant-1": {
            id: "assistant-1",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "before" },
          },
          "edit-1": {
            id: "edit-1",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/renderer/components/thread/ThreadComposer.tsx",
              changeKind: "edit",
            },
            streams: {},
          },
          "edit-2": {
            id: "edit-2",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/renderer/components/thread/ThreadComposer.tsx",
              changeKind: "edit",
            },
            streams: {},
          },
          "command-1": {
            id: "command-1",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run typecheck" },
            streams: {},
          },
          "command-2": {
            id: "command-2",
            type: "command_execution",
            state: "completed",
            payload: { command: "pnpm run lint" },
            streams: {},
          },
          "assistant-2": {
            id: "assistant-2",
            type: "assistant_message",
            state: "completed",
            streams: { assistant_text: "after" },
          },
          "edit-3": {
            id: "edit-3",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/renderer/components/thread/ThreadSlashCommands.tsx",
              changeKind: "edit",
            },
            streams: {},
          },
          "edit-4": {
            id: "edit-4",
            type: "file_change",
            state: "completed",
            payload: {
              path: "src/renderer/components/thread/ThreadComposer.tsx",
              changeKind: "edit",
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      { kind: "item", id: "assistant-1" },
      {
        kind: "tool_call_group",
        id: "tool-call-group:edit-1",
        itemIds: ["edit-1", "edit-2", "command-1", "command-2"],
      },
      { kind: "item", id: "assistant-2" },
      {
        kind: "tool_call_group",
        id: "tool-call-group:edit-3",
        itemIds: ["edit-3", "edit-4"],
      },
    ]);
  });

  it("groups generic edit tool calls with adjacent tools", () => {
    const state = {
      runtimeItemIdsByThread: {
        t1: ["tool-edit-1", "tool-edit-2", "tool-read-1", "tool-edit-3"],
      },
      runtimeItemsByIdByThread: {
        t1: {
          "tool-edit-1": {
            id: "tool-edit-1",
            type: "tool_call",
            state: "completed",
            payload: {
              name: "Edit",
              kind: "edit",
              status: "success",
              locations: [{ path: "src/foo.ts" }],
            },
            streams: {},
          },
          "tool-edit-2": {
            id: "tool-edit-2",
            type: "tool_call",
            state: "completed",
            payload: {
              name: "Edit",
              kind: "edit",
              status: "success",
              locations: [{ path: "src/foo.ts" }],
            },
            streams: {},
          },
          "tool-read-1": {
            id: "tool-read-1",
            type: "tool_call",
            state: "completed",
            payload: { name: "Read", kind: "read", status: "success" },
            streams: {},
          },
          "tool-edit-3": {
            id: "tool-edit-3",
            type: "tool_call",
            state: "completed",
            payload: {
              name: "Edit",
              kind: "edit",
              status: "success",
              locations: [{ path: "src/bar.ts" }],
            },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:tool-edit-1",
        itemIds: ["tool-edit-1", "tool-edit-2", "tool-read-1", "tool-edit-3"],
      },
    ]);
  });
});
// @vitest-environment node
