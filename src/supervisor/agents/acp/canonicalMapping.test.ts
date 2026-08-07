import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk";
import {
  closeOpenTurnItems,
  createAcpMapperState,
  mapAcpGoalSlashCommand,
  mapAcpPermissionRequest,
  mapAcpSessionUpdate,
  PORACODE_ACP_GOAL_META_KEY,
  PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY,
  PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY,
  PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY,
} from "./canonicalMapping";

/**
 * Smoke tests for the generic ACP → canonical RuntimeEvent mapper.
 *
 * These cover the high-value translation paths exercised by every ACP-speaking
 * adapter (Copilot today; user-registered acp-generic instances and Zed's
 * codex-acp shim by extension).
 */

function note(update: SessionNotification["update"]): SessionNotification {
  return { sessionId: "s1", update };
}

describe("mapAcpSessionUpdate", () => {
  it("maps provider-normalized ACP goal metadata independently from empty text boundaries", () => {
    const state = createAcpMapperState("t-goal");
    const set = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          [PORACODE_ACP_GOAL_META_KEY]: {
            action: "set",
            objective: "Ship ACP goal support",
            status: "active",
            availableActions: ["pause", "clear"],
            timeUsedSeconds: 0,
            updatedAt: 1_784_627_753.997,
          },
        },
      } as SessionNotification["update"]),
      state,
    );
    expect(set).toEqual([
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
        payload: expect.objectContaining({
          action: "set",
          objective: "Ship ACP goal support",
          status: "active",
          availableActions: ["pause", "clear"],
        }),
      }),
      expect.objectContaining({ type: "item.completed" }),
    ]);
    expect(state.openAssistantItemId).toBeUndefined();
    const goalItemId = state.goalItemId;
    expect(goalItemId).toBeDefined();

    const checking = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          [PORACODE_ACP_GOAL_META_KEY]: {
            action: "updated",
            objective: "Ship ACP goal support",
            status: "active",
            iterations: 2,
            lastReason: "One test remains",
          },
        },
      } as SessionNotification["update"]),
      state,
    );
    expect(checking).toEqual([
      expect.objectContaining({
        type: "item.updated",
        itemId: goalItemId,
        payload: expect.objectContaining({ iterations: 2, lastReason: "One test remains" }),
      }),
      expect.objectContaining({ type: "item.completed", itemId: goalItemId }),
    ]);

    const terminal = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          [PORACODE_ACP_GOAL_META_KEY]: {
            action: "updated",
            objective: "Ship ACP goal support",
            status: "failed",
            lastReason: "The provider stopped the goal",
          },
        },
      } as SessionNotification["update"]),
      state,
    );
    expect(terminal[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { status: "failed" },
    });
    expect(state.goalItemId).toBeUndefined();
  });

  it("clears an active canonical ACP goal item", () => {
    const state = createAcpMapperState("t-goal-clear");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          [PORACODE_ACP_GOAL_META_KEY]: {
            action: "set",
            objective: "Temporary goal",
            status: "active",
          },
        },
      } as SessionNotification["update"]),
      state,
    );
    const goalItemId = state.goalItemId;

    const cleared = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "" },
        _meta: {
          [PORACODE_ACP_GOAL_META_KEY]: {
            action: "cleared",
            objective: "Temporary goal",
          },
        },
      } as SessionNotification["update"]),
      state,
    );
    expect(cleared[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "cleared" },
    });
    expect(state.goalItemId).toBeUndefined();
  });

  it("opens an assistant_message on first agent_message_chunk and streams deltas", () => {
    const state = createAcpMapperState("t-1");

    const first = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } }),
      state,
    );
    const second = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: " world" } }),
      state,
    );

    // First chunk → item.started + content.delta on a fresh assistant id.
    expect(first.map((e) => e.type)).toEqual(["item.started", "content.delta"]);
    expect(state.openAssistantItemId).toBeDefined();
    const itemId = state.openAssistantItemId!;
    expect((first[0] as { itemType?: string }).itemType).toBe("assistant_message");
    expect((first[1] as { itemId: string; delta: string }).itemId).toBe(itemId);
    expect((first[1] as { delta: string }).delta).toBe("Hello");

    // Second chunk → only content.delta on the same item.
    expect(second.map((e) => e.type)).toEqual(["content.delta"]);
    expect((second[0] as { itemId: string; delta: string }).itemId).toBe(itemId);
    expect((second[0] as { delta: string }).delta).toBe(" world");
  });

  it("drops empty agent text chunks without opening or updating an assistant item", () => {
    const state = createAcpMapperState("t-empty-agent-chunk");

    expect(
      mapAcpSessionUpdate(
        note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } }),
        state,
      ),
    ).toEqual([]);
    expect(state.openAssistantItemId).toBeUndefined();

    mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "answer" } }),
      state,
    );
    const itemId = state.openAssistantItemId;

    expect(
      mapAcpSessionUpdate(
        note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "" } }),
        state,
      ),
    ).toEqual([]);
    expect(state.openAssistantItemId).toBe(itemId);
  });

  it("drops whitespace-only agent text chunks but keeps whitespace inside a streaming message", () => {
    const state = createAcpMapperState("t-blank-agent-chunk");

    // Factory Droid (DeepSeek models) emits "\n\n" as a post-tool-call stream
    // boundary; it must not open a blank assistant row.
    expect(
      mapAcpSessionUpdate(
        note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "\n\n" } }),
        state,
      ),
    ).toEqual([]);
    expect(state.openAssistantItemId).toBeUndefined();

    mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Line" } }),
      state,
    );
    const itemId = state.openAssistantItemId;

    // Once a message is streaming, whitespace is real spacing.
    expect(
      mapAcpSessionUpdate(
        note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "\n\n" } }),
        state,
      ),
    ).toEqual([
      {
        type: "content.delta",
        threadId: "t-blank-agent-chunk",
        itemId,
        stream: "assistant_text",
        delta: "\n\n",
      },
    ]);
    expect(state.openAssistantItemId).toBe(itemId);
  });

  it("maps Factory Droid API failures in agent_message_chunk to runtime errors", () => {
    const state = createAcpMapperState("t-droid-limit");
    const text =
      'Error: 402 {"detail":"Usage limit reached.","status":402,"title":"Payment Required","displayToUser":true}';
    const events = mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } }),
      state,
    );
    expect(events).toEqual([
      { type: "error", threadId: "t-droid-limit", message: "Usage limit reached." },
    ]);
    expect(state.openAssistantItemId).toBeUndefined();
  });

  it("maps plain HTTP no-body agent errors to runtime errors", () => {
    const state = createAcpMapperState("t-droid-403");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Error: 403 status code (no body)" },
      }),
      state,
    );
    expect(events).toEqual([
      {
        type: "error",
        threadId: "t-droid-403",
        message:
          "Access denied (HTTP 403). Your Factory account may lack permission for this model or workspace.",
      },
    ]);
    expect(state.openAssistantItemId).toBeUndefined();
  });

  it("drops [MODE_UPDATE] agent text echoes — mode is chosen in the launcher, not chat", () => {
    // Gemini's ACP server emits `[MODE_UPDATE] <mode>` as a fresh
    // agent_message_chunk every time a session starts (or switches) into a
    // specific approval mode. The user already picked that mode in the
    // launcher UI; replaying it as a chat message on every turn is pure
    // noise, so the mapper must drop the chunk before opening an assistant
    // item.
    const state = createAcpMapperState("t-mode");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "[MODE_UPDATE] yolo" },
      }),
      state,
    );
    expect(events).toEqual([]);
    expect(state.openAssistantItemId).toBeUndefined();
  });

  it("drops user_message_chunk echoes — supervisor/renderer own the user_message item", () => {
    // Some ACP servers (Copilot) echo the user's prompt back as
    // `user_message_chunk` updates after we send `session/prompt`. The
    // supervisor (or the renderer's optimistic push) has already emitted the
    // user_message with a stable id, so surfacing the echo would duplicate
    // the message in the chat pane with a fresh, undeduppable id.
    const state = createAcpMapperState("t-echo");
    const events = mapAcpSessionUpdate(
      note({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "hi" } }),
      state,
    );
    expect(events).toEqual([]);
    expect(state.openUserItemId).toBeUndefined();
  });

  it("brackets reasoning items independently from assistant items", () => {
    const state = createAcpMapperState("t-2");

    mapAcpSessionUpdate(
      note({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "answer" } }),
      state,
    );
    const switchToReasoning = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "thinking..." },
      }),
      state,
    );

    // Switching to reasoning must close the assistant item then open a reasoning item.
    expect(switchToReasoning.map((e) => e.type)).toEqual([
      "item.completed",
      "item.started",
      "content.delta",
    ]);
    expect((switchToReasoning[1] as { itemType: string }).itemType).toBe("reasoning");
    expect(state.openAssistantItemId).toBeUndefined();
    expect(state.openReasoningItemId).toBeDefined();
  });

  it("starts a tool_call item, streams updates, and seals on terminal status", () => {
    const state = createAcpMapperState("t-3");

    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-1",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "pnpm run test", cwd: "C:\\repo" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(started[0]?.type).toBe("item.started");
    expect((started[0] as { itemType: string }).itemType).toBe("command_execution");
    // Canonical command_execution payload must carry `command`/`cwd` so the
    // chat renderer can surface them — ACP's source shape is `rawInput.{...}`.
    const startedPayload = (started[0] as { payload: Record<string, unknown> }).payload;
    expect(startedPayload.command).toBe("pnpm run test");
    expect(startedPayload.cwd).toBe("C:\\repo");
    // Original ACP fields stay on the payload so the accordion body can show
    // both the request and the eventual result.
    expect(startedPayload.name).toBe("shell exec");
    expect(startedPayload.title).toBe("shell exec");
    expect(startedPayload.kind).toBe("execute");
    expect(startedPayload.args).toEqual({ command: "pnpm run test", cwd: "C:\\repo" });

    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-1",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(updated[0]?.type).toBe("item.updated");

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-1",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed[0]?.type).toBe("item.completed");
    // Item map cleared so subsequent updates with the same id are ignored.
    expect(state.toolCallItems.has("tc-1")).toBe(false);
  });

  it("suppresses AskUserQuestion tool rows that are presented as ACP reply forms", () => {
    const state = createAcpMapperState("t-question");

    const started = mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-question",
          title: "AskUserQuestion: Ask user 1 question",
          kind: "other",
          status: "pending",
          rawInput: {
            questions: [
              {
                header: "Scope",
                question: "Which scope?",
                options: [{ label: "Focused", description: "Keep it focused." }],
              },
            ],
          },
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0],
      state,
    );

    expect(started).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-question")).toBe(true);

    const completed = mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-question",
          status: "completed",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0],
      state,
    );
    expect(completed).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-question")).toBe(false);
  });

  it("suppresses Factory droid's bare AskUser tool rows presented as reply forms", () => {
    const state = createAcpMapperState("t-question-droid");

    const started = mapAcpSessionUpdate(
      {
        sessionId: "s1",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "tc-question-droid",
          title: "AskUser",
          kind: "other",
          status: "pending",
          rawInput: {
            questionnaire: [
              "1. [question] Which features do you want to enable? (multi)",
              "[topic] Features",
              "[option] Auth handling",
              "[option] Login Page",
            ].join("\n"),
          },
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0],
      state,
    );

    expect(started).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-question-droid")).toBe(true);
  });

  it("omits `name` on a bare tool_call so the renderer defers the unnamed row", () => {
    const state = createAcpMapperState("t-bare");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-bare",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(started[0]?.type).toBe("item.started");
    const payload = (started[0] as { payload: Record<string, unknown> }).payload;
    expect(payload.name).toBeUndefined();
  });

  it("keeps a kind-derived name when only `kind` is present on the initial event", () => {
    const state = createAcpMapperState("t-kindname");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-k",
        kind: "read",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect((started[0] as { payload: Record<string, unknown> }).payload.name).toBe("read");
  });

  it("falls back to a generic name when a bare tool_call completes without ever being named", () => {
    const state = createAcpMapperState("t-bare-complete");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-x",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-x",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed[0]?.type).toBe("item.completed");
    expect((completed[0] as { payload: Record<string, unknown> }).payload.name).toBe("Tool");
  });

  it("names a single-shot completed bare tool_call with the generic fallback", () => {
    const state = createAcpMapperState("t-single");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-s",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const completed = events.find((e) => e.type === "item.completed");
    expect((completed as { payload: Record<string, unknown> }).payload.name).toBe("Tool");
  });

  it("names an orphaned bare tool_call when the turn ends", () => {
    const state = createAcpMapperState("t-orphan");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-o",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const closed = closeOpenTurnItems(state);
    const completed = closed.find((e) => e.type === "item.completed");
    expect((completed as { payload: Record<string, unknown> }).payload.name).toBe("Tool");
  });

  it("sets the name from a kind-only update when the tool call has no name yet", () => {
    const state = createAcpMapperState("t-kindupd");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-ku",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-ku",
        kind: "read",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect((updated[0] as { payload: Record<string, unknown> }).payload.name).toBe("read");
    expect(state.toolCallItems.get("tc-ku")?.payload.name).toBe("read");
  });

  it("does not let a kind-only update overwrite a title-derived name", () => {
    const state = createAcpMapperState("t-merge");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-m",
        title: "Read config",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-m",
        kind: "read",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    // The kind-only update must not carry a name that would clobber the title.
    expect((updated[0] as { payload: Record<string, unknown> }).payload.name).toBeUndefined();
    expect(state.toolCallItems.get("tc-m")?.payload.name).toBe("Read config");
  });

  it("preserves generic ACP Skill and MCP tool names for Grok and Factory-style adapters", () => {
    const state = createAcpMapperState("t-generic-tools");

    const skill = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-skill",
        title: "Skill",
        kind: "other",
        status: "in_progress",
        rawInput: { name: "browser" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(skill[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: {
        name: "Skill",
        title: "Skill",
        kind: "other",
        args: { name: "browser" },
        status: "running",
      },
    });

    const mcp = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-mcp",
        title: "mcp__browser__snapshot",
        kind: "other",
        status: "in_progress",
        rawInput: { url: "https://poracode.app" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(mcp[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: {
        name: "mcp__browser__snapshot",
        title: "mcp__browser__snapshot",
        kind: "other",
        args: { url: "https://poracode.app" },
        status: "running",
      },
    });
  });

  it("preserves Qoder ACP MCP tool calls and their results", () => {
    const state = createAcpMapperState("t-qoder-mcp");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-qoder-mcp",
        title: "echo_marker (poracode_smoke MCP Server)",
        kind: "other",
        status: "in_progress",
        rawInput: { text: "MCP_QODER_OK" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(started[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: {
        name: "echo_marker (poracode_smoke MCP Server)",
        args: { text: "MCP_QODER_OK" },
        status: "running",
      },
    });

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-qoder-mcp",
        status: "completed",
        rawOutput: "MCP_QODER_OK",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({ status: "success", result: "MCP_QODER_OK" }),
      }),
    );
  });

  it("preserves inline image content from a tool result onto payload.images", () => {
    const state = createAcpMapperState("t-image");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-img",
        title: "generate_image",
        kind: "other",
        status: "in_progress",
        rawInput: { prompt: "a red square" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-img",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" },
          },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    // A terminal tool_call_update seals the row on `item.completed`, carrying
    // the final payload. The base64 image survives onto payload.images as a
    // renderable data URL so the chat row can show it inline (the text-only
    // extractor would drop it).
    const sealed = completed.find((e) => e.type === "item.completed") as
      | { payload?: Record<string, unknown> }
      | undefined;
    expect(sealed?.payload?.images).toEqual(["data:image/png;base64,iVBORw0KGgo="]);
  });

  it("falls back to the tool title for command_execution when rawInput.command is missing", () => {
    // Gemini's ACP run_shell_command tool emits `kind: "execute"` with the
    // command in `title` instead of `rawInput.command`. Without the fallback
    // the chat row renders `Run: (command)` because canonical `command` is
    // empty.
    const state = createAcpMapperState("t-gemini-shell");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-gemini",
        title: "git status",
        kind: "execute",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("command_execution");
    expect(started.payload.command).toBe("git status");
    expect(started.payload.title).toBe("git status");
  });

  it("inlines ACP terminal output when the tool_call references a `terminal` content block", () => {
    // Gemini's shell tool spawns a client-hosted PTY via `createTerminal` and
    // references it from `content: [{ type: "terminal", terminalId }]`. The
    // session passes a resolver into the mapper state that returns the live
    // PTY output for that id; we must surface it on the canonical `result`.
    const state = createAcpMapperState("t-gemini-terminal");
    state.resolveTerminalOutput = (id) =>
      id === "acp-terminal-0" ? "On branch master\nnothing to commit" : undefined;
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-term",
        title: "git status",
        kind: "execute",
        status: "in_progress",
        content: [{ type: "terminal", terminalId: "acp-terminal-0" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-term",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    // Even though the completion update has no `content` array, the mapper
    // remembers the terminalId from the initial tool_call and re-snapshots
    // the PTY output via the resolver.
    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload.result).toBe("On branch master\nnothing to commit");
  });

  it("inlines ACP terminal output by command when terminal content is omitted", () => {
    const state = createAcpMapperState("t-gemini-terminal-by-command");
    state.resolveTerminalOutputByCommand = (command) =>
      command === "git diff --name-only HEAD"
        ? "src/main.ts\nsrc/supervisor/runtime.ts"
        : undefined;
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-term-command",
        title: "git diff --name-only HEAD",
        kind: "execute",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const itemId = (started[0] as { itemId: string }).itemId;

    const closed = closeOpenTurnItems(state);

    expect(closed).toEqual([
      {
        type: "item.completed",
        threadId: "t-gemini-terminal-by-command",
        itemId,
        payload: expect.objectContaining({
          result: "src/main.ts\nsrc/supervisor/runtime.ts",
        }),
      },
    ]);
  });

  it("completes terminal tool_call updates that arrive already terminal", () => {
    const state = createAcpMapperState("t-gemini-terminal-immediate");
    state.resolveTerminalOutputByCommand = (command) =>
      command === "git status" ? "On branch master\nnothing to commit" : undefined;
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-term-immediate",
        title: "git status",
        kind: "execute",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe("item.started");
    expect(events[1]).toMatchObject({
      type: "item.completed",
      payload: { result: "On branch master\nnothing to commit" },
    });
    expect(closeOpenTurnItems(state)).toEqual([]);
  });

  it("surfaces ACP content text on the canonical result so Gemini shell output renders", () => {
    // Gemini's ACP shell tool emits its stdout in `content: [{ type: "content",
    // content: { type: "text", text: "..." } }]` rather than `rawOutput`. The
    // chat row's accordion body reads from `payload.result`, so we must mirror
    // the content text onto `result` here.
    const state = createAcpMapperState("t-gemini-output");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-gemini-out",
        title: "git status",
        kind: "execute",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-gemini-out",
        status: "completed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "On branch master\nnothing to commit" },
          },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload.result).toBe("On branch master\nnothing to commit");
  });

  it("prefers rawOutput over content text when both are present", () => {
    // Copilot-style updates carry the structured payload on `rawOutput` and
    // sometimes also echo a text summary in `content`. Keep rawOutput so the
    // renderer can pretty-print JSON.
    const state = createAcpMapperState("t-rawoutput-wins");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-mixed",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "ls" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-mixed",
        status: "completed",
        rawOutput: { stdout: "file.txt" },
        content: [{ type: "content", content: { type: "text", text: "fallback text" } }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const terminal = completed[0] as { payload: Record<string, unknown> };
    expect(terminal.payload.result).toEqual({ stdout: "file.txt" });
  });

  it("does not use a generic ACP title as the command (Copilot 'shell exec')", () => {
    // If the title is just a generic descriptor like "shell exec" we'd rather
    // show the renderer's `(command)` placeholder than mis-label the row.
    const state = createAcpMapperState("t-copilot-shell-generic");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-copilot-generic",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("command_execution");
    expect(started.payload.command).toBe("");
  });

  it("seals orphaned tool calls at turn end", () => {
    const state = createAcpMapperState("t-stop-tool");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-stop",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "pnpm run test" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const itemId = (started[0] as { itemId: string }).itemId;

    expect(closeOpenTurnItems(state)).toEqual([
      {
        type: "item.completed",
        threadId: "t-stop-tool",
        itemId,
        payload: expect.objectContaining({ command: "pnpm run test" }),
      },
    ]);
    expect(state.toolCallItems.size).toBe(0);
  });

  it("seals open plans at turn end without leaving active steps in progress", () => {
    const state = createAcpMapperState("t-stop-plan");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "plan",
        entries: [
          { content: "Inspect output", status: "completed" },
          { content: "Patch UI", status: "in_progress" },
          { content: "Verify", status: "pending" },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const itemId = (started[0] as { itemId: string }).itemId;

    expect(closeOpenTurnItems(state)).toEqual([
      {
        type: "item.completed",
        threadId: "t-stop-plan",
        itemId,
        payload: {
          steps: [
            { step: "Inspect output", status: "completed" },
            { step: "Patch UI", status: "pending" },
            { step: "Verify", status: "pending" },
          ],
        },
      },
    ]);
    expect(state.openPlanItemId).toBeUndefined();
    expect(state.openPlanSteps).toBeUndefined();
  });

  it("extracts plan steps from todo_write tool_call and suppresses the tool row", () => {
    const state = createAcpMapperState("t-todo-write");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-todo-1",
        title: "todo_write",
        kind: "other",
        status: "in_progress",
        rawInput: {
          todos: [
            { content: "Read files", status: "completed" },
            { content: "Write code", status: "in_progress" },
            { content: "Run tests", status: "pending" },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    // The tool row must NOT appear — only plan lifecycle events.
    expect(
      events.every(
        (e) => e.type !== "item.started" || (e as { itemType?: string }).itemType === "plan",
      ),
    ).toBe(true);
    const planStarted = events.find(
      (e) => e.type === "item.started" && (e as { itemType?: string }).itemType === "plan",
    ) as { itemId: string; payload: { steps: Array<{ step: string; status: string }> } };
    expect(planStarted).toBeDefined();
    expect(planStarted.payload.steps).toEqual([
      { step: "Read files", status: "completed" },
      { step: "Write code", status: "in_progress" },
      { step: "Run tests", status: "pending" },
    ]);
    expect(state.suppressedToolCallIds.has("tc-todo-1")).toBe(true);
    expect(state.suppressedTodoWriteIds.has("tc-todo-1")).toBe(true);
  });

  it("updates plan steps from todo_write tool_call_update", () => {
    const state = createAcpMapperState("t-todo-update");
    // Initial tool_call with partial input
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-todo-2",
        title: "todowrite",
        kind: "other",
        status: "in_progress",
        rawInput: {
          todos: [
            { content: "Step A", status: "in_progress" },
            { content: "Step B", status: "pending" },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    // tool_call_update with completed steps
    const updateEvents = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-todo-2",
        status: "completed",
        rawInput: {
          todos: [
            { content: "Step A", status: "completed" },
            { content: "Step B", status: "completed" },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    // All steps completed → plan item should be completed and cleared.
    const planCompleted = updateEvents.find((e) => e.type === "item.completed");
    expect(planCompleted).toBeDefined();
    expect(
      (planCompleted as { payload: { steps: Array<{ status: string }> } }).payload.steps.every(
        (s) => s.status === "completed",
      ),
    ).toBe(true);
    expect(state.openPlanItemId).toBeUndefined();
    expect(state.suppressedToolCallIds.has("tc-todo-2")).toBe(false);
    expect(state.suppressedTodoWriteIds.has("tc-todo-2")).toBe(false);
  });

  it("does not suppress non-todo tool calls", () => {
    const state = createAcpMapperState("t-no-todo");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-regular",
        title: "read_file",
        kind: "read",
        status: "in_progress",
        rawInput: { path: "foo.ts" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(
      events.some(
        (e) => e.type === "item.started" && (e as { itemType?: string }).itemType === "tool_call",
      ),
    ).toBe(true);
    expect(state.suppressedToolCallIds.has("tc-regular")).toBe(false);
  });

  it("detects todo_write via the ACP 1.3 name field", () => {
    const state = createAcpMapperState("t-todo-name");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-todo-name",
        title: "Update task list",
        kind: "other",
        name: "todo_write",
        status: "in_progress",
        rawInput: {
          todos: [
            { content: "Alpha", status: "completed" },
            { content: "Beta", status: "pending" },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const planStarted = events.find(
      (e) => e.type === "item.started" && (e as { itemType?: string }).itemType === "plan",
    ) as { payload: { steps: Array<{ step: string; status: string }> } };
    expect(planStarted).toBeDefined();
    expect(planStarted.payload.steps).toEqual([
      { step: "Alpha", status: "completed" },
      { step: "Beta", status: "pending" },
    ]);
    expect(state.suppressedTodoWriteIds.has("tc-todo-name")).toBe(true);
  });

  it("handles plan_update with items content", () => {
    const state = createAcpMapperState("t-plan-update-items");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "plan_update",
        plan: {
          type: "items",
          planId: "p1",
          entries: [
            { content: "Design API", status: "completed" },
            { content: "Implement", status: "in_progress" },
            { content: "Test", status: "pending" },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const planStarted = events.find(
      (e) => e.type === "item.started" && (e as { itemType?: string }).itemType === "plan",
    ) as { payload: { steps: Array<{ step: string; status: string }> } };
    expect(planStarted).toBeDefined();
    expect(planStarted.payload.steps).toEqual([
      { step: "Design API", status: "completed" },
      { step: "Implement", status: "in_progress" },
      { step: "Test", status: "pending" },
    ]);
  });

  it("handles plan_update with markdown content", () => {
    const state = createAcpMapperState("t-plan-update-md");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "plan_update",
        plan: {
          type: "markdown",
          planId: "p2",
          content: "# Plan\n- [x] Research\n- [ ] Build\n- [ ] Ship",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const planStarted = events.find(
      (e) => e.type === "item.started" && (e as { itemType?: string }).itemType === "plan",
    ) as { payload: { steps: Array<{ step: string; status: string }> } };
    expect(planStarted).toBeDefined();
    expect(planStarted.payload.steps).toEqual([
      { step: "Research", status: "completed" },
      { step: "Build", status: "pending" },
      { step: "Ship", status: "pending" },
    ]);
  });

  it("handles plan_removed by completing the open plan", () => {
    const state = createAcpMapperState("t-plan-removed");
    // First create a plan
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "plan",
        entries: [{ content: "Step 1", status: "in_progress" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(state.openPlanItemId).toBeDefined();
    // Then remove it
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "plan_removed",
        planId: "p1",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(events.some((e) => e.type === "item.completed")).toBe(true);
    expect(state.openPlanItemId).toBeUndefined();
    expect(state.openPlanSteps).toBeUndefined();
  });

  it("extracts file_change path and diff from ACP content diff blocks when rawInput is empty", () => {
    const state = createAcpMapperState("t-fc-content-diff");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-content-diff",
        title: "Edit File",
        kind: "edit",
        status: "completed",
        rawInput: {},
        content: [
          {
            type: "diff",
            path: "src/renderer/App.tsx",
            oldText: "const x = 1;\n",
            newText: "const x = 2;\n",
          },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload.path).toBe("src/renderer/App.tsx");
    expect(started.payload.changeKind).toBe("edit");
    expect(started.payload.diffSummary).toEqual({ added: 1, removed: 1 });
    expect(started.payload.result).toContain("diff --git a/src/renderer/App.tsx");
    expect(started.payload.result).toContain("-const x = 1;");
    expect(started.payload.result).toContain("+const x = 2;");
  });

  it("classifies empty-old-text ACP content diffs as creates", () => {
    const state = createAcpMapperState("t-fc-content-create");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-content-create",
        title: "Edit File",
        kind: "edit",
        status: "completed",
        rawInput: {},
        content: [
          {
            type: "diff",
            path: "index.html",
            oldText: "",
            newText: "<!DOCTYPE html>\n<html></html>\n",
          },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload).toMatchObject({
      path: "index.html",
      changeKind: "create",
      diffSummary: { added: 2, removed: 0 },
    });
  });

  it("drops fake removed-line counts from ACP content creates", () => {
    const state = createAcpMapperState("t-fc-content-create-blank-old");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-content-create-blank-old",
        title: "Create file",
        kind: "edit",
        status: "completed",
        rawInput: {},
        content: [
          {
            type: "diff",
            path: "index.html",
            oldText: "\n",
            newText: "<!DOCTYPE html>\n<html></html>\n",
          },
        ],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload).toMatchObject({
      path: "index.html",
      changeKind: "create",
      diffSummary: { added: 2, removed: 0 },
    });
  });

  it("extracts file_change path from apply_patch text args", () => {
    const state = createAcpMapperState("t-fc");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc",
        title: "apply_patch",
        kind: "edit",
        status: "in_progress",
        rawInput: "*** Begin Patch\n*** Update File: src/foo.ts\n@@\n-old\n+new\n*** End Patch",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload.path).toBe("src/foo.ts");
    expect(started.payload.changeKind).toBe("edit");
  });

  it("classifies Droid ApplyPatch as file_change even when kind is not edit", () => {
    // Droid's ACP adapter emits `ApplyPatch` (camelCase, no underscore) as the
    // tool title/name. The word-boundary regex `\bpatch\b` does NOT match
    // "ApplyPatch" because there is no boundary between "Apply" and "Patch",
    // so the mapper must recognise the name explicitly.
    const state = createAcpMapperState("t-fc-droid-applypatch");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-droid",
        title: "ApplyPatch",
        kind: "other",
        status: "in_progress",
        rawInput: {
          patch: "*** Begin Patch\n*** Update File: src/bar.ts\n@@\n-old\n+new\n*** End Patch",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload.path).toBe("src/bar.ts");
    expect(started.payload.changeKind).toBe("edit");
  });

  it("classifies ACP write content payloads as creates", () => {
    const state = createAcpMapperState("t-fc-write-create");
    const rawInput = {
      filePath: "index.html",
      content: "<!DOCTYPE html>\n<html></html>\n",
    };
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-write-create",
        title: "Write `index.html`",
        kind: "edit",
        status: "completed",
        rawInput,
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload).toMatchObject({
      path: "index.html",
      changeKind: "create",
      diffSummary: { added: 2, removed: 0 },
      args: rawInput,
    });
  });

  it("extracts file_change metadata from file_path and changes arrays", () => {
    const state = createAcpMapperState("t-fc-changes");
    const diff = "@@ -1 +1 @@\n-before\n+after\n";
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-changes",
        title: "edit file",
        kind: "edit",
        status: "in_progress",
        rawInput: {
          changes: [
            {
              file_path: "src/foo.ts",
              kind: { type: "update", move_path: null },
              diff,
            },
          ],
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload).toMatchObject({
      path: "src/foo.ts",
      changeKind: "edit",
      diffSummary: { added: 1, removed: 1 },
      args: {
        changes: [
          {
            file_path: "src/foo.ts",
            kind: { type: "update", move_path: null },
            diff,
          },
        ],
      },
    });
  });

  it("extracts file_change path from ACP locations when rawInput.path is missing", () => {
    const state = createAcpMapperState("t-fc-loc");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-loc",
        title: "edit symbol",
        kind: "edit",
        status: "in_progress",
        rawInput: { oldText: "before", newText: "after" },
        locations: [{ path: "src/renderer/notifications.ts", line: 12 }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload.path).toBe("src/renderer/notifications.ts");
    expect(started.payload.locations).toEqual([
      { path: "src/renderer/notifications.ts", line: 12 },
    ]);
  });

  it("extracts file_change path from a Gemini title when no structured path is present", () => {
    const state = createAcpMapperState("t-fc-title");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-title",
        title: "src/renderer/notifications.ts: function showToast => function showToast",
        kind: "edit",
        status: "in_progress",
        rawInput: { oldText: "before", newText: "after" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("file_change");
    expect(started.payload.path).toBe("src/renderer/notifications.ts");
  });

  it("extracts web_search query from rawInput.query", () => {
    const state = createAcpMapperState("t-ws");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-ws",
        title: 'Searching the web for "repo:foo bar"',
        kind: "search",
        status: "in_progress",
        rawInput: { query: "repo:foo bar", page: 1 },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("web_search");
    expect(started.payload.query).toBe("repo:foo bar");
  });

  it("keeps local ACP search tools as generic tool_call rows", () => {
    const state = createAcpMapperState("t-search-local");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-search-local",
        title: "'attachment' in src/renderer/**",
        kind: "search",
        status: "in_progress",
        rawInput: { query: "attachment", path: "src/renderer/**" },
        locations: [{ path: "src/renderer" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const started = events[0] as { itemType: string; payload: Record<string, unknown> };
    expect(started.itemType).toBe("tool_call");
    expect(started.payload.kind).toBe("search");
    expect(started.payload.locations).toEqual([{ path: "src/renderer" }]);
  });

  it("infers Copilot task tools as subagents and tags their child items", () => {
    const state = createAcpMapperState("t-subagent");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-subagent",
        title: "Critiquing path fixes",
        status: "in_progress",
        rawInput: {
          description: "Critiquing path fixes",
          agent_type: "rubber-duck",
          name: "path-fix-duck",
          prompt: "We need to get a clean green run.",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const parentItemId = (started[0] as { itemId: string }).itemId;
    expect((started[0] as { payload: Record<string, unknown> }).payload.isSubAgent).toBe(true);

    const child = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Looking for edge cases." },
      }),
      state,
    );
    expect(child).toMatchObject([
      {
        type: "item.started",
        threadId: "t-subagent",
        itemType: "assistant_message",
        parentItemId,
      },
      {
        type: "content.delta",
        threadId: "t-subagent",
        stream: "assistant_text",
        delta: "Looking for edge cases.",
      },
      {
        type: "item.updated",
        threadId: "t-subagent",
        itemId: parentItemId,
        payload: {
          isSubAgent: true,
          progress: { stepCount: 1 },
          status: "running",
        },
      },
    ]);
  });

  it("infers Qoder Agent tool calls as subagents and nests child output", () => {
    const state = createAcpMapperState("t-qoder-subagent");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-qoder-agent",
        title: "Agent",
        kind: "think",
        status: "in_progress",
        rawInput: {
          description: "Use poracode-marker-agent",
          prompt: "Please run your deterministic marker response.",
          subagent_type: "poracode-marker-agent",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const parentItemId = (started[0] as { itemId: string }).itemId;
    expect(started[0]).toMatchObject({
      type: "item.started",
      itemType: "tool_call",
      payload: {
        name: "Agent",
        isSubAgent: true,
        args: { subagent_type: "poracode-marker-agent" },
      },
    });

    const child = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "SUBAGENT_CHILD_OK" },
      }),
      state,
    );
    expect(child).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId,
      }),
    );
  });

  it("keeps consecutive ACP subagent launches as parallel siblings", () => {
    const state = createAcpMapperState("t-parallel-subagents");
    const first = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-parallel-first",
        title: "First agent",
        status: "in_progress",
        rawInput: { description: "First", subagent_type: "worker", prompt: "First task" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const firstItemId = (first[0] as { itemId: string }).itemId;

    const second = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-parallel-second",
        title: "Second agent",
        status: "in_progress",
        rawInput: { description: "Second", subagent_type: "worker", prompt: "Second task" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const secondStart = second.find((event) => event.type === "item.started");
    expect(secondStart).not.toHaveProperty("parentItemId");
    const secondItemId = secondStart!.itemId;

    const firstFinished = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-parallel-first",
        status: "completed",
        rawOutput: { text: "First agent result" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(firstFinished).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: firstItemId,
      }),
    );

    const secondChild = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Second agent result" },
      }),
      state,
    );
    expect(secondChild).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId: secondItemId,
      }),
    );
  });

  it("matches concurrent subagent child tools by their distinct input identity", () => {
    const state = createAcpMapperState("t-parallel-child-tools");
    const readmeAgent = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-readme-agent",
        title: "Inspect README.md",
        status: "in_progress",
        rawInput: {
          description: "Inspect README.md",
          subagent_type: "Explore",
          prompt: "Read README.md without modifying it",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const readmeAgentId = (readmeAgent[0] as { itemId: string }).itemId;
    const helloAgent = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-hello-agent",
        title: "Inspect hello.txt",
        status: "in_progress",
        rawInput: {
          description: "Inspect hello.txt",
          subagent_type: "Explore",
          prompt: "Read hello.txt without modifying it",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const helloAgentId = (helloAgent[0] as { itemId: string }).itemId;

    const readmeTool = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-readme-tool",
        title: "Read /fixture/README.md",
        kind: "read",
        status: "in_progress",
        rawInput: { file_path: "/fixture/README.md" },
        locations: [{ path: "/fixture/README.md" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(readmeTool.find((event) => event.type === "item.started")).toHaveProperty(
      "parentItemId",
      readmeAgentId,
    );

    const helloTool = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-hello-tool",
        title: "Read /fixture/hello.txt",
        kind: "read",
        status: "in_progress",
        rawInput: { file_path: "/fixture/hello.txt" },
        locations: [{ path: "/fixture/hello.txt" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(helloTool.find((event) => event.type === "item.started")).toHaveProperty(
      "parentItemId",
      helloAgentId,
    );
  });

  it("surfaces ACP subagent tool_call_update progress as title metadata and child markdown", () => {
    const state = createAcpMapperState("t-subagent-progress");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-subagent-progress",
        title: "Explore worktree watcher",
        status: "in_progress",
        rawInput: {
          description: "Explore worktree watcher",
          subagent_type: "worker",
          model: "gemini-2.5-pro",
          prompt: "Trace watcher flow",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const parentItemId = (started[0] as { itemId: string }).itemId;

    const update = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-subagent-progress",
        title: "Reading README.md",
        status: "in_progress",
        rawOutput: {
          text: "Reading README.md\n\nFound the watcher initialization path.",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    expect(update).toMatchObject([
      {
        type: "item.updated",
        threadId: "t-subagent-progress",
        itemId: parentItemId,
        payload: {
          title: "Reading README.md",
          isSubAgent: true,
          progress: {
            description: "Reading README.md",
            model: "gemini-2.5-pro",
            summary: "Reading README.md",
          },
        },
      },
      {
        type: "item.started",
        threadId: "t-subagent-progress",
        itemType: "assistant_message",
        parentItemId,
      },
      {
        type: "content.delta",
        threadId: "t-subagent-progress",
        stream: "assistant_text",
        delta: "Reading README.md\n\nFound the watcher initialization path.",
      },
      {
        type: "item.updated",
        threadId: "t-subagent-progress",
        itemId: parentItemId,
        payload: {
          isSubAgent: true,
          progress: {
            description: "Reading README.md",
            stepCount: 1,
          },
        },
      },
    ]);
  });

  it("switches the inferred ACP parent for nested subagents", () => {
    const state = createAcpMapperState("t-nested-subagent");
    const outer = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-outer",
        title: "Outer review",
        status: "in_progress",
        rawInput: {
          description: "Outer review",
          agent_type: "general-purpose",
          name: "outer-agent",
          prompt: "Review the patch",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const outerItemId = (outer[0] as { itemId: string }).itemId;

    mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Outer agent is delegating its critique." },
      }),
      state,
    );

    const inner = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-inner",
        title: "Inner critique",
        status: "in_progress",
        rawInput: {
          description: "Inner critique",
          agent_type: "rubber-duck",
          name: "inner-agent",
          prompt: "Find blind spots",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const innerStart = inner.find(
      (event): event is Extract<(typeof inner)[number], { type: "item.started" }> =>
        event.type === "item.started",
    )!;
    expect(innerStart.parentItemId).toBe(outerItemId);
    const innerItemId = innerStart.itemId;

    const innerChild = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Inspecting the path handling." },
      }),
      state,
    );
    expect((innerChild[0] as { parentItemId?: string }).parentItemId).toBe(innerItemId);

    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-inner",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const outerChild = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-outer-shell",
        title: "shell exec",
        kind: "execute",
        status: "in_progress",
        rawInput: { command: "pnpm run test" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const outerStart = outerChild.find(
      (event): event is Extract<(typeof outerChild)[number], { type: "item.started" }> =>
        event.type === "item.started",
    );
    expect(outerStart?.parentItemId).toBe(outerItemId);
  });

  it("keeps explicitly top-level concurrent subagents as siblings", () => {
    const state = createAcpMapperState("t-sibling-subagents");
    const first = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-sibling-a",
        title: "Sibling A",
        status: "in_progress",
        rawInput: { _toolName: "task", subagent_type: "Explore" },
        _meta: { [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const second = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-sibling-b",
        title: "Sibling B",
        status: "in_progress",
        rawInput: { _toolName: "task", subagent_type: "Explore" },
        _meta: { [PORACODE_ACP_TOP_LEVEL_TOOL_CALL_META_KEY]: true },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    expect(first[0]).not.toHaveProperty("parentItemId");
    expect(second[0]).not.toHaveProperty("parentItemId");
    expect(state.activeSubAgents).toHaveLength(2);
  });

  it("clears inferred ACP subagent parents at turn end", () => {
    const state = createAcpMapperState("t-subagent-reset");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-reset",
        title: "Reset parent",
        status: "in_progress",
        rawInput: {
          description: "Reset parent",
          agent_type: "rubber-duck",
          name: "reset-agent",
          prompt: "Critique this plan",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    closeOpenTurnItems(state);

    const nextTurn = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Fresh top-level reply." },
      }),
      state,
    );
    expect(nextTurn[0]).not.toHaveProperty("parentItemId");
  });

  it("maps opt-in ACP goal commands and normalized completion onto one goal item", () => {
    const state = createAcpMapperState("t-acp-goal");
    const started = mapAcpGoalSlashCommand("/goal set Verify Qoder rendering", state);
    const goalItemId = (started[0] as { itemId: string }).itemId;
    expect(started[0]).toMatchObject({
      type: "item.started",
      itemType: "goal",
      payload: { action: "set", objective: "Verify Qoder rendering", status: "active" },
    });

    expect(mapAcpGoalSlashCommand("/goal pause", state)[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "updated", objective: "Verify Qoder rendering", status: "paused" },
    });
    expect(mapAcpGoalSlashCommand("/goal status", state)[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "viewed", status: "paused" },
    });
    expect(mapAcpGoalSlashCommand("/goal resume", state)[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "updated", status: "active" },
    });

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-goal-complete",
        title: "Edit file",
        kind: "edit",
        status: "in_progress",
        rawInput: {
          status: "complete",
          _poracodeCanonicalGoal: { action: "updated", status: "complete" },
        },
        locations: [{ path: "file" }],
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "updated", objective: "Verify Qoder rendering", status: "complete" },
    });
    expect(
      completed.some((event) => event.type === "item.started" && event.itemType === "file_change"),
    ).toBe(false);

    expect(mapAcpGoalSlashCommand("/goal cancel", state)).toEqual([]);
    expect(mapAcpGoalSlashCommand("/goal clear", state)[0]).toMatchObject({
      type: "item.updated",
      itemId: goalItemId,
      payload: { action: "cleared" },
    });
  });

  it("preserves detached subagents across a foreground turn boundary", () => {
    const state = createAcpMapperState("t-detached-subagent");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-detached",
        title: "Agent",
        status: "in_progress",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Inspect mapping",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const parentItemId = (started[0] as { itemId: string }).itemId;

    const detachedProgress = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-detached",
        title: "Launching background Explore agent: Inspect mapping",
        status: "in_progress",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Inspect mapping",
          background: true,
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(detachedProgress).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "assistant_message",
        parentItemId,
      }),
    );

    expect(closeOpenTurnItems(state)).toEqual([]);
    expect(state.toolCallItems.get("tc-detached")?.itemId).toBe(parentItemId);
    expect(state.activeSubAgents).toEqual([
      { toolCallId: "tc-detached", itemId: parentItemId, hasChildActivity: true },
    ]);

    const nextForegroundTurn = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "A separate foreground reply" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(nextForegroundTurn[0]).not.toHaveProperty("parentItemId");
    closeOpenTurnItems(state);

    const child = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Detached result" },
        _meta: { poracodeParentToolCallId: "tc-detached" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(child[0]).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
      parentItemId,
    });

    const parentReply = mapAcpSessionUpdate(
      note({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Main agent summary" },
        _meta: {
          [PORACODE_ACP_NEW_ASSISTANT_ITEM_META_KEY]: true,
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tc-detached",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const parentReplyStart = parentReply.find((event) => event.type === "item.started");
    expect(parentReplyStart).toMatchObject({
      type: "item.started",
      itemType: "assistant_message",
    });
    expect(parentReplyStart).not.toHaveProperty("parentItemId");

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-detached",
        status: "completed",
        rawInput: {
          _toolName: "task",
          subagent_type: "Explore",
          description: "Inspect mapping",
          background: true,
        },
        rawOutput: "Detached result",
        _meta: {
          [PORACODE_ACP_DETACHED_SUBAGENT_ACTIVITY_META_KEY]: "tc-detached",
        },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed.map((event) => event.type)).toEqual([
      "item.completed",
      "item.completed",
      "item.completed",
    ]);
    expect(
      completed.find((event) => "itemId" in event && event.itemId === parentItemId),
    ).toMatchObject({
      itemId: parentItemId,
      payload: { result: "Detached result" },
    });
    expect(state.activeSubAgents).toEqual([]);
  });

  it("uses update metadata to heal a missing file_change path", () => {
    const state = createAcpMapperState("t-fc-heal");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-heal",
        title: "edit symbol",
        kind: "edit",
        status: "in_progress",
        rawInput: { oldText: "before", newText: "after" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fc-heal",
        title: "src/renderer/notifications.ts: function showToast => function showToast",
        kind: "edit",
        locations: [{ path: "src/renderer/notifications.ts" }],
        rawOutput: { ok: true },
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload.path).toBe("src/renderer/notifications.ts");
    expect(terminal.payload.result).toEqual({ ok: true });
  });

  it("uses update changes arrays to heal file_change path and diff summary", () => {
    const state = createAcpMapperState("t-fc-update-changes");
    const diff = "@@ -1 +1 @@\n-before\n+after\n";
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-update-changes",
        title: "edit symbol",
        kind: "edit",
        status: "in_progress",
        rawInput: { oldText: "before", newText: "after" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fc-update-changes",
        rawOutput: {
          changes: [
            {
              path: "src/foo.ts",
              kind: { type: "update", move_path: null },
              diff,
            },
          ],
        },
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload).toMatchObject({
      path: "src/foo.ts",
      changeKind: "edit",
      diffSummary: { added: 1, removed: 1 },
      result: {
        changes: [
          {
            path: "src/foo.ts",
            kind: { type: "update", move_path: null },
            diff,
          },
        ],
      },
    });
  });

  it("keeps line removals inside an existing file as edits", () => {
    const state = createAcpMapperState("t-fc-line-delete");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-line-delete",
        title: "Delete line",
        kind: "delete",
        status: "in_progress",
        rawInput: {},
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const diff = [
      "diff --git a/index.html b/index.html",
      "--- a/index.html",
      "+++ b/index.html",
      "@@ -51,7 +51,6 @@",
      "     <span>${task.text}</span>",
      "-    <button>bad</button>",
      "   </li>",
      "",
    ].join("\n");
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fc-line-delete",
        kind: "delete",
        rawOutput: diff,
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload).toMatchObject({
      path: "index.html",
      changeKind: "edit",
      diffSummary: { added: 0, removed: 1 },
      result: diff,
    });
  });

  it("uses update new-file diffs to heal file_change kind", () => {
    const state = createAcpMapperState("t-fc-update-create-diff");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-update-create-diff",
        title: "Edit File",
        kind: "edit",
        status: "in_progress",
        rawInput: {},
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const diff = [
      "diff --git a/index.html b/index.html",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/index.html",
      "@@ -0,0 +1,2 @@",
      "+<!DOCTYPE html>",
      "+<html></html>",
      "",
    ].join("\n");
    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fc-update-create-diff",
        rawOutput: diff,
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const terminal = completed[0] as { type: string; payload: Record<string, unknown> };
    expect(terminal.type).toBe("item.completed");
    expect(terminal.payload).toMatchObject({
      path: "index.html",
      changeKind: "create",
      diffSummary: { added: 2, removed: 0 },
      result: diff,
    });
  });

  it("ignores null update locations so reducer merges keep the original file path", () => {
    const state = createAcpMapperState("t-fc-null");
    mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-fc-null",
        title: "src/foo.ts: function before => function after",
        kind: "edit",
        status: "in_progress",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-fc-null",
        locations: null,
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    const terminalPayload = (completed[0] as { payload: Record<string, unknown> }).payload;
    expect(terminalPayload).not.toHaveProperty("locations");
    expect(terminalPayload).not.toHaveProperty("path");
  });

  it("reroutes Copilot's `task_complete` tool call to an assistant_message", () => {
    // Copilot emits the end-of-turn wrap-up as a `tool_call` named
    // `task_complete`. It isn't a real tool — surface it as an assistant
    // message so it renders inline, not as a collapsed accordion. The
    // matching `tool_call_update` is suppressed (no ghost item update).
    const state = createAcpMapperState("t-tc");
    const summary = "Done. Here is what changed: ...";
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-summary",
        title: "task_complete",
        kind: "other",
        status: "in_progress",
        rawInput: { summary },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(started.map((e) => e.type)).toEqual(["item.started", "content.delta", "item.completed"]);
    expect((started[0] as { itemType: string }).itemType).toBe("assistant_message");
    expect((started[1] as { delta: string }).delta).toBe(summary);
    expect(state.toolCallItems.has("tc-summary")).toBe(false);
    expect(state.suppressedToolCallIds.has("tc-summary")).toBe(true);

    const updated = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-summary",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(updated).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-summary")).toBe(false);
  });

  it("accepts a plain-string `task_complete` rawInput", () => {
    const state = createAcpMapperState("t-tc-str");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-str",
        title: "task_complete",
        rawInput: "All set.",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect((events[1] as { delta: string }).delta).toBe("All set.");
  });

  it("drops Gemini's `update_topic` tool call entirely", () => {
    // Gemini emits `update_topic` on nearly every user turn as a "think"-kind
    // meta-tool to label the current conversation topic. It produces no
    // user-facing artifact and would otherwise render as a collapsed accordion
    // sandwiched between the user message and the assistant reply, so the
    // mapper drops the `tool_call` and its terminal `tool_call_update`.
    const state = createAcpMapperState("t-topic");
    const started = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-topic",
        title: 'Update topic to: "Capabilities Overview"',
        kind: "think",
        status: "in_progress",
        rawInput: { title: "Capabilities Overview" },
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(started).toEqual([]);
    expect(state.toolCallItems.has("tc-topic")).toBe(false);
    expect(state.suppressedToolCallIds.has("tc-topic")).toBe(true);

    const completed = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-topic",
        status: "completed",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(completed).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-topic")).toBe(false);
  });

  it("also drops `update_topic` when the title is the raw tool name", () => {
    const state = createAcpMapperState("t-topic-raw");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "tc-topic-raw",
        title: "update_topic",
        kind: "think",
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );
    expect(events).toEqual([]);
    expect(state.suppressedToolCallIds.has("tc-topic-raw")).toBe(true);
  });

  it("ignores unknown sessionUpdate kinds without throwing", () => {
    const state = createAcpMapperState("t-4");
    const events = mapAcpSessionUpdate(
      // Casting because session_info_update et al. aren't pulled from `update` lib types here.
      note({ sessionUpdate: "session_info_update" } as Parameters<
        typeof mapAcpSessionUpdate
      >[0]["update"]),
      state,
    );
    expect(events).toEqual([]);
  });

  it("maps usage_update into context usage", () => {
    const state = createAcpMapperState("t-usage");
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "usage_update",
        used: 71_000,
        size: 200_000,
      } as Parameters<typeof mapAcpSessionUpdate>[0]["update"]),
      state,
    );

    expect(events).toEqual([
      {
        type: "context.updated",
        threadId: "t-usage",
        usage: {
          usedTokens: 71_000,
          maxTokens: 200_000,
        },
      },
    ]);
  });
});

