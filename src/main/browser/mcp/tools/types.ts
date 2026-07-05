import type { BrowserPanelManager } from "../../BrowserPanelManager";

export interface ToolContext {
  manager: BrowserPanelManager;
  allowEval: boolean;
  allowDataAccess: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
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
