import { normalizeToolName } from "./specs";
import type { McpToolResult } from "./types";

/** Wrap a raw tool result into the MCP `content[]` shape. Special-cased for
 *  screenshot (image content). */
export function formatToolResult(name: string, result: unknown): McpToolResult {
  if (
    normalizeToolName(name) === "screenshot" &&
    result &&
    typeof result === "object" &&
    "base64" in result
  ) {
    const r = result as { base64: string; mimeType?: string };
    const metadata = { ...(result as Record<string, unknown>) };
    delete metadata.base64;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(metadata, null, 2),
        },
        {
          type: "image",
          data: r.base64,
          mimeType: r.mimeType ?? "image/png",
        },
      ],
    };
  }
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof (result as { error: unknown }).error === "string"
  ) {
    return {
      content: [
        {
          type: "text",
          text:
            normalizeToolName(name) === "perform"
              ? JSON.stringify(result)
              : String((result as { error: string }).error),
        },
      ],
      isError: true,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
