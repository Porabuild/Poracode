import type { BrowserPanelManager } from "../../BrowserPanelManager";
import type { McpToolAnnotations } from "@/shared/contracts";

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

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface McpContent {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
}

export type ResolvedBrowserTab = NonNullable<ReturnType<BrowserPanelManager["getActiveTab"]>>;
