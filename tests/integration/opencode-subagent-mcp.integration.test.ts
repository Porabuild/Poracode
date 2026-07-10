import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentKind, ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { createAgentRegistry } from "@/supervisor/agents/registry";
import {
  acquireOpenCodeServer,
  resolveOpenCodeSessionDirectory,
  shutdownSpawnedOpenCodeServers,
} from "@/supervisor/agents/opencode/sdkClient";
import { OrchestratorThreadManager } from "@/supervisor/subagentMcp/OrchestratorThreadManager";
import { SubagentMcpIngress } from "@/supervisor/subagentMcp/SubagentMcpIngress";
import { SubagentRunManager } from "@/supervisor/subagentMcp/SubagentRunManager";
import type { SpawnableAgent } from "@/supervisor/subagentMcp/types";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";

// Live integration for OpenCode HOSTING the cross-provider subagents MCP.
// Stands up the real ingress + run manager, then acquires a DEDICATED per-thread
// `opencode serve` with the thread's subagents config and asserts, via the
// OpenCode client's `mcp.status`, that the `subagents` server was registered
// (mcp.add) and successfully connected (mcp.connect handshook against the real
// ingress with the per-thread bearer token — a 401 would surface as "failed").
// Skips when OpenCode is not installed on the host.

const PARENT_THREAD_ID = "oc-int-parent-thread";

describe("opencode hosts subagents MCP (live)", () => {
  let projectDir: string;
  let ingress: SubagentMcpIngress;
  let runManager: SubagentRunManager;
  let mcp: SubagentMcpHttpConfig;
  let opencode: AgentAdapter | undefined;

  const projectLocation = (): ProjectLocation =>
    process.platform === "win32"
      ? { kind: "windows", path: projectDir }
      : { kind: "posix", path: projectDir };

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "lightcode-oc-subagent-int-"));
    writeFileSync(join(projectDir, "README.md"), "# opencode subagent host fixture\n");

    const adapters = new Map<AgentKind, AgentAdapter>(
      createAgentRegistry().map((a) => [a.kind, a]),
    );
    opencode = adapters.get("opencode" as AgentKind);

    const parentEvents: RuntimeEvent[] = [];
    runManager = new SubagentRunManager({
      adapters,
      host: {
        getParentContext: (threadId) =>
          threadId === PARENT_THREAD_ID
            ? { projectLocation: projectLocation(), config: { model: "opencode/big-pickle" } }
            : undefined,
        appendRuntimeEvent: (_parentThreadId, event) => {
          parentEvents.push(event);
        },
      },
    });

    const spawnable: SpawnableAgent[] = opencode
      ? [
          {
            provider: { value: opencode.kind, label: opencode.label },
            models: opencode.capabilities.models.map((m) => ({
              value: m.id,
              label: m.label,
              reasoning: { values: [] },
            })),
            reasoningOptions: [],
            defaultModel: opencode.capabilities.models[0]?.id ?? "opencode/big-pickle",
            permissions: {
              options: [{ value: "full-access", label: "Full access" }],
              default: "full-access",
            },
            execution: "structured",
          },
        ]
      : [];

    ingress = new SubagentMcpIngress({
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
      getSpawnableAgents: async () => spawnable,
      getRoutingGuide: () => "Prefer opencode/big-pickle for everything in this test.",
    });
    await ingress.start();
    const registered = ingress.registerThread(PARENT_THREAD_ID);
    if (!registered) throw new Error("ingress did not mint a thread config");
    mcp = registered;
  });

  afterAll(() => {
    shutdownSpawnedOpenCodeServers();
    runManager.cancelAllForThread(PARENT_THREAD_ID);
    ingress.dispose();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("registers + connects the subagents MCP on a dedicated per-thread server", async () => {
    if (!opencode) {
      console.log("[oc-subagent-int] SKIPPED: opencode adapter not registered");
      return;
    }
    const status = await opencode.detectInstall().catch(() => undefined);
    if (!status?.installed) {
      console.log(`[oc-subagent-int] SKIPPED: opencode installed=${status?.installed}`);
      return;
    }

    const location = projectLocation();
    const acquired = await acquireOpenCodeServer({
      projectLocation: location,
      subagentMcp: mcp,
      dedicatedKey: PARENT_THREAD_ID,
    });

    try {
      const directory = resolveOpenCodeSessionDirectory(location);
      const result = await acquired.client.mcp.status({ directory });
      const servers = (result.data ?? {}) as Record<string, { status: string; error?: string }>;
      const subagents = servers.subagents;
      expect(subagents).toBeDefined();
      // Connected proves the full path: dedicated server spawned, mcp.add
      // registered the entry, mcp.connect completed the MCP initialize
      // handshake against the live ingress with the per-thread bearer token.
      expect(subagents?.status).toBe("connected");
    } finally {
      await acquired.dispose();
    }
  }, 120_000);
});
