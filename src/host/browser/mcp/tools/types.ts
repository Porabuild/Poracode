import type { McpToolAnnotations } from "@/shared/contracts";

/**
 * Cross-surface MCP tool contract shared by the embedded browser panel and the
 * external-Chrome tools. The embedded panel's manager/tab context types live in
 * `@/main/browser/mcp/tools/types` because they describe the desktop classes.
 */

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
