import { describe, expect, it } from "vitest";
import { detectedToManagedServer } from "./mcpServer";

describe("detectedToManagedServer", () => {
  it("rejects detected names that cannot be persisted as managed MCP keys", () => {
    expect(
      detectedToManagedServer(
        {
          name: "bad name",
          source: "mcp-json",
          filePath: "/repo/.mcp.json",
          transport: { type: "http", url: "https://mcp.example.com/mcp", headers: {} },
        },
        "id",
      ),
    ).toBeUndefined();
  });
});
