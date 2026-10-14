// Entry point / public API for the browser MCP tool registry. The
// implementation is split across `./tools/*` by responsibility:
//   - tools/types.ts     embedded-panel context types (ToolContext, ...)
//   - tools/helpers.ts    embedded-panel dispatch helpers (tab resolution)
//   - tools/screenshot.ts screenshot capture/downscale/fallback logic
//   - tools/dispatch.ts   the dispatchTool() switch over tool names
//   - tools/formatResult.ts MCP content[] formatting
// The reusable catalogue and page-tool implementation live with the shared
// CDP helpers under `@/host/browser/mcp/tools` (types/specs/page/perform).
export { dispatchTool } from "./tools/dispatch";
export { formatToolResult } from "./tools/formatResult";
export {
  BROWSER_MCP_INSTRUCTIONS,
  isKnownToolName,
  normalizeToolName,
  TOOLS,
} from "@/host/browser/mcp/tools/specs";
export type { McpToolResult, ToolContext, ToolSpec } from "./tools/types";