describe("mapAcpPermissionRequest", () => {
  it("extracts Kimi Bash commands from sparse approval content", () => {
    const state = createAcpMapperState("t-perm-kimi");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "tool-kimi-1",
          title: "Bash",
          content: [
            {
              type: "content",
              content: { type: "text", text: "Requesting approval to Running: pwd" },
            },
          ],
        },
        options: [
          { optionId: "approve_once", name: "Approve once", kind: "allow_once" },
          {
            optionId: "approve_always",
            name: "Approve for this session",
            kind: "allow_always",
          },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-kimi-0",
    );

    expect(event).toEqual({
      type: "request.opened",
      threadId: "t-perm-kimi",
      requestId: "acp-perm-kimi-0",
      requestType: "command_execution_approval",
      payload: {
        summary: "Bash",
        details: {
          toolName: "Bash",
          displayName: "command",
          input: { command: "pwd" },
        },
        options: [
          { optionId: "approve_once", label: "Approve once", description: undefined },
          {
            optionId: "approve_always",
            label: "Approve for this session",
            description: undefined,
          },
          { optionId: "reject", label: "Reject", description: undefined },
        ],
      },
    });
  });

  it("maps ExitPlanMode approvals to the unified plan review shape", () => {
    const state = createAcpMapperState("t-perm-plan");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "tool-plan-1",
          title: "ExitPlanMode",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "Plan saved to: /home/me/.kimi-code/sessions/ws/sid/agents/main/plans/p.md\n\n# KIMI_PLAN_SMOKE\n\n1. Step one\n2. Step two",
              },
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Requesting approval to Presenting plan and exiting plan mode",
              },
            },
          ],
        },
        options: [
          { optionId: "plan_approve", name: "Approve", kind: "allow_once" },
          { optionId: "plan_revise", name: "Revise", kind: "reject_once" },
          { optionId: "plan_reject_and_exit", name: "Reject and Exit", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-plan-0",
    );

    expect(event).toEqual({
      type: "request.opened",
      threadId: "t-perm-plan",
      requestId: "acp-perm-plan-0",
      requestType: "tool_call_approval",
      payload: {
        summary: "Proposed plan",
        details: {
          toolName: "ExitPlanMode",
          input: {
            plan: "# KIMI_PLAN_SMOKE\n\n1. Step one\n2. Step two",
            planFilePath: "/home/me/.kimi-code/sessions/ws/sid/agents/main/plans/p.md",
          },
        },
        options: [
          { optionId: "plan_approve", label: "Approve", description: undefined },
          { optionId: "plan_revise", label: "Revise", description: undefined },
          { optionId: "plan_reject_and_exit", label: "Reject and Exit", description: undefined },
        ],
      },
    });
  });

  it("maps ExitPlanMode approvals without a saved-path prefix", () => {
    const state = createAcpMapperState("t-perm-plan-bare");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "tool-plan-2",
          title: "exit_plan_mode",
          content: [
            {
              type: "content",
              content: { type: "text", text: "Just the plan body" },
            },
          ],
        },
        options: [{ optionId: "plan_approve", name: "Approve", kind: "allow_once" }],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-plan-1",
    );

    expect(event.type).toBe("request.opened");
    if (event.type !== "request.opened") return;
    expect(event.payload.summary).toBe("Proposed plan");
    expect(event.payload.details).toEqual({
      toolName: "exit_plan_mode",
      input: { plan: "Just the plan body" },
    });
  });

  it("echoes Kimi v2 plan_review option ids (plan_opt_*) verbatim", () => {
    const state = createAcpMapperState("t-perm-plan-opts");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          toolCallId: "3:tool-plan",
          title: "ExitPlanMode",
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: "Plan saved to: /repo/.kimi-code/plans/p.md\n\n# Plan\n\n1. Step one",
              },
            },
            {
              type: "content",
              content: {
                type: "text",
                text: "Requesting approval to Presenting plan and exiting plan mode",
              },
            },
          ],
        },
        options: [
          { optionId: "plan_opt_0", name: "Use REST", kind: "allow_once" },
          { optionId: "plan_opt_1", name: "Use GraphQL", kind: "allow_once" },
          { optionId: "plan_revise", name: "Revise", kind: "reject_once" },
          { optionId: "plan_reject_and_exit", name: "Reject and Exit", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-plan-2",
    );

    expect(event.type).toBe("request.opened");
    if (event.type !== "request.opened") return;
    expect(event.payload.details).toEqual({
      toolName: "ExitPlanMode",
      input: { plan: "# Plan\n\n1. Step one", planFilePath: "/repo/.kimi-code/plans/p.md" },
    });
    expect(event.payload.options).toEqual([
      { optionId: "plan_opt_0", label: "Use REST", description: undefined },
      { optionId: "plan_opt_1", label: "Use GraphQL", description: undefined },
      { optionId: "plan_revise", label: "Revise", description: undefined },
      { optionId: "plan_reject_and_exit", label: "Reject and Exit", description: undefined },
    ]);
  });

  it("unwraps command approval input instead of surfacing raw JSON details", () => {
    const state = createAcpMapperState("t-perm-command");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          title: "Run command: cd /repo && pnpm run typecheck 2>&1",
          kind: "execute",
          rawInput: {
            command: "cd /repo && pnpm run typecheck 2>&1",
            cwd: "/repo",
          },
        },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Skip", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-0",
    );

    expect(event).toEqual({
      type: "request.opened",
      threadId: "t-perm-command",
      requestId: "acp-perm-0",
      requestType: "command_execution_approval",
      payload: {
        summary: "Run command",
        details: {
          toolName: "execute",
          displayName: "command",
          input: {
            command: "cd /repo && pnpm run typecheck 2>&1",
            cwd: "/repo",
          },
        },
        options: [
          { optionId: "allow", label: "Allow", description: undefined },
          { optionId: "reject", label: "Skip", description: undefined },
        ],
      },
    });
  });

  it("classifies generic tool-call approvals as tool_call_approval with structured details", () => {
    const state = createAcpMapperState("t-perm-tool");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          title: "browser__new_tab",
          kind: "other",
          rawInput: {
            variant: "UseTool",
            tool_name: "browser__new_tab",
            tool_input: { url: "https://www.bing.com", activate: true },
          },
        },
        options: [
          { optionId: "always-allow", name: "always allow", kind: "allow_always" },
          { optionId: "allow-once", name: "allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "reject once", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-tool-0",
    );

    expect(event).toEqual({
      type: "request.opened",
      threadId: "t-perm-tool",
      requestId: "acp-perm-tool-0",
      requestType: "tool_call_approval",
      payload: {
        summary: "browser__new_tab",
        details: {
          toolName: "browser__new_tab",
          input: { url: "https://www.bing.com", activate: true },
        },
        options: [
          { optionId: "always-allow", label: "always allow", description: undefined },
          { optionId: "allow-once", label: "allow once", description: undefined },
          { optionId: "reject-once", label: "reject once", description: undefined },
        ],
      },
    });
  });

  it("classifies Droid ApplyPatch approvals as apply_patch_approval", () => {
    const state = createAcpMapperState("t-perm-applypatch");

    const event = mapAcpPermissionRequest(
      {
        sessionId: "s1",
        toolCall: {
          title: "ApplyPatch",
          kind: "other",
          rawInput: {
            patch: "*** Begin Patch\n*** Update File: src/foo.ts\n@@\n-old\n+new\n*** End Patch",
          },
        },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      } as Parameters<typeof mapAcpPermissionRequest>[0],
      state,
      "acp-perm-applypatch-0",
    );

    expect(event).toMatchObject({ requestType: "apply_patch_approval" });
  });
});
