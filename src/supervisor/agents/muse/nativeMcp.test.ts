import { createMuseAdapter } from "./index";
import { expect, it } from "vitest";
import { museNativeMcpConfig } from "./nativeMcp";
import type { McpServer } from "@/shared/contracts";
const server: McpServer = {
  id: "proof",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 30000,
  transport: { type: "stdio", command: "node", args: [], env: { FIXTURE: "value" } },
};
it("creates schema-versioned Muse config with direct command/env and native framing", () => {
  const config = museNativeMcpConfig();
  expect(JSON.parse(config.write("", "proof", config.entry(server)))).toEqual({
    schema_version: 1,
    mcpServers: {
      proof: {
        enabled: true,
        transport: "stdio",
        command: "node",
        args: [],
        env: { FIXTURE: "value" },
        framing: "line_delimited_json",
      },
    },
  });
});
it("refuses unrepresentable Muse options", () => {
  for (const item of [
    { ...server, disabledTools: ["write"] },
    { ...server, timeoutMs: 45000 },
    {
      ...server,
      transport: { type: "sse" as const, url: "https://example.test/events", headers: {} },
    },
  ])
    expect(() => museNativeMcpConfig().entry(item)).toThrow(/not supported/u);
});

it("offers native setup only where Muse executes on the host", () => {
  const adapter = createMuseAdapter();
  expect(adapter.nativeMcpConfig?.({ envKind: "posix" })).toBeDefined();
  expect(adapter.nativeMcpConfig?.({ envKind: "windows" })).toBeUndefined();
  expect(adapter.nativeMcpConfig?.({ envKind: "wsl", wslDistro: "Ubuntu" })).toBeUndefined();
});
