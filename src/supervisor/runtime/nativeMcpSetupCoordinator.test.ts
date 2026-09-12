import { writeFileSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { AgentAdapter } from "../agents/base";
import type { McpServer } from "@/shared/contracts";
import { nativeJsonMcpConfig } from "../mcp/nativeSetup/jsonConfig";
import { NativeMcpSetupCoordinator } from "./nativeMcpSetupCoordinator";
let root: string;
beforeEach(() => {
  mkdirSync("tmp/native-mcp-tests", { recursive: true });
  root = mkdtempSync("tmp/native-mcp-tests/coordinator-");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const input = { agentKind: "test-provider", env: { kind: "native" as const } };
const server: McpServer = {
  id: "id",
  name: "proof",
  enabled: true,
  description: "",
  timeoutMs: 30000,
  transport: { type: "stdio", command: "node", args: [], env: {} },
};
function fixture() {
  let servers = [server];
  const config = nativeJsonMcpConfig(join(root, "config.json"), (item) => item.transport);
  const adapter = { nativeMcpConfig: () => config } as unknown as AgentAdapter;
  const coordinator = new NativeMcpSetupCoordinator(
    new Map([[input.agentKind, adapter]]),
    root,
    () => servers,
  );
  return {
    coordinator,
    setServers: (next: McpServer[]) => {
      servers = next;
    },
    config,
  };
}
it("installs only explicitly selected saved server IDs and allows removal after a source is deleted", () => {
  const { coordinator, config, setServers } = fixture();
  let status = coordinator.getStatus(input);
  expect(status.installedNames).toEqual([]);
  status = coordinator.apply({
    ...input,
    revision: status.revision!,
    installIds: [server.id],
    removeNames: [],
  });
  expect(status.installedNames).toEqual(["proof"]);
  setServers([]);
  status = coordinator.getStatus(input);
  coordinator.apply({
    ...input,
    revision: status.revision!,
    installIds: [],
    removeNames: ["proof"],
  });
  expect(config.read(readFileSync(config.path, "utf8"))).toEqual({});
});
it("rejects a saved-server edit after preview", () => {
  const { coordinator, setServers } = fixture();
  const status = coordinator.getStatus(input);
  setServers([
    { ...server, transport: { ...server.transport, command: "changed" } as McpServer["transport"] },
  ]);
  expect(() =>
    coordinator.apply({
      ...input,
      revision: status.revision!,
      installIds: [server.id],
      removeNames: [],
    }),
  ).toThrow(/changed/u);
});
it("rejects unknown IDs and unowned removals", () => {
  const { coordinator } = fixture();
  const status = coordinator.getStatus(input);
  expect(() =>
    coordinator.apply({
      ...input,
      revision: status.revision!,
      installIds: ["unknown"],
      removeNames: [],
    }),
  ).toThrow(/cannot be installed/u);
  expect(() =>
    coordinator.apply({
      ...input,
      revision: status.revision!,
      installIds: [],
      removeNames: ["unknown"],
    }),
  ).toThrow(/removal/u);
});

it("rejects a native edit after validating the preview", () => {
  const { coordinator, config } = fixture();
  const status = coordinator.getStatus(input);
  const originalEntry = config.entry;
  let calls = 0;
  config.entry = (item) => {
    if (++calls === 2) {
      // First translation describes eligibility; second occurs during commit preparation.
      mkdirSync(root, { recursive: true });
      writeFileSync(config.path, '{"external":true}');
    }
    return originalEntry(item);
  };
  expect(() =>
    coordinator.apply({
      ...input,
      revision: status.revision!,
      installIds: [server.id],
      removeNames: [],
    }),
  ).toThrow(/changed/u);
  expect(readFileSync(config.path, "utf8")).toBe('{"external":true}');
});
