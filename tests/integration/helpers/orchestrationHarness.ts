import {
  mkdtempSync,
  readFileSync,
  existsSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeEvent } from "@/shared/contracts";
import { probeAcpCapabilities } from "@/supervisor/agents/acp/probe";
import { createAcpGenericAdapter } from "@/supervisor/agents/acp-generic";
import { CrossagentMcpIngress } from "@/supervisor/crossagentMcp/CrossagentMcpIngress";
import { SubagentRunManager } from "@/supervisor/crossagentMcp/SubagentRunManager";
import type { SpawnableAgent } from "@/supervisor/crossagentMcp/types";
import {
  HostResourceAdmissionOwner,
  type HostResourceAdmission,
} from "@/supervisor/runtime/hostResourceAdmission";

/** Real production managers and owned protocol subprocesses; no provider credentials. */
export async function createOrchestrationHarness(
  options: {
    oneShot?: boolean;
    structuredDisposalTimeoutMs?: number;
    fixtureFiles?: Record<string, string>;
  } = {},
) {
  const parent = "orchestration-process-parent";
  let directory: string;
  let tracePath: string;
  let ingress: CrossagentMcpIngress;
  let manager: SubagentRunManager;
  let admission: HostResourceAdmission;
  let auth: { url: string; token: string };
  let provider: string;
  let events: RuntimeEvent[];

  const plan = (value: Record<string, unknown>) => `ORCHESTRATION_PLAN=${JSON.stringify(value)}`;
  const trace = (): Array<{
    event: string;
    pid: number;
    sessionId: string;
    label?: string;
    dependencies?: Array<{
      id: string;
      result: { version: number; summary: string; outcome: string };
    }>;
    priorLabels?: string[];
    cancelled?: boolean;
    outcome?: { outcome: string; optionId?: string };
  }> =>
    existsSync(tracePath)
      ? readFileSync(tracePath, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line))
      : [];
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  async function until(check: () => boolean): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (!check()) {
      if (Date.now() > deadline) throw new Error("Owned orchestration condition did not complete");
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  async function rpc(method: string, params: unknown, token = auth.token) {
    return fetch(auth.url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
  }
  type ToolResult = {
    status: string;
    ok?: boolean;
    run_id: string;
    output: string;
    continued_from?: string;
    workflow_id: string;
    tasks: Array<{ status: string; pending_requests?: number }>;
  };
  async function call(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const response = await rpc("tools/call", { name, arguments: args });
    if (response.status !== 200) throw new Error(`MCP HTTP ${response.status}`);
    const body = (await response.json()) as {
      result: { isError?: boolean; content: Array<{ text: string }> };
    };
    if (body.result.isError) throw new Error(JSON.stringify(body.result));
    return JSON.parse(body.result.content[0]!.text);
  }
  async function drained() {
    await until(
      () =>
        admission.usage().total === 0 &&
        trace()
          .filter((row) => row.event === "started")
          .every((row) => !alive(row.pid)),
    );
    if (trace().some((row) => row.event === "error")) throw new Error("Fixture process error");
  }

  directory = realpathSync(mkdtempSync(join(tmpdir(), "poracode-orchestration-process-")));
  const projectRoot = join(directory, "project"),
    sessionDirectory = join(directory, "sessions");
  mkdirSync(projectRoot);
  mkdirSync(sessionDirectory);
  for (const [path, content] of Object.entries(options.fixtureFiles ?? {})) {
    if (path.startsWith("/") || path.split(/[\\/]/u).includes(".."))
      throw Error("Owned relative fixture path required");
    mkdirSync(dirname(join(projectRoot, path)), { recursive: true });
    writeFileSync(join(projectRoot, path), content);
  }
  tracePath = join(directory, "trace.jsonl");
  const fixtureEnvironment = {
    ORCHESTRATION_TRACE: tracePath,
    ORCHESTRATION_SESSION_DIR: sessionDirectory,
  };
  events = [];
  const structuredAdapter = createAcpGenericAdapter({
    id: "orchestration-execution-fixture",
    driver: "acp-generic",
    enabled: true,
    displayName: "Orchestration execution fixture",
    config: {
      binary: process.execPath,
      args: [fileURLToPath(new URL("../fixtures/orchestration-agent.mjs", import.meta.url))],
      env: fixtureEnvironment,
      cwd: "project",
      authMode: "none",
      capabilities: { models: ["fixture-model"] },
    },
  });
  const adapter = options.oneShot
    ? {
        ...structuredAdapter,
        subagentExecutionPreference: "one-shot" as const,
        buildSubagentOneShotCommand: () => ({
          command: process.execPath,
          args: [fileURLToPath(new URL("../fixtures/orchestration-oneshot.mjs", import.meta.url))],
          env: { ORCHESTRATION_TRACE: tracePath },
        }),
      }
    : structuredAdapter;
  provider = adapter.kind;
  const probe = await probeAcpCapabilities(
    process.execPath,
    [fileURLToPath(new URL("../fixtures/orchestration-agent.mjs", import.meta.url))],
    projectRoot,
    { processCwd: projectRoot, env: fixtureEnvironment, timeoutMs: 5000 },
  );
  if (!probe?.sessionEstablished || !probe.supportsResume)
    throw new Error("Owned fixture probe must establish a resumable session");
  admission = new HostResourceAdmissionOwner(() => ({
    maxActiveAgentSessions: 4,
    maxActiveTerminalShells: 0,
    maxActiveGenerationHelpers: 0,
    overloadRetryAfterMs: 100,
  }));
  manager = new SubagentRunManager({
    adapters: new Map([[adapter.kind, adapter]]),
    admission,
    ...(options.structuredDisposalTimeoutMs === undefined
      ? {}
      : {
          structuredDisposalTimeoutMs: options.structuredDisposalTimeoutMs,
        }),
    getStatusCapabilities: () => ({
      ...adapter.capabilities,
      supportsResume: probe!.supportsResume === true,
    }),
    host: {
      getParentContext: (id) =>
        id === parent
          ? {
              projectLocation: { kind: "posix", path: projectRoot },
              config: { model: "fixture-model" },
            }
          : undefined,
      appendRuntimeEvent: (_id, event) => events.push(event),
    },
  });
  const roster: SpawnableAgent[] = [
    {
      provider: { value: provider, label: adapter.label },
      models: [{ value: "fixture-model", label: "Fixture", reasoning: { values: [] } }],
      reasoningOptions: [],
      defaultModel: "fixture-model",
      permissions: {
        options: [{ value: "full-access", label: "Full access" }],
        default: "full-access",
      },
      execution: options.oneShot ? "one-shot" : "structured",
    },
  ];
  ingress = new CrossagentMcpIngress({
    runManager: manager,
    getSpawnableAgents: async () => roster,
  });
  await ingress.start();
  auth = ingress.registerThread(parent)!;
  async function dispose() {
    manager.cancelAllForThread(parent);
    ingress.dispose();
    await drained();
    const evidenceDirectory = process.env.ORCHESTRATION_EVIDENCE_DIR;
    if (evidenceDirectory) {
      mkdirSync(evidenceDirectory, { recursive: true });
      const rows = trace();
      const ownedPids = [
        ...new Set(rows.filter((row) => row.event === "started").map((row) => row.pid)),
      ];
      writeFileSync(
        join(evidenceDirectory, `${Date.now()}-${ownedPids[0]}.json`),
        JSON.stringify(
          {
            scope:
              "Owned fixture processes through production ingress/managers; scripted tools, no live LLM or GUI.",
            trace: rows,
            runtimeEventCounts: Object.fromEntries(
              [...new Set(events.map((event) => event.type))].map((type) => [
                type,
                events.filter((event) => event.type === type).length,
              ]),
            ),
            admission: admission.usage(),
            ownedPids: ownedPids.map((pid) => ({ pid, alive: alive(pid) })),
          },
          null,
          2,
        ) + "\n",
      );
    }
    rmSync(directory, { recursive: true, force: true });
  }
  return {
    parent,
    manager,
    admission,
    provider,
    events,
    trace,
    plan,
    call,
    drained,
    rpc,
    until,
    dispose,
    projectRoot,
  };
}
