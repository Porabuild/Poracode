// Entry point / public API for the browser MCP tool registry. The
// implementation is split across `./tools/*` by responsibility:
//   - tools/types.ts     shared types (ToolContext, ToolSpec, McpToolResult, ...)
//   - tools/specs.ts      static tool catalogue, aliases, name lookups
//   - tools/helpers.ts    shared dispatch helpers (tab/selector resolution)
//   - tools/screenshot.ts screenshot capture/downscale/fallback logic
//   - tools/dispatch.ts   the dispatchTool() switch over tool names
//   - tools/formatResult.ts MCP content[] formatting
export { dispatchTool } from "./tools/dispatch";
export { formatToolResult } from "./tools/formatResult";
export { BROWSER_MCP_INSTRUCTIONS, isKnownToolName, normalizeToolName, TOOLS } from "./tools/specs";
export type { McpToolResult, ToolContext, ToolSpec } from "./tools/types";
