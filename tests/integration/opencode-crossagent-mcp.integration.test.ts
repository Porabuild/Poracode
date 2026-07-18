import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentKind, ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import type { CrossagentMcpHttpConfig } from "@/supervisor/agents/crossagentMcp";
import { createAgentRegistry } from "@/supervisor/agents/registry";
import {
  acquireOpenCodeServer,
  resolveOpenCodeSessionDirectory,
  shutdownSpawnedOpenCodeServers,
} from "@/supervisor/agents/opencode/sdkClient";
import {
  CROSSAGENT_PROVIDER_SESSION_ID_ARG,
  CrossagentMcpIngress,
} from "@/supervisor/crossagentMcp/CrossagentMcpIngress";
import { OrchestratorThreadManager } from "@/supervisor/crossagentMcp/OrchestratorThreadManager";
import { SubagentRunManager } from "@/supervisor/crossagentMcp/SubagentRunManager";

const PARENT_THREAD_ID = "oc-int-parent-thread";

describe("opencode hosts Crossagents MCP on its shared server (live)", () => {
  let firstProjectDir: string;
  let secondProjectDir: string;
  let ingress: CrossagentMcpIngress;
  let runManager: SubagentRunManager;
  let mcp: CrossagentMcpHttpConfig;
  let opencode: AgentAdapter | undefined;
  const providerSessions = new Map<string, string>();

  const projectLocation = (path: string): ProjectLocation =>
    process.platform === "win32" ? { kind: "windows", path } : { kind: "posix", path };

  beforeAll(async () => {
    firstProjectDir = mkdtempSync(join(tmpdir(), "poracode-oc-shared-a-"));
    secondProjectDir = mkdtempSync(join(tmpdir(), "poracode-oc-shared-b-"));
    writeFileSync(join(firstProjectDir, "README.md"), "# first shared server fixture\n");
    writeFileSync(join(secondProjectDir, "README.md"), "# second shared server fixture\n");

    const adapters = new Map<AgentKind, AgentAdapter>(
      createAgentRegistry().map((adapter) => [adapter.kind, adapter]),
    );
    opencode = adapters.get("opencode" as AgentKind);
    runManager = new SubagentRunManager({
      adapters,
      host: {
        getParentContext: () => undefined,
        appendRuntimeEvent: () => {},
      },
    });
    ingress = new CrossagentMcpIngress({
      runManager,
      orchestrator: new OrchestratorThreadManager({
        adapters: new Map(),
        emit: () => {},
        host: {
          getParentContext: () => undefined,
          getThreadState: () => undefined,
          readThreadHistory: async () => undefined,
          sendThreadInput: async () => {},
          interruptThread: async () => {},
          closeThread: async () => {},
        },
        createWorktree: async () => ({ path: "/unused" }),
        removeWorktree: async () => {},
      }),
      getSpawnableAgents: async () => [],
      resolveProviderSessionThreadId: (sessionId) => providerSessions.get(sessionId),
    });
    await ingress.start();
    const registered = ingress.registerProviderSessionThread(PARENT_THREAD_ID);
    if (!registered) throw new Error("ingress did not create a provider-session config");
    mcp = registered;
  });

  afterAll(() => {
    shutdownSpawnedOpenCodeServers();
    runManager.cancelAllForThread(PARENT_THREAD_ID);
    ingress.dispose();
    rmSync(firstProjectDir, { recursive: true, force: true });
    rmSync(secondProjectDir, { recursive: true, force: true });
  });

  it("reuses one server and routes the shared credential by session id", async () => {
    if (!opencode) {
      console.log("[oc-crossagents-int] SKIPPED: opencode adapter not registered");
      return;
    }
    const status = await opencode.detectInstall().catch(() => undefined);
    if (!status?.installed) {
      console.log(`[oc-crossagents-int] SKIPPED: opencode installed=${status?.installed}`);
      return;
    }

    const serverConfig = {
      id: "crossagents",
      name: "crossagents",
      timeoutMs: 300_000,
      transport: { type: "http" as const, url: mcp.url, headers: mcp.headers },
    };
    const firstLocation = projectLocation(firstProjectDir);
    const secondLocation = projectLocation(secondProjectDir);
    const first = await acquireOpenCodeServer({
      projectLocation: firstLocation,
      mcpServers: [serverConfig],
    });
    const second = await acquireOpenCodeServer({
      projectLocation: secondLocation,
      mcpServers: [serverConfig],
    });

    try {
      expect(second.handle).toBe(first.handle);
      expect(second.baseUrl).toBe(first.baseUrl);

      for (const [acquired, location] of [
        [first, firstLocation],
        [second, secondLocation],
      ] as const) {
        const directory = resolveOpenCodeSessionDirectory(location);
        const result = await acquired.client.mcp.status({ directory });
        const servers = (result.data ?? {}) as Record<string, { status: string }>;
        expect(servers.crossagents?.status).toBe("connected");
      }

      const directory = resolveOpenCodeSessionDirectory(firstLocation);
      const created = await first.client.session.create({
        directory,
        title: "poracode/crossagents-shared-test",
      });
      const providerSessionId = created.data?.id;
      if (!providerSessionId) throw new Error("opencode session.create returned no id");
      providerSessions.set(providerSessionId, PARENT_THREAD_ID);

      const response = await fetch(mcp.url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${mcp.token}` },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "list_agents",
            arguments: { [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: providerSessionId },
          },
        }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).result.isError).not.toBe(true);
    } finally {
      await second.dispose();
      await first.dispose();
    }
  }, 120_000);
});
