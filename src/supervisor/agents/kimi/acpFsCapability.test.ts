import { describe, expect, it, vi } from "vitest";

// `createStructuredSession` spawns a real `kimi acp` process; stub the session
// factory (and the trust marker it writes first) so the test only inspects the
// options the adapter hands the shared ACP session.
vi.mock("../acp", () => ({
  createAcpStructuredSession: vi.fn<() => undefined>(() => undefined),
}));
vi.mock("./kimiTrust", () => ({
  ensureKimiWorkspaceTrust: vi.fn<() => Promise<void>>(async () => {}),
}));

import type { ProjectLocation, ResolvedMcpServer, ThreadConfig } from "@/shared/contracts";
import { createAcpStructuredSession } from "../acp";
import { createKimiAdapter } from "./index";

async function createSessionOptions(mcpServers?: ResolvedMcpServer[]) {
  vi.mocked(createAcpStructuredSession).mockClear();
  const adapter = createKimiAdapter();
  await adapter.createStructuredSession?.({
    threadId: "thread-1",
    projectLocation: { kind: "windows", path: "C:\\repo" } as ProjectLocation,
    config: { mode: "agent" } as ThreadConfig,
    ...(mcpServers ? { mcpServers } : {}),
  });
  return vi.mocked(createAcpStructuredSession).mock.calls[0]?.[1];
}

describe("Kimi ACP fs capability", () => {
  it("keeps the client fs text capability unadvertised so plan mode works", async () => {
    // Kimi's ACP host filesystem proxies every text read through the client and
    // only recognizes an errno-shaped `ENOENT` as "file missing". Plan mode
    // reads its plan file before creating it, so advertising the capability
    // turned that read into a JSON-RPC error and killed the turn:
    // `EnterPlanMode` failed with `Internal error`, and threads opened in Plan
    // mode returned no response at all.
    expect(await createSessionOptions()).toMatchObject({ acpFsTextCapability: false });
  });

  it("no longer needs the ~/.kimi-code fs carve-out", async () => {
    // The carve-out only existed to let those proxied reads/writes reach Kimi's
    // own home dir. With the capability unadvertised they never leave the agent.
    expect(await createSessionOptions()).not.toHaveProperty("acpFsAgentHomeDirs");
  });
});

describe("Kimi ACP MCP compatibility", () => {
  it("relays every server and marks stdio transports optimistic", async () => {
    // Kimi's ACP server fails session/new on stdio MCP servers ("does not
    // declare a runtime identity") but has no mcpCapabilities flag to say so.
    // The adapter must not pre-filter: it marks stdio optimistic so the shared
    // session retries once without them on that failure — and relays them for
    // free once Kimi ships support (MoonshotAI/kimi-code#3069).
    const servers: ResolvedMcpServer[] = [
      {
        id: "stdio",
        name: "stdio",
        timeoutMs: 30_000,
        transport: { type: "stdio", command: "npx", args: ["server"], env: {} },
      },
      {
        id: "http",
        name: "http",
        timeoutMs: 30_000,
        transport: { type: "http", url: "http://127.0.0.1:9000/mcp", headers: {} },
      },
      {
        id: "sse",
        name: "sse",
        timeoutMs: 30_000,
        transport: { type: "sse", url: "http://127.0.0.1:9001/sse", headers: {} },
      },
      {
        id: "stdio-2",
        name: "stdio-2",
        timeoutMs: 30_000,
        transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
      },
    ];

    const options = await createSessionOptions(servers);
    expect(options?.mcpServers).toEqual(servers);
    expect(options?.acpOptimisticMcpTransports).toEqual(["stdio"]);
  });
});
