import { describe, expect, it } from "vitest";
import type { McpServer } from "@/shared/contracts";
import { formStateToServer, serverToFormState } from "./mcpFormUtils";

describe("formStateToServer", () => {
  it("preserves metadata that the editor does not expose yet", () => {
    const server: McpServer = {
      id: "server-id",
      name: "filesystem",
      enabled: true,
      catalogId: "filesystem",
      agentKinds: ["claude"],
      transport: {
        type: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/repo"],
        env: {},
        cwd: "/repo",
      },
    };

    expect(formStateToServer(serverToFormState(server), server)).toMatchObject({
      catalogId: "filesystem",
      agentKinds: ["claude"],
      transport: { cwd: "/repo" },
    });
  });
});
