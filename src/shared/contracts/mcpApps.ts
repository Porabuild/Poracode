import { z } from "zod";

export const MCP_APP_HOST_META_KEY = "com.poracode/mcp-app";
// v1 is an additive tool-result metadata field. Older transcripts remain source-only;
// a reference from a retired supervisor/connection is refused before any tool call.
export const mcpAppReferenceSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().uuid(),
  toolName: z.string().min(1).max(256),
  resourceUri: z.string().max(4096).startsWith("ui://"),
});
export type McpAppReference = z.infer<typeof mcpAppReferenceSchema>;

export const controlMcpAppPayloadSchema = z.object({
  threadId: z.string().min(1),
  app: mcpAppReferenceSchema,
  requestId: z.string().uuid(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("readResource") }),
    z.object({ type: z.literal("listTools") }),
    z.object({
      type: z.literal("callTool"),
      name: z.string().min(1).max(256),
      arguments: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
      type: z.literal("updateModelContext"),
      content: z
        .array(z.object({ type: z.literal("text"), text: z.string().max(65_536) }))
        .max(32)
        .optional(),
      structuredContent: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({ type: z.literal("cancel") }),
  ]),
});
export type ControlMcpAppPayload = z.infer<typeof controlMcpAppPayloadSchema>;

export const controlMcpAppResultSchema = z.object({ result: z.record(z.string(), z.unknown()) });
export type ControlMcpAppResult = z.infer<typeof controlMcpAppResultSchema>;

export function readMcpAppReference(result: unknown): McpAppReference | undefined {
  if (!result || typeof result !== "object") return;
  const meta = (result as Record<string, unknown>)._meta;
  if (!meta || typeof meta !== "object") return;
  const parsed = mcpAppReferenceSchema.safeParse(
    (meta as Record<string, unknown>)[MCP_APP_HOST_META_KEY],
  );
  return parsed.success ? parsed.data : undefined;
}
