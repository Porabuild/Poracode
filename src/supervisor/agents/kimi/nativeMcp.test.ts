import { expect, it } from "vitest";
import { kimiNativeMcpConfig } from "./nativeMcp";
import type { McpServer } from "@/shared/contracts";
const server: McpServer = {
  id: "proof",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 45000,
  disabledTools: ["write"],
  transport: { type: "stdio", command: "node", args: [], env: {}, cwd: "/fixture" },
};
it("preserves Kimi native cwd, tool restrictions, and timeouts", () => {
  expect(kimiNativeMcpConfig().entry(server)).toEqual({
    command: "node",
    args: [],
    env: {},
    cwd: "/fixture",
    disabledTools: ["write"],
    startupTimeoutMs: 45000,
    toolTimeoutMs: 45000,
  });
});
it("uses Kimi's explicit SSE discriminator and retains static headers", () => {
  expect(
    kimiNativeMcpConfig().entry({
      ...server,
      transport: {
        type: "sse",
        url: "https://example.test/events",
        headers: { Authorization: "fixture" },
      },
    }),
  ).toMatchObject({
    transport: "sse",
    url: "https://example.test/events",
    headers: { Authorization: "fixture" },
  });
});
