import { describe, expect, it } from "vitest";
import type { SessionNotification } from "@agentclientprotocol/sdk/unstable";
import { createAcpMapperState, mapAcpSessionUpdate } from "../acp/canonicalMapping";
import { transformDeepSeekAcpSessionUpdate } from "./acpToolCalls";
import { deepSeekGoalExtension } from "./goals";

function note(update: SessionNotification["update"]): SessionNotification {
  return { sessionId: "deepseek-native-session", update };
}

function started(update: SessionNotification["update"]) {
  const state = createAcpMapperState("deepseek-thread");
  const events = mapAcpSessionUpdate(transformDeepSeekAcpSessionUpdate(note(update)), state);
  const event = events.find((candidate) => candidate.type === "item.started");
  if (!event) throw new Error("expected an item.started event");
  return event;
}

describe("DeepSeek Harness ACP tool-call presentation", () => {
  it("turns a bash tool call into a command execution with its command", () => {
    const event = started({
      sessionUpdate: "tool_call",
      toolCallId: "bash-call",
      title: "bash",
      kind: "other",
      status: "in_progress",
      rawInput: { command: "ls -la", description: "List files", workdir: "src" },
    });

    expect(event).toMatchObject({
      itemType: "command_execution",
      payload: {
        name: "bash",
        kind: "execute",
        command: "ls -la",
        cwd: "src",
        args: { command: "ls -la", description: "List files", workdir: "src", cwd: "src" },
        status: "running",
      },
    });
  });

  it("maps code-mode run_code and workflow calls as tool_call rows without misclassifying descriptions", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "ptc-call",
        title: "run_code",
        kind: "other",
        status: "in_progress",
        rawInput: { code: "return 1;", description: "Analyze workspace files" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: {
        name: "Code execution: Analyze workspace files",
        kind: "other",
        args: { code: "return 1;", description: "Analyze workspace files" },
      },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "ptc-bare",
        title: "run_code",
        kind: "other",
        status: "in_progress",
        rawInput: { code: "return 1;" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Code execution", kind: "other", args: { code: "return 1;" } },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "ptc-keyword",
        title: "run_code",
        kind: "other",
        status: "in_progress",
        rawInput: { code: "return 1;", description: "Create and edit migration files" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Code execution", kind: "other" },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "wf-meta",
        title: "workflow",
        kind: "other",
        status: "in_progress",
        rawInput: {
          script: "return [];",
          meta: { name: "audit", description: "Batch audit" },
        },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Workflow: Batch audit", kind: "other" },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "wf-meta-keyword",
        title: "workflow",
        kind: "other",
        status: "in_progress",
        rawInput: {
          script: "return [];",
          meta: { name: "audit", description: "Create and delete stale caches" },
        },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Workflow", kind: "other" },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "wf-legacy",
        title: "run_workflow",
        kind: "other",
        status: "in_progress",
        rawInput: { name: "ralph" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Workflow: ralph", kind: "other" },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "wf-bare",
        title: "workflow",
        kind: "other",
        status: "in_progress",
        rawInput: {},
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Workflow", kind: "other" },
    });
  });

  it("settles the command row through its completion update", () => {
    const state = createAcpMapperState("deepseek-thread");
    mapAcpSessionUpdate(
      transformDeepSeekAcpSessionUpdate(
        note({
          sessionUpdate: "tool_call",
          toolCallId: "bash-call",
          title: "bash",
          kind: "other",
          status: "in_progress",
          rawInput: { command: "ls -la" },
        }),
      ),
      state,
    );
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "bash-call",
        status: "completed",
        content: [{ type: "content", content: { type: "text", text: "file-one\nfile-two" } }],
      }),
      state,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.completed",
        payload: expect.objectContaining({
          status: "success",
          result: "file-one\nfile-two",
        }),
      }),
    );
    // The tracked command/kind is gone only because the row completed; the
    // emitted delta is merged into the item's opening payload by the reducer.
    expect(state.toolCallItems.has("bash-call")).toBe(false);
  });

  it("labels a read call with its file path and line location", () => {
    const transformed = transformDeepSeekAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call",
        toolCallId: "read-call",
        title: "read",
        kind: "other",
        status: "in_progress",
        rawInput: { file_path: "src/foo.ts", offset: 10, limit: 5 },
      }),
    );

    expect(transformed.update).toMatchObject({
      kind: "read",
      name: "read",
      title: "Read src/foo.ts",
      locations: [{ path: "src/foo.ts", line: 10 }],
    });
    expect(started(transformed.update)).toMatchObject({
      itemType: "tool_call",
      payload: {
        name: "Read src/foo.ts",
        kind: "read",
        locations: [{ path: "src/foo.ts", line: 10 }],
      },
    });
  });

  it("maps grep and glob calls to search rows", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "grep-call",
        title: "grep",
        kind: "other",
        status: "in_progress",
        rawInput: { pattern: "toolPresentation", path: "src" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { kind: "search", title: "Grep toolPresentation" },
    });
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "glob-call",
        title: "glob",
        kind: "other",
        status: "in_progress",
        rawInput: { pattern: "**/*.ts" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { kind: "search", title: "Glob **/*.ts" },
    });
  });

  it("uses the harness queries array as the canonical web-search query", () => {
    const event = started({
      sessionUpdate: "tool_call",
      toolCallId: "search-call",
      title: "web_search",
      kind: "other",
      status: "in_progress",
      rawInput: { queries: ["first query", "second query"] },
    });

    expect(event).toMatchObject({
      itemType: "web_search",
      payload: {
        name: "Web search: first query, second query",
        kind: "search",
        query: "first query, second query",
        args: { queries: ["first query", "second query"], query: "first query, second query" },
      },
    });
  });

  it("maps web_fetch to a fetch row with the URL", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "fetch-call",
        title: "web_fetch",
        kind: "other",
        status: "in_progress",
        rawInput: { url: "https://example.com/docs" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { kind: "fetch", title: "Fetch https://example.com/docs" },
    });
  });

  it("maps edit and write calls to file-change rows with paths and diff stats", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "edit-call",
        title: "edit",
        kind: "other",
        status: "in_progress",
        rawInput: {
          file_path: "src/foo.ts",
          old_string: "const a = 1;\nconst b = 2;",
          new_string: "const a = 1;\nconst b = 3;",
        },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/foo.ts",
        changeKind: "edit",
        diffSummary: { added: 1, removed: 1 },
      },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "write-call",
        title: "write",
        kind: "other",
        status: "in_progress",
        rawInput: { file_path: "src/new.ts", content: "one\ntwo\n" },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/new.ts",
        changeKind: "create",
        diffSummary: { removed: 0 },
      },
    });
  });

  it("maps apply_patch to a file-change row and recovers its path", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "patch-call",
        title: "apply_patch",
        kind: "other",
        status: "in_progress",
        rawInput: {
          input: "*** Begin Patch\n*** Add File: src/new.ts\n+hello\n*** End Patch",
        },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/new.ts",
        changeKind: "create",
        title: "Create patch",
      },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "patch-delete",
        title: "apply_patch",
        kind: "other",
        status: "in_progress",
        rawInput: {
          input: "*** Begin Patch\n*** Delete File: src/old.ts\n*** End Patch",
        },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/old.ts",
        changeKind: "delete",
        title: "Delete patch",
      },
    });
  });

  it("maps str_replace_editor commands to read or file-change rows", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "editor-view",
        title: "str_replace_editor",
        kind: "other",
        status: "in_progress",
        rawInput: { command: "view", path: "src/foo.ts", view_range: [1, 20] },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: {
        kind: "read",
        title: "View src/foo.ts",
        locations: [{ path: "src/foo.ts" }],
      },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "editor-create",
        title: "str_replace_editor",
        kind: "other",
        status: "in_progress",
        rawInput: { command: "create", path: "src/new.ts", file_text: "hello" },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/new.ts",
        changeKind: "create",
        title: "Create src/new.ts",
      },
    });

    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "editor-insert",
        title: "str_replace_editor",
        kind: "other",
        status: "in_progress",
        rawInput: {
          command: "insert",
          path: "src/foo.ts",
          insert_line: 4,
          new_str: "inserted",
        },
      }),
    ).toMatchObject({
      itemType: "file_change",
      payload: {
        kind: "edit",
        path: "src/foo.ts",
        locations: [{ path: "src/foo.ts", line: 5 }],
      },
    });
  });

  it("uses the harness's real argument names in generic tool titles", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "message-call",
        title: "send_message",
        kind: "other",
        status: "in_progress",
        rawInput: { agent: "helper", message: "continue" },
      }),
    ).toMatchObject({
      payload: { name: "Send message to helper", kind: "other" },
    });
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "wait-call",
        title: "wait_agent",
        kind: "other",
        status: "in_progress",
        rawInput: { timeout_ms: 30_000 },
      }),
    ).toMatchObject({
      payload: { name: "Wait for input", kind: "other" },
    });
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "goal-call",
        title: "get_goal",
        kind: "other",
        status: "in_progress",
        rawInput: {},
      }),
    ).toMatchObject({
      payload: { name: "Current goal", kind: "other" },
    });
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "cwd-call",
        title: "working_directory",
        kind: "other",
        status: "in_progress",
        rawInput: { cd: "src" },
      }),
    ).toMatchObject({
      payload: { name: "Change working directory to src", kind: "other" },
    });
  });

  it("uses the programmatic name when a future harness sends a human title", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "human-title",
        title: "Run a shell command",
        name: "bash",
        kind: "other",
        status: "in_progress",
        rawInput: { command: "pwd" },
      }),
    ).toMatchObject({
      itemType: "command_execution",
      payload: { command: "pwd", kind: "execute" },
    });
  });

  it("labels non-file tools without making their titles look like file edits", () => {
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "goal-call",
        title: "create_goal",
        kind: "other",
        status: "in_progress",
        rawInput: { objective: "Ship goal support" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Set goal", kind: "other" },
    });
    expect(
      started({
        sessionUpdate: "tool_call",
        toolCallId: "job-call",
        title: "job_output",
        kind: "other",
        status: "in_progress",
        rawInput: { job_id: "job-1" },
      }),
    ).toMatchObject({
      itemType: "tool_call",
      payload: { name: "Background job output job-1", kind: "other" },
    });
  });

  it("keeps MCP tools, meaningful kinds, and non-tool updates untouched", () => {
    const mcp = note({
      sessionUpdate: "tool_call",
      toolCallId: "mcp-call",
      title: "mcp__poracode__thread_context",
      kind: "other",
      status: "in_progress",
      rawInput: {},
    });
    expect(transformDeepSeekAcpSessionUpdate(mcp)).toBe(mcp);

    const mcpWithName = note({
      sessionUpdate: "tool_call",
      toolCallId: "mcp-named-call",
      title: "mcp__poracode__thread_context",
      name: "bash",
      kind: "other",
      status: "in_progress",
      rawInput: { command: "pwd" },
    });
    expect(transformDeepSeekAcpSessionUpdate(mcpWithName)).toBe(mcpWithName);

    const typed = note({
      sessionUpdate: "tool_call",
      toolCallId: "typed-call",
      title: "bash",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "pwd" },
    });
    expect(transformDeepSeekAcpSessionUpdate(typed)).toBe(typed);

    const update = note({
      sessionUpdate: "tool_call_update",
      toolCallId: "call",
      status: "completed",
    });
    expect(transformDeepSeekAcpSessionUpdate(update)).toBe(update);
  });

  it("keeps the goal extension tracking goal tools after titles become human-readable", () => {
    const state = createAcpMapperState("goal-thread", deepSeekGoalExtension);
    mapAcpSessionUpdate(
      transformDeepSeekAcpSessionUpdate(
        note({
          sessionUpdate: "tool_call",
          toolCallId: "goal-call",
          title: "create_goal",
          kind: "other",
          status: "in_progress",
          rawInput: { objective: "Ship goal support" },
        }),
      ),
      state,
    );
    const events = mapAcpSessionUpdate(
      note({
        sessionUpdate: "tool_call_update",
        toolCallId: "goal-call",
        status: "completed",
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: JSON.stringify({
                goal: {
                  id: "goal-1",
                  revision: 1,
                  objective: "Ship goal support",
                  phase: "active",
                  roundsStarted: 0,
                  maxGoalRounds: 100,
                },
                activation: "armed",
              }),
            },
          },
        ],
      }),
      state,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "goal",
        payload: expect.objectContaining({ objective: "Ship goal support", status: "active" }),
      }),
    );
  });

  it("still folds todo_write into plan steps after its row title changes", () => {
    const state = createAcpMapperState("todo-thread");
    const events = mapAcpSessionUpdate(
      transformDeepSeekAcpSessionUpdate(
        note({
          sessionUpdate: "tool_call",
          toolCallId: "todo-call",
          title: "todo_write",
          kind: "other",
          status: "in_progress",
          rawInput: { todos: [{ content: "Ship it", status: "in_progress" }] },
        }),
      ),
      state,
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "item.started",
        itemType: "plan",
        payload: { steps: [{ step: "Ship it", status: "in_progress" }] },
      }),
    );
    expect(
      events.some((event) => event.type === "item.started" && event.itemType === "tool_call"),
    ).toBe(false);
  });
});
