export const TOOL_PRESENTATION_FULL_RESULT =
  "Complete finding: preserve both workspace panes. 東京 🧭";
export const TOOL_PRESENTATION_LIVE_RESULT = "Live finding: all three layouts verified.";
export const TOOL_PRESENTATION_OUTPUT =
  "Workspace check\n" + "verified layout content\n".repeat(1800) + "END OF COMPLETE COMMAND OUTPUT";

const MULTI_FILE_PATCH = [
  "diff --git a/src/layout.ts b/src/layout.ts",
  "--- a/src/layout.ts",
  "+++ b/src/layout.ts",
  "@@ -18,2 +18,2 @@",
  "--- counter",
  "+++ counter",
  " return counter;",
  "diff --git a/docs/layout.md b/docs/layout.md",
  "--- a/docs/layout.md",
  "+++ b/docs/layout.md",
  "@@ -1 +1 @@",
  "-Old layout notes",
  "+Second file review",
  "",
].join("\n");

const BURST_COMMANDS = Array.from({ length: 10 }, (_, index) => `burst-command-${index + 1}`);

export function streamingToolActivity(
  checkpoint:
    | "tool-activity-start"
    | "tool-activity-append"
    | "tool-activity-finish"
    | "tool-activity-burst"
    | "tool-activity-burst-finish",
  threadId: string,
): Array<Record<string, unknown>> {
  const turn = { threadId, turnId: "turn-tool-activity" };
  const start = (itemId: string, itemType: string, payload: Record<string, unknown>) => ({
    ...turn,
    type: "item.started",
    itemId,
    itemType,
    payload,
  });
  const text = (value: string) => ({ content: [{ kind: "text", text: value }] });
  switch (checkpoint) {
    case "tool-activity-burst":
      return [
        { ...turn, type: "turn.started" },
        start("activity-user", "user_message", text("Review the longer run of calls.")),
        start("burst-reasoning", "reasoning", {}),
        {
          ...turn,
          type: "content.delta",
          itemId: "burst-reasoning",
          stream: "reasoning_text",
          delta: "Earliest audit detail before the command sequence.",
        },
        { ...turn, type: "item.completed", itemId: "burst-reasoning" },
        ...BURST_COMMANDS.map((id, index) =>
          start(id, "command_execution", {
            command: `printf 'audit call ${index + 1}'`,
            cwd: "/project",
          }),
        ),
      ];
    case "tool-activity-start":
      return [
        { ...turn, type: "turn.started" },
        start("activity-user", "user_message", text("Verify the activity group.")),
        start("activity-read", "command_execution", { command: "pwd", cwd: "/project" }),
        start("activity-search", "mcp_tool_call", {
          serverId: "workspace_docs",
          name: "search",
          args: { query: "workspace layout" },
        }),
      ];
    case "tool-activity-append":
      return [
        start("activity-append", "command_execution", {
          command: "printf 'layout ready'",
          cwd: "/project",
        }),
      ];
    case "tool-activity-finish":
    case "tool-activity-burst-finish": {
      const tools =
        checkpoint === "tool-activity-burst-finish"
          ? [...BURST_COMMANDS, "activity-append"]
          : ["activity-read", "activity-search", "activity-append"];
      return [
        ...tools.map((itemId) => ({
          ...turn,
          type: "item.completed",
          itemId,
        })),
        start("activity-reply", "assistant_message", text("The activity review is complete.")),
        { ...turn, type: "item.completed", itemId: "activity-reply" },
        { ...turn, type: "turn.completed", state: "completed" },
      ];
    }
  }
}

export function updateToolPresentationItems(
  items: Array<Record<string, unknown>>,
  threadId: string,
): Record<string, unknown> {
  const payload = {
    result: { content: "PREVIEW ONLY", detailedContent: TOOL_PRESENTATION_LIVE_RESULT },
    status: "success",
  };
  const row = items.find((item) => item.id === "tool-result")!;
  row.payload = { ...(row.payload as Record<string, unknown>), ...payload };
  return { type: "item.completed", threadId, itemId: "tool-result", payload };
}

export function sameFileEditPresentationItems(): Array<Record<string, unknown>> {
  const items = toolPresentationItems();
  const edit = (id: string, path: string, line: number, oldText: string, newText: string) => ({
    id,
    type: "file_change",
    state: "completed",
    payload: {
      path,
      changeKind: "edit",
      status: "success",
      diffSummary: { added: 1, removed: 1 },
      result: [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        `@@ -${line} +${line} @@`,
        `-${oldText}`,
        `+${newText}`,
        "",
      ].join("\n"),
    },
    streams: {},
  });
  return [
    items[0]!,
    edit("same-file-first", "src/layout.ts", 18, "old anchor", "keep focus"),
    {
      id: "same-file-reasoning",
      type: "reasoning",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Interleaved review note." }] },
      streams: { reasoning_text: "Interleaved review note." },
    },
    edit("same-file-second", "src/layout.ts", 25, "old alignment", "keep footer"),
    edit("separate-file-edit", "docs/layout.md", 8, "old note", "check file boundaries"),
    items.at(-1)!,
  ];
}

export function toolPresentationItems({
  withResult = true,
  multiFilePatch = false,
}: { withResult?: boolean; multiFilePatch?: boolean } = {}): Array<Record<string, unknown>> {
  return [
    {
      id: "tool-user",
      type: "user_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Compare these tool results across clients." }] },
      streams: {},
    },
    {
      id: "tool-command",
      type: "command_execution",
      state: "completed",
      payload: {
        command: "sed -n '5,12p' src/App.tsx",
        cwd: "/project",
        exitCode: 0,
        durationMs: 1200,
      },
      streams: { command_output: "\u001b[32m" + TOOL_PRESENTATION_OUTPUT + "\u001b[0m" },
    },
    {
      id: "tool-result",
      type: "mcp_tool_call",
      state: "completed",
      payload: {
        name: "search",
        serverId: "workspace_docs",
        status: "success",
        ...(withResult
          ? {
              args: { query: "workspace layout", enabled: false, limit: 2 },
              result: { content: "PREVIEW ONLY", detailedContent: TOOL_PRESENTATION_FULL_RESULT },
            }
          : {}),
      },
      streams: {},
    },
    {
      id: "tool-file",
      type: "file_change",
      state: "completed",
      payload: {
        path: "src/layout.ts",
        changeKind: "edit",
        status: "success",
        diffSummary: { added: multiFilePatch ? 2 : 1, removed: multiFilePatch ? 2 : 1 },
        args: { old: "old layout", new: "updated layout" },
        result: multiFilePatch
          ? MULTI_FILE_PATCH
          : "diff --git a/src/layout.ts b/src/layout.ts\n--- a/src/layout.ts\n+++ b/src/layout.ts\n@@ -1 +1 @@\n-old layout\n+updated layout\n",
      },
      streams: {},
    },
    {
      id: "item-fixture-assistant",
      type: "assistant_message",
      state: "completed",
      payload: { content: [{ kind: "text", text: "Tool presentation review is ready." }] },
      streams: {},
    },
  ];
}
