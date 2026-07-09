import { describe, expect, it } from "vitest";
import type { AppStoreState } from "@/renderer/state/appStore";
import {
  selectActiveSubAgentParentItemIds,
  selectVisibleThreadRuntimeItemIds,
  selectVisibleThreadTimelineEntries,
} from "./chatPaneSelectors";

describe("chatPaneSelectors", () => {
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
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      { kind: "item", id: "tool-1" },
      { kind: "item", id: "workflow-1" },
      { kind: "item", id: "tool-2" },
    ]);
  });

  it("suppresses raw subagents run_agent/spawn_agent MCP rows but keeps the tile and sibling tools", () => {
    // The raw provider MCP row duplicates the synthetic sub-agent tile
    // (`sub:<runId>`, payload.isSubAgent). Only the raw row is dropped — the
    // tile and non-spawning subagents tools stay, and the "Ran N tools" group
    // never counts the suppressed rows.
    const state = {
      runtimeItemIdsByThread: {
        t1: ["tool-1", "raw-run", "list-1", "sub:run-1", "raw-spawn"],
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
            payload: { name: "mcp__subagents__run_agent", status: "running" },
            streams: {},
          },
          "list-1": {
            id: "list-1",
            type: "mcp_tool_call",
            state: "completed",
            payload: { name: "mcp__subagents__list_agents", status: "success" },
            streams: {},
          },
          "sub:run-1": {
            id: "sub:run-1",
            type: "tool_call",
            state: "started",
            payload: {
              name: "mcp__subagents__run_agent",
              status: "running",
              isSubAgent: true,
            },
            streams: {},
          },
          "raw-spawn": {
            id: "raw-spawn",
            type: "tool_call",
            state: "completed",
            payload: { name: "spawn_agent", serverId: "subagents", status: "success" },
            streams: {},
          },
        },
      },
    } as unknown as AppStoreState;

    expect(selectVisibleThreadRuntimeItemIds(state, "t1")).toEqual([
      "tool-1",
      "list-1",
      "sub:run-1",
    ]);
    // Grouping (which drives the "N tools" header counts) only ever sees the
    // visible rows; the running raw row does not leave a dangling group entry.
    expect(selectVisibleThreadTimelineEntries(state, "t1")).toEqual([
      {
        kind: "tool_call_group",
        id: "tool-call-group:tool-1",
        itemIds: ["tool-1", "list-1"],
      },
      { kind: "item", id: "sub:run-1" },
    ]);
    // The synthetic tile still drives the active sub-agent strip.
    expect(selectActiveSubAgentParentItemIds(state, "t1")).toEqual(["sub:run-1"]);
  });

  it("groups edits only with edits to the same file", () => {
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
        itemIds: ["edit-1", "edit-2"],
      },
      {
        kind: "tool_call_group",
        id: "tool-call-group:command-1",
        itemIds: ["command-1", "command-2"],
      },
      { kind: "item", id: "assistant-2" },
      { kind: "item", id: "edit-3" },
      { kind: "item", id: "edit-4" },
    ]);
  });

  it("applies the same edit grouping rule to generic edit tool calls", () => {
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
        itemIds: ["tool-edit-1", "tool-edit-2"],
      },
      { kind: "item", id: "tool-read-1" },
      { kind: "item", id: "tool-edit-3" },
    ]);
  });
});
