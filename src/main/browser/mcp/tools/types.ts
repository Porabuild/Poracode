import type { BrowserPanelManager } from "../../BrowserPanelManager";

export type { McpContent, McpToolResult, ToolSpec } from "@/host/browser/mcp/tools/types";

export interface ToolContext {
  manager: BrowserPanelManager;
  allowEval: boolean;
  allowDataAccess: boolean;
  disabledTools?: readonly string[];
  /** Calling thread + its task title (from the MCP URL) — agent tabs join a
   *  per-thread group named after the task. */
  threadId?: string;
  threadTitle?: string;
}

export type ResolvedBrowserTab = NonNullable<ReturnType<BrowserPanelManager["getActiveTab"]>>;
