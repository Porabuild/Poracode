import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CROSSAGENT_PROVIDER_SESSION_ID_ARG, CrossagentMcpIngress } from "./CrossagentMcpIngress";
import type { SubagentRunManager } from "./SubagentRunManager";
import { CROSSAGENT_MCP_INSTRUCTIONS_BASE } from "./toolRegistry";
import type { SpawnableAgent, SpawnAgentRequest } from "./types";

const AGENTS: SpawnableAgent[] = [
  {
    provider: { value: "codex", label: "Codex" },
    models: [
      {
        value: "gpt-5.5",
        label: "GPT-5.5",
        reasoning: {
          values: ["low", "high"],
          default: "high",
        },
        fast: { available: true },
      },
    ],
    reasoningOptions: [
      { value: "low", label: "Low" },
      { value: "high", label: "High" },
    ],
    defaultModel: "gpt-5.5",
    permissions: {
      options: [{ value: "full-access", label: "Full access" }],
      default: "full-access",
    },
    execution: "structured",
  },
];

const PROVIDER_SESSION_THREADS: Record<string, string> = {
  "session-1": "thread-1",
  "session-2": "thread-2",
  "child-1": "thread-1",
};

function makeRunManager(): {
  runManager: SubagentRunManager;
  spawned: Array<{ parentThreadId: string } & SpawnAgentRequest>;
  setWaitFor: (next: () => Promise<{ status: "completed"; output: string }>) => void;
} {
  const spawned: Array<{ parentThreadId: string } & SpawnAgentRequest> = [];
  let waitFor = async () => ({ status: "completed" as const, output: "done" });
  const runManager = {
    spawn: (parentThreadId: string, request: SpawnAgentRequest) => {
      spawned.push({ parentThreadId, ...request });
      return { runId: "run-xyz" };
    },
    spawnMany: (parentThreadId: string, requests: SpawnAgentRequest[]) =>
      requests.map((request, index) => {
        spawned.push({ parentThreadId, ...request });
        return { runId: `run-${index + 1}` };
      }),
    waitFor: () => waitFor(),
    waitForMany: async (runIds: string[]) =>
      runIds.map((runId) => ({ run_id: runId, status: "completed" as const, output: "done" })),
    getStatus: () => ({ status: "completed" as const, output: "done" }),
    listRuns: () => [],
    cancel: async () => {},
    cancelAllForThread: () => {},
  } as unknown as SubagentRunManager;
  return {
    runManager,
    spawned,
    setWaitFor: (next) => {
      waitFor = next;
    },
  };
}

