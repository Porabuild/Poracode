import { expect, it } from "vitest";
import { antigravityNativeMcpConfig } from "./nativeMcp";
import type { McpServer } from "@/shared/contracts";
const server: McpServer = {
  id: "proof",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 30000,
  transport: {
    type: "http",
    url: "https://example.test/mcp",
    headers: { Authorization: "fixture" },
  },
};
it("uses Antigravity serverUrl and preserves unrelated JSONC", () => {
  const config = antigravityNativeMcpConfig();
  const text = config.write('{\n// retain\n"mcpServers": {}\n}', "proof", config.entry(server));
  expect(text).toContain("// retain");
  expect(config.read(text)).toEqual({
    proof: { serverUrl: "https://example.test/mcp", headers: { Authorization: "fixture" } },
  });
});
it("refuses unsupported Antigravity options", () => {
  for (const item of [
    { ...server, disabledTools: ["write"] },
    { ...server, timeoutMs: 45000 },
  ])
    expect(() => antigravityNativeMcpConfig().entry(item)).toThrow(/not supported/u);
});
