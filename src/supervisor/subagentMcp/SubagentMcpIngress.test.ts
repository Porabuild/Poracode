import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrchestratorThreadManager } from "./OrchestratorThreadManager";
import { SubagentMcpIngress } from "./SubagentMcpIngress";
import type { SubagentRunManager } from "./SubagentRunManager";
import { SUBAGENT_MCP_INSTRUCTIONS_BASE } from "./toolRegistry";
import type { SpawnableAgent } from "./types";

/** Inert orchestrator lane — these tests only exercise the ephemeral-run tools. */
function makeInertOrchestrator(): OrchestratorThreadManager {
  return new OrchestratorThreadManager({
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
  });
}

const AGENTS: SpawnableAgent[] = [
  {
    kind: "codex",
    label: "Codex",
    models: [{ value: "gpt-5.5", label: "GPT-5.5" }],
    efforts: ["low", "high"],
    defaultModel: "gpt-5.5",
  },
];

function makeRunManager(): {
  runManager: SubagentRunManager;
  spawned: Array<{ parentThreadId: string; agent: string }>;
} {
  const spawned: Array<{ parentThreadId: string; agent: string }> = [];
  const runManager = {
    spawn: (parentThreadId: string, request: { agent: string }) => {
      spawned.push({ parentThreadId, agent: request.agent });
      return { runId: "run-xyz" };
    },
    waitFor: async () => ({ status: "completed" as const, output: "done" }),
    getStatus: () => ({ status: "completed" as const, output: "done" }),
    cancel: async () => {},
    cancelAllForThread: () => {},
  } as unknown as SubagentRunManager;
  return { runManager, spawned };
}

describe("SubagentMcpIngress", () => {
  let ingress: SubagentMcpIngress;
  let token: string;
  let mcpUrl: string;
  let spawned: Array<{ parentThreadId: string; agent: string }>;

  beforeEach(async () => {
    const rm = makeRunManager();
    spawned = rm.spawned;
    ingress = new SubagentMcpIngress({
      runManager: rm.runManager,
      orchestrator: makeInertOrchestrator(),
      getSpawnableAgents: async () => AGENTS,
      getRoutingGuide: () => "PREFER codex for search.",
    });
    await ingress.start();
    const config = ingress.registerThread("thread-1");
    if (!config) throw new Error("registerThread returned undefined");
    token = config.token;
    mcpUrl = config.url;
  });

  afterEach(() => {
    ingress.dispose();
  });

  async function rpc(method: string, params?: unknown, bearer = token): Promise<Response> {
    return await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
  }

  it("mints a per-thread token and a /mcp endpoint url", () => {
    expect(mcpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
    expect(token).toHaveLength(64);
    // Re-registering the same thread reuses the token.
    expect(ingress.registerThread("thread-1")!.token).toBe(token);
  });

  it("rejects unknown tokens with 401", async () => {
    const res = await rpc("tools/list", undefined, "deadbeef");
    expect(res.status).toBe(401);
  });

  it("returns instructions with the routing guide on initialize", async () => {
    const res = await rpc("initialize");
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("subagents");
    expect(body.result.instructions).toContain(SUBAGENT_MCP_INSTRUCTIONS_BASE);
    expect(body.result.instructions).toContain("PREFER codex for search.");
  });

  it("lists the subagent tools", async () => {
    const res = await rpc("tools/list");
    const body = await res.json();
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual([
      "cancel",
      "close_thread",
      "create_thread",
      "get_status",
      "get_thread",
      "interrupt_thread",
      "list_agents",
      "list_threads",
      "read_thread",
      "run_agent",
      "send_to_thread",
      "spawn_agent",
      "wait_for_agent",
      "wait_for_thread",
    ]);
  });

  it("dispatches list_agents", async () => {
    const res = await rpc("tools/call", { name: "list_agents", arguments: {} });
    const body = await res.json();
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual(AGENTS);
  });

  it("dispatches spawn_agent to the run manager with the caller's parent thread", async () => {
    const res = await rpc("tools/call", {
      name: "spawn_agent",
      arguments: { agent: "codex", prompt: "search the code" },
    });
    const body = await res.json();
    expect(JSON.parse(body.result.content[0].text)).toEqual({ run_id: "run-xyz" });
    expect(spawned).toEqual([{ parentThreadId: "thread-1", agent: "codex" }]);
  });

  it("returns an isError result for unknown tools", async () => {
    const res = await rpc("tools/call", { name: "bogus", arguments: {} });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });

  it("returns an isError result for spawn_agent without a prompt", async () => {
    const res = await rpc("tools/call", { name: "spawn_agent", arguments: { agent: "codex" } });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });

  it("stops routing a thread after unregister", async () => {
    ingress.unregisterThread("thread-1");
    const res = await rpc("tools/list");
    expect(res.status).toBe(401);
  });
});
