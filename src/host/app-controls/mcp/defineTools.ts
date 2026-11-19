import { BUILT_IN_MCP_SERVER_TOOL_NAMES } from "@/shared/contracts/mcpServer";
import { z } from "zod";
import type { StreamableHttpMcpToolSpec } from "../../mcp/StreamableHttpMcpIngress";
import type { AppControlsToolContext, ToolDomain, ToolHandler } from "./tools/types";

interface AppControlTool {
  spec: StreamableHttpMcpToolSpec;
  handler: ToolHandler;
}

/** Derive tools/list and argument validation from the same operation schema. */
export function defineAppControlTool<Schema extends z.ZodObject | z.ZodDiscriminatedUnion>(tool: {
  name: (typeof BUILT_IN_MCP_SERVER_TOOL_NAMES)["app-controls"][number];
  description: string;
  input: Schema;
  run(args: z.output<Schema>, context: AppControlsToolContext): unknown;
}): AppControlTool {
  const schema = z.toJSONSchema(tool.input, { io: "input", target: "draft-07" });
  return {
    spec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { ...schema, type: "object" },
    },
    handler: (args, context) => tool.run(tool.input.parse(args) as z.output<Schema>, context),
  };
}

export function appControlToolDomain(...tools: readonly AppControlTool[]): ToolDomain {
  return {
    specs: tools.map(({ spec }) => spec),
    handlers: Object.fromEntries(tools.map(({ spec, handler }) => [spec.name, handler])),
  };
}