describe("CrossagentMcpIngress", () => {
  let ingress: CrossagentMcpIngress;
  let token: string;
  let mcpUrl: string;
  let providerToken: string;
  let providerMcpUrl: string;
  let spawned: Array<{ parentThreadId: string } & SpawnAgentRequest>;
  let setWaitFor: ReturnType<typeof makeRunManager>["setWaitFor"];

  beforeEach(async () => {
    const rm = makeRunManager();
    spawned = rm.spawned;
    setWaitFor = rm.setWaitFor;
    ingress = new CrossagentMcpIngress({
      runManager: rm.runManager,
      getSpawnableAgents: async () => AGENTS,
      resolveProviderSessionThreadId: (sessionId) => PROVIDER_SESSION_THREADS[sessionId],
      getRoutingGuide: () => "PREFER codex for search.",
    });
    await ingress.start();
    const config = ingress.registerThread("thread-1");
    if (!config) throw new Error("registerThread returned undefined");
    token = config.token;
    mcpUrl = config.url;
    const providerConfig = ingress.registerProviderSessionThread("thread-1");
    if (!providerConfig) throw new Error("registerProviderSessionThread returned undefined");
    providerToken = providerConfig.token;
    providerMcpUrl = providerConfig.url;
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

  async function providerRpc(method: string, params?: unknown): Promise<Response> {
    return await fetch(providerMcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${providerToken}`,
      },
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

  it("shares one provider credential while routing concurrent sessions independently", async () => {
    const secondConfig = ingress.registerProviderSessionThread("thread-2");
    expect(secondConfig?.token).toBe(providerToken);
    expect(providerToken).not.toBe(token);

    await Promise.all([
      providerRpc("tools/call", {
        name: "spawn_agent",
        arguments: {
          provider: "codex",
          prompt: "first",
          [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "session-1",
        },
      }),
      providerRpc("tools/call", {
        name: "spawn_agent",
        arguments: {
          provider: "codex",
          prompt: "second",
          [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "session-2",
        },
      }),
    ]);

    expect(spawned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ parentThreadId: "thread-1", prompt: "first" }),
        expect.objectContaining({ parentThreadId: "thread-2", prompt: "second" }),
      ]),
    );
  });

  it("invalidates the shared provider credential when the ingress restarts", async () => {
    const rm = makeRunManager();
    const restarted = new CrossagentMcpIngress({
      runManager: rm.runManager,
      getSpawnableAgents: async () => AGENTS,
      resolveProviderSessionThreadId: (sessionId) => PROVIDER_SESSION_THREADS[sessionId],
    });
    await restarted.start();
    try {
      const restartedConfig = restarted.registerProviderSessionThread("thread-1");
      expect(restartedConfig?.token).not.toBe(providerToken);
    } finally {
      restarted.dispose();
    }
  });

  it("fails closed when provider-session routing metadata is missing or stale", async () => {
    const missing = await providerRpc("tools/call", {
      name: "list_agents",
      arguments: {},
    });
    expect((await missing.json()).result).toMatchObject({ isError: true });

    const stale = await providerRpc("tools/call", {
      name: "list_agents",
      arguments: { [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "unknown" },
    });
    expect((await stale.json()).result).toMatchObject({ isError: true });
  });

  it("maps child provider sessions to the registered parent thread", async () => {
    const response = await providerRpc("tools/call", {
      name: "spawn_agent",
      arguments: {
        provider: "codex",
        prompt: "from child",
        [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "child-1",
      },
    });
    expect((await response.json()).result.isError).not.toBe(true);
    expect(spawned.at(-1)?.parentThreadId).toBe("thread-1");
  });

  it("enforces disabled tools per resolved provider session", async () => {
    ingress.registerProviderSessionThread("thread-1", ["spawn_agent"]);
    ingress.registerProviderSessionThread("thread-2");

    const blocked = await providerRpc("tools/call", {
      name: "spawn_agent",
      arguments: {
        provider: "codex",
        prompt: "blocked",
        [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "session-1",
      },
    });
    expect((await blocked.json()).result).toMatchObject({ isError: true });

    const allowed = await providerRpc("tools/call", {
      name: "spawn_agent",
      arguments: {
        provider: "codex",
        prompt: "allowed",
        [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "session-2",
      },
    });
    expect((await allowed.json()).result.isError).not.toBe(true);
  });

  it("rejects provider-session calls after the parent thread unregisters", async () => {
    ingress.unregisterThread("thread-1");
    const response = await providerRpc("tools/call", {
      name: "list_agents",
      arguments: { [CROSSAGENT_PROVIDER_SESSION_ID_ARG]: "session-1" },
    });
    expect((await response.json()).result).toMatchObject({ isError: true });
  });

  it("returns instructions with the routing guide on initialize", async () => {
    const res = await rpc("initialize");
    const body = await res.json();
    expect(body.result.serverInfo.name).toBe("crossagents");
    expect(body.result.instructions).toContain(CROSSAGENT_MCP_INSTRUCTIONS_BASE);
    expect(body.result.instructions).toContain("PREFER codex for search.");
  });

  it("lists the subagent tools", async () => {
    const res = await rpc("tools/list");
    const body = await res.json();
    const names = (body.result.tools as Array<{ name: string }>).map((t) => t.name).sort();
    expect(names).toEqual([
      "cancel",
      "get_agent",
      "get_status",
      "list_agents",
      "list_runs",
      "spawn_agent",
      "wait_for_agent",
    ]);
  });

  it("filters disabled subagent tools from discovery and calls", async () => {
    ingress.registerThread("thread-1", ["spawn_agent"]);
    const list = await rpc("tools/list");
    const listBody = await list.json();
    expect(listBody.result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      "spawn_agent",
    );
    expect(listBody.result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      "spawn_agents",
    );

    const call = await rpc("tools/call", { name: "spawn_agent", arguments: {} });
    expect((await call.json()).result).toMatchObject({ isError: true });
    const batchCall = await rpc("tools/call", { name: "spawn_agents", arguments: {} });
    expect((await batchCall.json()).result).toMatchObject({ isError: true });
  });

  it("dispatches list_agents", async () => {
    const res = await rpc("tools/call", { name: "list_agents", arguments: {} });
    const body = await res.json();
    const text = body.result.content[0].text;
    expect(JSON.parse(text)).toEqual([
      {
        id: "codex",
        label: "Codex",
        execution: "structured",
        defaultModel: "gpt-5.5",
        modelCount: 1,
      },
    ]);
  });

  it("dispatches get_agent by provider id", async () => {
    const res = await rpc("tools/call", {
      name: "get_agent",
      arguments: { id: "codex" },
    });
    const body = await res.json();
    expect(JSON.parse(body.result.content[0].text)).toEqual(AGENTS[0]);
  });

  it("dispatches blocking spawn_agent to the run manager with the caller's parent thread", async () => {
    const res = await rpc("tools/call", {
      name: "spawn_agent",
      arguments: {
        provider: "codex",
        model: "gpt-5.5",
        reasoning: "high",
        fast: true,
        permissions: "full-access",
        prompt: "search the code",
      },
    });
    const body = await res.json();
    expect(JSON.parse(body.result.content[0].text)).toEqual({
      run_id: "run-xyz",
      status: "completed",
      output: "done",
    });
    expect(spawned).toEqual([
      {
        parentThreadId: "thread-1",
        agent: "codex",
        model: "gpt-5.5",
        effort: "high",
        fast: true,
        prompt: "search the code",
      },
    ]);
  });

  it("executes JSON-RPC batch calls concurrently while preserving response order", async () => {
    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let bothEntered!: () => void;
    const both = new Promise<void>((resolve) => {
      bothEntered = resolve;
    });
    setWaitFor(async () => {
      entered += 1;
      if (entered === 2) bothEntered();
      await gate;
      return { status: "completed", output: "done" };
    });

    const responsePromise = fetch(mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "spawn_agent",
            arguments: { provider: "codex", prompt: "one" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "spawn_agent",
            arguments: { provider: "codex", prompt: "two" },
          },
        },
      ]),
    });

    await Promise.race([
      both,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("batch calls ran serially")), 500),
      ),
    ]);
    release();
    const body = (await (await responsePromise).json()) as Array<{ id: number }>;
    expect(body.map((reply) => reply.id)).toEqual([1, 2]);
  });

  it("returns an isError result for unknown tools", async () => {
    const res = await rpc("tools/call", { name: "bogus", arguments: {} });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });

  it("returns an isError result for spawn_agent without a prompt", async () => {
    const res = await rpc("tools/call", {
      name: "spawn_agent",
      arguments: { provider: "codex" },
    });
    const body = await res.json();
    expect(body.result.isError).toBe(true);
  });

  it("stops routing a thread after unregister", async () => {
    ingress.unregisterThread("thread-1");
    const res = await rpc("tools/list");
    expect(res.status).toBe(401);
  });
});
