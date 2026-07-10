import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentKind, ProjectLocation, RuntimeEvent } from "@/shared/contracts";
import type { AgentAdapter } from "@/supervisor/agents/base";
import { createAgentRegistry } from "@/supervisor/agents/registry";
import { OrchestratorThreadManager } from "@/supervisor/subagentMcp/OrchestratorThreadManager";
import { SubagentMcpIngress } from "@/supervisor/subagentMcp/SubagentMcpIngress";
import { SubagentRunManager } from "@/supervisor/subagentMcp/SubagentRunManager";
import type { SpawnableAgent } from "@/supervisor/subagentMcp/types";
import type { SubagentMcpHttpConfig } from "@/supervisor/agents/subagentMcp";

// Live integration: stands up the real subagents MCP ingress + run manager with
// the real adapter registry, then acts as the MCP client exactly the way a
// host agent does — initialize, tools/list, list_agents, run_agent with a
// cheap Claude model — and asserts on the re-tagged runtime events the parent
// thread (and therefore the subagent tile UI) would receive. Skips when Claude
// is not installed/authenticated on the host.

const PARENT_THREAD_ID = "int-parent-thread";
const ROUTING_GUIDE = "Prefer claude haiku for everything in this test.";

describe("subagents MCP (live)", () => {
  let projectDir: string;
  let ingress: SubagentMcpIngress;
  let runManager: SubagentRunManager;
  let mcp: SubagentMcpHttpConfig;
  let claude: AgentAdapter | undefined;
  const parentEvents: RuntimeEvent[] = [];

  const projectLocation = (): ProjectLocation =>
    process.platform === "win32"
      ? { kind: "windows", path: projectDir }
      : { kind: "posix", path: projectDir };

  beforeAll(async () => {
    projectDir = mkdtempSync(join(tmpdir(), "lightcode-subagent-int-"));
    writeFileSync(join(projectDir, "README.md"), "# subagent dogfood fixture\n");
    writeFileSync(join(projectDir, "hello.txt"), "hello from the parent project\n");

    const adapters = new Map<AgentKind, AgentAdapter>(
      createAgentRegistry().map((a) => [a.kind, a]),
    );
    claude = adapters.get("claude" as AgentKind);

    runManager = new SubagentRunManager({
      adapters,
      host: {
        getParentContext: (threadId) =>
          threadId === PARENT_THREAD_ID
            ? { projectLocation: projectLocation(), config: { model: "haiku" } }
            : undefined,
        appendRuntimeEvent: (_parentThreadId, event) => {
          parentEvents.push(event);
        },
      },
    });

    const spawnable: SpawnableAgent[] = claude
      ? [
          {
            provider: { value: claude.kind, label: claude.label },
            models: claude.capabilities.models.map((m) => ({
              value: m.id,
              label: m.label,
              reasoning: { values: [] },
            })),
            reasoningOptions: [],
            defaultModel: claude.capabilities.models[0]?.id ?? "haiku",
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
      getRoutingGuide: () => ROUTING_GUIDE,
    });
    await ingress.start();
    const registered = ingress.registerThread(PARENT_THREAD_ID);
    if (!registered) throw new Error("ingress did not mint a thread config");
    mcp = registered;
  });

  afterAll(() => {
    runManager.cancelAllForThread(PARENT_THREAD_ID);
    ingress.dispose();
    rmSync(projectDir, { recursive: true, force: true });
  });

  async function rpc(method: string, params?: unknown, token?: string) {
    const res = await fetch(mcp.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token ?? mcp.token}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
    });
    return res;
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const res = await rpc("tools/call", { name, arguments: args });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { content: Array<{ type: string; text: string }>; isError?: boolean };
    };
    return body.result;
  }

  it("rejects unknown bearer tokens", async () => {
    const res = await rpc("tools/list", undefined, "not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("serves initialize with base + user routing guidance", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "dogfood", version: "0" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { instructions?: string } };
    expect(body.result.instructions).toContain("list_agents");
    expect(body.result.instructions).toContain(ROUTING_GUIDE);
  });

  it("lists agents with models for routing", async () => {
    const result = await callTool("list_agents", {});
    const agents = JSON.parse(result.content[0]!.text) as Array<{ id: string; modelCount: number }>;
    if (!claude) return; // nothing spawnable on this host
    const entry = agents.find((a) => a.id === "claude");
    expect(entry).toBeDefined();
    expect(entry!.modelCount).toBeGreaterThan(0);

    const detail = await callTool("get_agent", { id: "claude" });
    const provider = JSON.parse(detail.content[0]!.text) as SpawnableAgent;
    expect(provider.models.length).toBeGreaterThan(0);
    expect(provider.defaultModel).toBeDefined();
  });

  it("run_agent completes a real child turn and bridges events to the parent", async () => {
    if (!claude) return;
    const status = await claude.detectInstall().catch(() => undefined);
    if (!status?.installed || status.authState !== "authenticated") {
      console.log(
        `[subagent-int] SKIPPED live run: installed=${status?.installed} auth=${status?.authState}`,
      );
      return;
    }
    console.log("[subagent-int] running LIVE child turn (claude haiku)");

    parentEvents.length = 0;
    const result = await callTool("run_agent", {
      provider: "claude",
      model: "haiku",
      name: "dogfood",
      prompt:
        "Reply with exactly the single word SUBAGENT_OK and nothing else. Do not use any tools.",
    });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text) as {
      run_id: string;
      status: string;
      output: string;
    };
    expect(parsed.run_id).toBeTruthy();
    expect(parsed.status).toBe("completed");
    expect(parsed.output).toContain("SUBAGENT_OK");

    // Synthetic tile lifecycle in the parent stream.
    const started = parentEvents.find(
      (e) => e.type === "item.started" && e.itemId === `sub:${parsed.run_id}`,
    );
    expect(started).toBeDefined();
    expect((started as { payload?: { isSubAgent?: boolean } }).payload?.isSubAgent).toBe(true);
    const completed = parentEvents.find(
      (e) => e.type === "item.completed" && e.itemId === `sub:${parsed.run_id}`,
    );
    expect(completed).toBeDefined();
    // Every bridged event must be re-addressed to the parent thread.
    for (const event of parentEvents) {
      expect((event as { threadId?: string }).threadId).toBe(PARENT_THREAD_ID);
    }
    // Child items nest under the synthetic tile.
    const childStarted = parentEvents.filter(
      (e) => e.type === "item.started" && e.itemId.startsWith(`${parsed.run_id}:`),
    );
    for (const event of childStarted) {
      const parentItemId = (event as { parentItemId?: string }).parentItemId;
      expect(
        parentItemId === `sub:${parsed.run_id}` ||
          parentItemId?.startsWith(`${parsed.run_id}:`) === true,
      ).toBe(true);
    }
  }, 240_000);

  it("wait_for_agent on an unknown run id fails cleanly", async () => {
    const result = await callTool("wait_for_agent", { run_id: "nope" });
    const parsed = JSON.parse(result.content[0]!.text) as { status: string };
    expect(parsed.status).toBe("failed");
  });

  it("spawn_agent + get_status + cancel round-trips without blocking", async () => {
    if (!claude) return;
    const status = await claude.detectInstall().catch(() => undefined);
    if (!status?.installed || status.authState !== "authenticated") return;

    const spawned = await callTool("spawn_agent", {
      provider: "claude",
      model: "haiku",
      prompt: "Count slowly from 1 to 50, one number per line.",
    });
    const { run_id } = JSON.parse(spawned.content[0]!.text) as { run_id: string };
    expect(run_id).toBeTruthy();

    const polled = await callTool("get_status", { run_id });
    const polledParsed = JSON.parse(polled.content[0]!.text) as { status: string };
    expect(["running", "completed"]).toContain(polledParsed.status);

    const cancelled = await callTool("cancel", { run_id });
    expect(JSON.parse(cancelled.content[0]!.text)).toEqual({ ok: true });
    const after = await callTool("get_status", { run_id });
    const afterParsed = JSON.parse(after.content[0]!.text) as { status: string };
    expect(["cancelled", "completed"]).toContain(afterParsed.status);
  }, 120_000);
});
