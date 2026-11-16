export const TOOL_PRESENTATION_FULL_RESULT =
  "Complete finding: preserve both workspace panes. 東京 🧭";
export const TOOL_PRESENTATION_LIVE_RESULT = "Live finding: all three layouts verified.";
export const TOOL_PRESENTATION_OUTPUT =
  "Workspace check\n" + "verified layout content\n".repeat(1800) + "END OF COMPLETE COMMAND OUTPUT";

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

export function toolPresentationItems(): Array<Record<string, unknown>> {
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
        args: { query: "workspace layout", enabled: false, limit: 2 },
        result: { content: "PREVIEW ONLY", detailedContent: TOOL_PRESENTATION_FULL_RESULT },
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
        diffSummary: { added: 1, removed: 1 },
        args: { old: "old layout", new: "updated layout" },
        result:
          "diff --git a/src/layout.ts b/src/layout.ts\n--- a/src/layout.ts\n+++ b/src/layout.ts\n@@ -1 +1 @@\n-old layout\n+updated layout\n",
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
