import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type {
  AgentCapability,
  ProjectLocation,
  RuntimeEvent,
  ThreadConfig,
} from "@/shared/contracts";
import type {
  AgentAdapter,
  CreateStructuredSessionInput,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "@/supervisor/agents/base";
import {
  MAX_CONCURRENT_CHILDREN_PER_PARENT,
  SubagentRunManager,
  SubagentSpawnError,
} from "./SubagentRunManager";
import { buildUnrestrictedChildConfig, type SubagentRunHost } from "./types";

const PARENT = "parent";
const PROJECT: ProjectLocation = { kind: "posix", path: "/tmp/project" };

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeHandle implements StructuredSessionHandle {
  launchOptions = {};
  listener: StructuredSessionListener | undefined;
  disposed = false;
  interrupted = false;
  startTurns: Array<{ prompt: string; config: ThreadConfig }> = [];
  resolvedRequests: Array<{ requestId: string | number; response: unknown }> = [];

  constructor(private readonly interruptError?: string) {}

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
  }
  async startTurn(prompt: string, config: ThreadConfig): Promise<void> {
    this.startTurns.push({ prompt, config });
  }
  async interruptTurn(): Promise<void> {
    this.interrupted = true;
    if (this.interruptError) this.listener?.onError(this.interruptError);
  }
  async resolveServerRequest(requestId: string | number, response: unknown): Promise<void> {
    this.resolvedRequests.push({ requestId, response });
  }
  async dispose(): Promise<void> {
    this.disposed = true;
  }

  emit(event: RuntimeEvent): void {
    this.listener?.onRuntimeEvent?.(event);
  }
  openRequest(requestId: string): void {
    this.emit({
      type: "request.opened",
      threadId: "child",
      requestId,
      requestType: "tool_call_approval",
      payload: { summary: "May I run this tool?" },
    });
  }
  completeTurn(state: "completed" | "failed" | "interrupted" | "cancelled"): void {
    this.emit({ type: "turn.completed", threadId: "child", turnId: "turn-1", state });
  }
  update(status: "idle" | "working"): void {
    this.listener?.onUpdate({ status, attention: "none" });
  }
}

interface Harness {
  manager: SubagentRunManager;
  handles: FakeHandle[];
  inputs: CreateStructuredSessionInput[];
  appended: Array<{ threadId: string; event: RuntimeEvent }>;
  mcpTargets: string[];
  releaseCreate: () => void;
}

function makeHarness(options?: {
  providerLabel?: string;
  models?: Array<{ id: string; label: string }>;
  subProviders?: Array<{ id: string; label: string }>;
  modelSubProvider?: Record<string, string>;
  statusCapabilities?: AgentCapability | null;
  createFailures?: number;
  deferCreate?: boolean;
  interruptError?: string;
}): Harness {
  const handles: FakeHandle[] = [];
  const inputs: CreateStructuredSessionInput[] = [];
  const appended: Array<{ threadId: string; event: RuntimeEvent }> = [];
  const mcpTargets: string[] = [];
  let createFailures = options?.createFailures ?? 0;
  let releaseCreate!: () => void;
  const createGate = new Promise<void>((resolve) => {
    releaseCreate = resolve;
  });

  const adapter = {
    kind: "codex",
    label: options?.providerLabel ?? "Codex",
    capabilities: {
      models: options?.models ?? [{ id: "gpt-5.5", label: "GPT-5.5" }],
      ...(options?.subProviders ? { subProviders: options.subProviders } : {}),
      ...(options?.modelSubProvider ? { modelSubProvider: options.modelSubProvider } : {}),
      efforts: ["low", "high"],
      fastModels: ["gpt-5.5"],
      approvalPolicies: [
        { id: "on-request", label: "On Request" },
        { id: "never", label: "Full Access" },
      ],
      sandboxModes: [
        { id: "workspace-write", label: "Workspace Write" },
        { id: "danger-full-access", label: "Full Access" },
      ],
      defaultApprovalPolicy: "on-request",
      defaultSandboxMode: "workspace-write",
      bypassPermissions: { approvalPolicy: "never", sandboxMode: "danger-full-access" },
    },
    createStructuredSession: async (input: CreateStructuredSessionInput) => {
      inputs.push(input);
      if (options?.deferCreate) await createGate;
      if (createFailures > 0) {
        createFailures -= 1;
        throw new Error("session launch failed");
      }
      const handle = new FakeHandle(options?.interruptError);
      handles.push(handle);
      return handle;
    },
  } as unknown as AgentAdapter;

  const host: SubagentRunHost = {
    getParentContext: (threadId) =>
      threadId === PARENT
        ? {
            projectLocation: PROJECT,
            config: {
              model: "parent-model",
              approvalPolicy: "never",
              sandboxMode: "workspace-write",
              browserMcp: true,
              crossagentMcp: true,
              computerUse: true,
              chromeMcp: true,
            },
          }
        : undefined,
    resolveParentMcpAccess: async (_threadId, _identity, targetAgentKind) => {
      mcpTargets.push(targetAgentKind);
      return {
        mcpServers: ["browser", "computer_use", "chrome"].map((name) => ({
          id: name,
          name,
          timeoutMs: 30_000,
          transport: {
            type: "http" as const,
            url: `http://${name}/mcp`,
            headers: { Authorization: `Bearer ${name}-token` },
          },
        })),
      };
    },
    appendRuntimeEvent: (threadId, event) => appended.push({ threadId, event }),
  };

  const hasStatusCapabilities = options?.statusCapabilities !== undefined;
  const statusCapabilities = options?.statusCapabilities;
  const manager = new SubagentRunManager({
    adapters: new Map([["codex" as never, adapter]]),
    ...(hasStatusCapabilities ? { getStatusCapabilities: () => statusCapabilities } : {}),
    host,
  });
  return { manager, handles, inputs, appended, mcpTargets, releaseCreate };
}

describe("SubagentRunManager", () => {
  it("uses a provider's declared unrestricted posture", () => {
    expect(
      buildUnrestrictedChildConfig(
        { model: "child" },
        {
          approvalPolicies: [
            { id: "on-request", label: "On Request" },
            { id: "never", label: "Full Access" },
          ],
          sandboxModes: [
            { id: "workspace-write", label: "Workspace Write" },
            { id: "danger-full-access", label: "Full Access" },
          ],
          bypassPermissions: {
            approvalPolicy: "never",
            sandboxMode: "danger-full-access",
          },
        },
      ),
    ).toEqual({
      model: "child",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    });
  });

  it("recognizes the ACP auto-approve convention when no bypass posture is declared", () => {
    expect(
      buildUnrestrictedChildConfig(
        { model: "child" },
        {
          approvalPolicies: [
            { id: "default", label: "Supervised" },
            { id: "never", label: "Auto Approve" },
          ],
          sandboxModes: [],
        },
      ),
    ).toEqual({ model: "child", approvalPolicy: "never" });
  });

  it("emits a synthetic Crossagent tool_call tile on spawn", () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "do work" });
    const started = h.appended.find((a) => a.event.type === "item.started");
    expect(started).toBeDefined();
    const event = started!.event as Extract<RuntimeEvent, { type: "item.started" }>;
    expect(event.threadId).toBe(PARENT);
    expect(event.itemId).toBe(`sub:${runId}`);
    expect(event.itemType).toBe("tool_call");
    expect(event.payload).toMatchObject({
      isCrossagent: true,
      status: "running",
      name: "Codex · GPT-5.5",
    });
  });

  it("includes the selected effort and enabled Fast mode in the sub-agent name", () => {
    const h = makeHarness();
    h.manager.spawn(PARENT, {
      agent: "codex",
      name: "builder",
      prompt: "do work",
      effort: "high",
      fast: true,
    });
    const started = h.appended.find((a) => a.event.type === "item.started");
    const event = started?.event as Extract<RuntimeEvent, { type: "item.started" }> | undefined;
    expect(event?.payload).toMatchObject({
      name: "builder — Codex · GPT-5.5 · High · Fast",
    });
  });

  it("includes the selected model's sub-provider in the sub-agent name", () => {
    const h = makeHarness({
      providerLabel: "OpenCode",
      models: [{ id: "opencode-go/qwen3.8-max", label: "Qwen3.8 Max" }],
      subProviders: [{ id: "opencode-go", label: "OpenCode Go" }],
    });
    h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "do work",
      model: "opencode-go/qwen3.8-max",
      effort: "high",
    });
    const started = h.appended.find((a) => a.event.type === "item.started");
    const event = started?.event as Extract<RuntimeEvent, { type: "item.started" }> | undefined;
    expect(event?.payload).toMatchObject({
      name: "OpenCode · OpenCode Go · Qwen3.8 Max · High",
    });
  });

  it("re-tags child events: parentItemId → tile, itemIds prefixed with runId", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({
      type: "item.started",
      threadId: "child",
      itemId: "abc",
      itemType: "assistant_message",
    });
    const started = h.appended
      .map((a) => a.event)
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "item.started" }> => e.type === "item.started",
      )
      .find((e) => e.itemId === `${runId}:1:abc`);
    expect(started).toBeDefined();
    expect(started!.threadId).toBe(PARENT);
    expect(started!.parentItemId).toBe(`sub:${runId}`);
  });

  it("updates collapsed step progress while child events are buffered", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({
      type: "item.started",
      threadId: "child",
      itemId: "step-1",
      itemType: "assistant_message",
    });
    h.handles[0]!.emit({
      type: "item.started",
      threadId: "child",
      itemId: "nested",
      itemType: "tool_call",
      parentItemId: "step-1",
      payload: { name: "Read", status: "running" },
    });
    h.handles[0]!.emit({
      type: "item.started",
      threadId: "child",
      itemId: "step-2",
      itemType: "tool_call",
      payload: { name: "Edit", status: "running" },
    });

    const updates = h.appended
      .map((entry) => entry.event)
      .filter(
        (event): event is Extract<RuntimeEvent, { type: "item.updated" }> =>
          event.type === "item.updated" && event.itemId === `sub:${runId}`,
      );
    expect(updates.map((event) => event.payload)).toEqual([
      { progress: { stepCount: 1 } },
      { progress: { stepCount: 2 } },
    ]);
  });

  it("nests a child item under its own prefixed parent when it already has one", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.emit({
      type: "item.started",
      threadId: "child",
      itemId: "leaf",
      itemType: "assistant_message",
      parentItemId: "branch",
    });
    const started = h.appended
      .map((a) => a.event)
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "item.started" }> => e.type === "item.started",
      )
      .find((e) => e.itemId === `${runId}:1:leaf`);
    expect(started!.parentItemId).toBe(`${runId}:1:branch`);
  });

  it("captures assistant text from content.delta and settles completed", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    const handle = h.handles[0]!;
    handle.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "m",
      stream: "assistant_text",
      delta: "Hel",
    });
    handle.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "m",
      stream: "assistant_text",
      delta: "lo",
    });
    handle.completeTurn("completed");

    const result = await h.manager.waitFor(runId, 1000);
    expect(result).toEqual({ status: "completed", output: "Hello" });

    const completion = h.appended
      .map((a) => a.event)
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "item.completed" }> => e.type === "item.completed",
      )
      .find((e) => e.itemId === `sub:${runId}`);
    expect(completion).toBeDefined();
    expect(completion!.payload).toMatchObject({
      status: "success",
      isCrossagent: true,
      result: "Hello",
    });
  });

  it("settles on an idle update after the child turn starts", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();

    h.handles[0]!.update("idle");

    await expect(h.manager.waitFor(runId, 1000)).resolves.toEqual({
      status: "completed",
      output: "",
    });
  });

  it("does NOT forward child turn.completed onto the parent stream", async () => {
    const h = makeHarness();
    h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.completeTurn("completed");
    const forwardedTurn = h.appended.find((a) => a.event.type === "turn.completed");
    expect(forwardedTurn).toBeUndefined();
  });

  it("terminalizes provider-native delegated items left running when the child settles", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    const handle = h.handles[0]!;

    for (const itemId of ["explore-github", "explore-git", "explore-misc"]) {
      handle.emit({
        type: "item.started",
        threadId: "child",
        itemId,
        itemType: "tool_call",
        payload: {
          name: `Agent (explore): ${itemId}`,
          status: "running",
          isSubAgent: true,
        },
      });
    }
    handle.emit({
      type: "item.started",
      threadId: "child",
      itemId: "nested-command",
      itemType: "command_execution",
      parentItemId: "explore-github",
      payload: { command: "gh pr list", status: "running" },
    });
    handle.completeTurn("completed");
    await h.manager.waitFor(runId, 1000);

    const completed = h.appended
      .map((entry) => entry.event)
      .filter(
        (event): event is Extract<RuntimeEvent, { type: "item.completed" }> =>
          event.type === "item.completed",
      );
    const outerIndex = completed.findIndex((event) => event.itemId === `sub:${runId}`);
    expect(outerIndex).toBeGreaterThanOrEqual(0);
    const nestedIndex = completed.findIndex(
      (event) => event.itemId === `${runId}:1:nested-command`,
    );
    const nestedParentIndex = completed.findIndex(
      (event) => event.itemId === `${runId}:1:explore-github`,
    );
    expect(nestedIndex).toBeGreaterThanOrEqual(0);
    expect(nestedIndex).toBeLessThan(nestedParentIndex);

    for (const itemId of ["explore-github", "explore-git", "explore-misc"]) {
      const childIndex = completed.findIndex((event) => event.itemId === `${runId}:1:${itemId}`);
      expect(childIndex).toBeGreaterThanOrEqual(0);
      expect(childIndex).toBeLessThan(outerIndex);
      expect(completed[childIndex]!.payload).toMatchObject({
        status: "error",
        isSubAgent: true,
      });
    }
  });

  it("run_agent-style wait returns running on timeout", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    const result = await h.manager.waitFor(runId, 5);
    expect(result.status).toBe("running");
  });

  it("cancel interrupts and disposes the child, settling cancelled", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    await h.manager.cancel(runId);
    expect(h.handles[0]!.interrupted).toBe(true);
    expect(h.handles[0]!.disposed).toBe(true);
    expect(h.manager.getStatus(runId).status).toBe("cancelled");
  });

  it("keeps explicit cancellation terminal when provider teardown reports Aborted", async () => {
    const h = makeHarness({ interruptError: "Aborted" });
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();

    await h.manager.cancel(runId);

    expect(h.manager.getStatus(runId)).toMatchObject({ status: "cancelled", output: "" });
    const completion = h.appended
      .map(({ event }) => event)
      .find(
        (event): event is Extract<RuntimeEvent, { type: "item.completed" }> =>
          event.type === "item.completed" && event.itemId === `sub:${runId}`,
      );
    expect(completion?.payload).toMatchObject({
      status: "error",
      crossagentStatus: "cancelled",
    });
    expect(completion?.payload).not.toHaveProperty("result");
  });

  it("cancelAllForThread cancels live children and evicts records", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.manager.cancelAllForThread(PARENT);
    await flush();
    expect(h.handles[0]!.disposed).toBe(true);
    // Record evicted → unknown run_id.
    expect(h.manager.getStatus(runId).output).toContain("Unknown run_id");
  });

  it("disposes a structured handle that finishes creating after cancellation", async () => {
    const h = makeHarness({ deferCreate: true });
    h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.manager.cancelAllForThread(PARENT);
    h.releaseCreate();
    await flush();
    await flush();
    expect(h.handles[0]?.disposed).toBe(true);
    expect(h.handles[0]?.startTurns).toEqual([]);
  });

  it("enforces the per-parent concurrency cap", () => {
    const h = makeHarness();
    for (let i = 0; i < MAX_CONCURRENT_CHILDREN_PER_PARENT; i++) {
      h.manager.spawn(PARENT, { agent: "codex", prompt: `t${i}` });
    }
    expect(() => h.manager.spawn(PARENT, { agent: "codex", prompt: "overflow" })).toThrow(
      SubagentSpawnError,
    );
  });

  it("atomically starts a validated batch in parallel", async () => {
    const h = makeHarness({
      models: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.6", label: "GPT-5.6" },
      ],
    });
    const runs = h.manager.spawnMany(PARENT, [
      { agent: "codex", model: "gpt-5.5", prompt: "one" },
      { agent: "codex", model: "gpt-5.6", prompt: "two" },
    ]);
    expect(runs).toHaveLength(2);
    await flush();
    expect(h.inputs.map((input) => input.config.model)).toEqual(["gpt-5.5", "gpt-5.6"]);
    expect(h.handles).toHaveLength(2);
  });

  it("does not partially start a batch when one task is invalid", () => {
    const h = makeHarness();
    expect(() =>
      h.manager.spawnMany(PARENT, [
        { agent: "codex", prompt: "valid" },
        { agent: "codex", model: "hidden-or-unknown", prompt: "invalid" },
      ]),
    ).toThrow(SubagentSpawnError);
    expect(h.appended).toEqual([]);
    expect(h.inputs).toEqual([]);
  });

  it("rejects a direct spawn when the provider is disabled in settings", () => {
    const h = makeHarness({ statusCapabilities: null });
    expect(() => h.manager.spawn(PARENT, { agent: "codex", prompt: "go" })).toThrow(
      /disabled in settings/,
    );
  });

  it("rejects a direct spawn of a model hidden from the filtered capability surface", () => {
    const h = makeHarness({
      statusCapabilities: {
        models: [{ id: "gpt-5.6", label: "GPT-5.6" }],
        efforts: [],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: false,
        supportsDirectInput: true,
      } as unknown as AgentCapability,
    });
    expect(() =>
      h.manager.spawn(PARENT, {
        agent: "codex",
        model: "gpt-5.5",
        prompt: "go",
      }),
    ).toThrow(/Unknown model/);
  });

  it("retries a startup failure with an explicitly selected fallback", async () => {
    const h = makeHarness({
      models: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.6", label: "GPT-5.6" },
      ],
      createFailures: 1,
    });
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      model: "gpt-5.5",
      prompt: "go",
      fallbacks: [{ agent: "codex", model: "gpt-5.6" }],
    });
    await flush();
    await flush();
    expect(h.inputs.map((input) => input.config.model)).toEqual(["gpt-5.5", "gpt-5.6"]);

    h.handles[0]!.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "answer",
      stream: "assistant_text",
      delta: "recovered",
    });
    h.handles[0]!.completeTurn("completed");
    const result = await h.manager.waitFor(runId, 1000);
    expect(result).toMatchObject({
      status: "completed",
      output: "recovered",
      attempts: [
        {
          attempt: 1,
          provider: "codex",
          model: "gpt-5.5",
          status: "failed",
          error: "session launch failed",
          output: "",
        },
        {
          attempt: 2,
          provider: "codex",
          model: "gpt-5.6",
          status: "completed",
          output: "recovered",
        },
      ],
    });
  });

  it("does not retry a dispatched turn failure unless explicitly allowed", async () => {
    const h = makeHarness({
      models: [
        { id: "gpt-5.5", label: "GPT-5.5" },
        { id: "gpt-5.6", label: "GPT-5.6" },
      ],
    });
    const { runId } = h.manager.spawn(PARENT, {
      agent: "codex",
      model: "gpt-5.5",
      prompt: "go",
      fallbacks: [{ agent: "codex", model: "gpt-5.6" }],
    });
    await flush();
    h.handles[0]!.completeTurn("failed");
    const result = await h.manager.waitFor(runId, 1000);
    expect(result.status).toBe("failed");
    expect(result.error).toEqual({
      message: "Subagent turn failed",
      may_have_side_effects: true,
    });
    expect(h.inputs).toHaveLength(1);
  });

  it("keeps background runs alive across foreground cancellation", async () => {
    const h = makeHarness();
    const foreground = h.manager.spawn(PARENT, { agent: "codex", prompt: "foreground" });
    const background = h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "background",
      background: true,
    });
    await flush();

    h.manager.cancelForegroundForThread(PARENT);
    await flush();
    expect(h.manager.getStatus(foreground.runId).status).toBe("cancelled");
    expect(h.manager.getStatus(background.runId).status).toBe("running");
    expect(h.manager.listRuns(PARENT)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ run_id: background.runId, background: true, status: "running" }),
      ]),
    );
  });

  it("keeps a background result available for an explicit wait without injecting a message", async () => {
    const h = makeHarness();
    const background = h.manager.spawn(PARENT, {
      agent: "codex",
      name: "research",
      prompt: "background",
      background: true,
    });
    await flush();

    h.handles[0]!.emit({
      type: "content.delta",
      threadId: "child",
      itemId: "answer",
      stream: "assistant_text",
      delta: "background result",
    });
    h.handles[0]!.completeTurn("completed");

    await expect(h.manager.waitFor(background.runId, 1000, PARENT)).resolves.toEqual({
      status: "completed",
      output: "background result",
    });
    expect(
      h.appended.some(
        ({ event }) => event.type === "item.started" && event.itemType === "user_message",
      ),
    ).toBe(false);
  });

  it("scopes status and cancellation to the owning parent thread", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    expect(h.manager.getStatus(runId, "other-parent").output).toContain("Unknown run_id");
    await h.manager.cancel(runId, "other-parent");
    expect(h.manager.getStatus(runId, PARENT).status).toBe("running");
  });

  it("treats an unexpected structured-session close as a failure", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.listener?.onClose();
    await expect(h.manager.waitFor(runId, 1000)).resolves.toMatchObject({
      status: "failed",
      error: { message: "Subagent session closed before the turn completed" },
    });
  });

  it("uses unrestricted permissions and inherits non-recursive MCPs", async () => {
    const h = makeHarness();
    h.manager.spawn(PARENT, {
      agent: "codex",
      prompt: "go",
      effort: "high",
      fast: true,
    });
    await flush();
    const childInput = h.inputs[0]!;
    expect(childInput.config).not.toHaveProperty("crossagentMcp");
    expect(childInput.config).toMatchObject({
      browserMcp: true,
      computerUse: true,
      chromeMcp: true,
    });
    expect(childInput.config.model).toBe("gpt-5.5");
    expect(childInput.config.effort).toBe("high");
    expect(childInput.config.fast).toBe(true);
    expect(childInput.config.approvalPolicy).toBe("never");
    expect(childInput.config.sandboxMode).toBe("danger-full-access");
    expect(childInput.presentationMode).toBe("gui");
    expect(h.mcpTargets).toEqual(["codex"]);
    expect(childInput).not.toHaveProperty("crossagentMcp");
    expect(childInput.mcpServers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "browser" }),
        expect.objectContaining({ name: "computer_use" }),
        expect.objectContaining({ name: "chrome" }),
      ]),
    );
  });

  it("rejects selections that are not advertised by the structured composer surface", () => {
    const h = makeHarness();
    expect(() =>
      h.manager.spawn(PARENT, {
        agent: "codex",
        model: "gpt-5.5",
        effort: "extreme",
        prompt: "go",
      }),
    ).toThrow("Unsupported reasoning for gpt-5.5: extreme");
    expect(() =>
      h.manager.spawn(PARENT, {
        agent: "codex",
        model: "unknown",
        prompt: "go",
      }),
    ).toThrow("Unknown model: unknown");
  });

  it("validates against status-pipeline capabilities, not the adapter's in-memory ones", async () => {
    // Live adapter has no models yet (probe not finished / failed this
    // session), but the status cache — the source the roster advertised from —
    // does. The spawn must accept exactly what the roster offered.
    const h = makeHarness({
      models: [],
      statusCapabilities: {
        models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
        efforts: ["low", "high"],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [{ id: "never", label: "Full Access" }],
        sandboxModes: [],
        supportsResume: false,
        supportsDirectInput: true,
        bypassPermissions: { approvalPolicy: "never" },
      } as unknown as AgentCapability,
    });
    h.manager.spawn(PARENT, { agent: "codex", model: "gpt-5.5", effort: "high", prompt: "go" });
    await flush();
    expect(h.inputs[0]!.config.model).toBe("gpt-5.5");
    expect(h.inputs[0]!.config.approvalPolicy).toBe("never");
    // A model outside the status capabilities is still rejected.
    expect(() => h.manager.spawn(PARENT, { agent: "codex", model: "nope", prompt: "go" })).toThrow(
      "Unknown model: nope",
    );
  });

  it("drives a CLI-only agent as a one-shot child, streaming stdout into the tile", async () => {
    // A one-shot adapter: no structured session, just a bypass-permissions CLI
    // that echoes and exits 0.
    const appended: Array<{ threadId: string; event: RuntimeEvent }> = [];
    const adapter = {
      kind: "commandcode",
      label: "Command Code",
      capabilities: {
        models: [{ id: "cc-1", label: "CC One" }],
        efforts: [],
        approvalPolicies: [],
        sandboxModes: [],
        bypassPermissions: { approvalPolicy: "yolo" },
      },
      buildSubagentOneShotCommand: () => ({
        command: process.execPath,
        args: ["-e", "process.stdout.write('done work')"],
        stdin: "",
      }),
    } as unknown as AgentAdapter;
    // Real spawn path → use an existing cwd (buildPosixCommand sets cwd).
    const realProject: ProjectLocation =
      process.platform === "win32"
        ? { kind: "windows", path: tmpdir() }
        : { kind: "posix", path: tmpdir() };
    const host: SubagentRunHost = {
      getParentContext: (threadId) =>
        threadId === PARENT ? { projectLocation: realProject, config: { model: "p" } } : undefined,
      appendRuntimeEvent: (threadId, event) => appended.push({ threadId, event }),
    };
    const manager = new SubagentRunManager({
      adapters: new Map([["commandcode" as never, adapter]]),
      host,
    });

    const { runId } = manager.spawn(PARENT, { agent: "commandcode", prompt: "go" });
    const result = await manager.waitFor(runId, 5000);
    expect(result).toEqual({ status: "completed", output: "done work" });

    // The streamed text opened an assistant_message nested under the tile.
    const started = appended
      .map((a) => a.event)
      .find(
        (e): e is Extract<RuntimeEvent, { type: "item.started" }> =>
          e.type === "item.started" && e.itemType === "assistant_message",
      );
    expect(started?.parentItemId).toBe(`sub:${runId}`);

    // The synthetic tile completed with the accumulated output as its result.
    const tileDone = appended
      .map((a) => a.event)
      .find(
        (e): e is Extract<RuntimeEvent, { type: "item.completed" }> =>
          e.type === "item.completed" && e.itemId === `sub:${runId}`,
      );
    expect(tileDone?.payload).toMatchObject({ status: "success", result: "done work" });
  });

  it("throws for unknown agents and missing prompts", () => {
    const h = makeHarness();
    expect(() => h.manager.spawn(PARENT, { agent: "nope", prompt: "x" })).toThrow(
      SubagentSpawnError,
    );
    expect(() => h.manager.spawn(PARENT, { agent: "codex", prompt: "  " })).toThrow(
      SubagentSpawnError,
    );
  });

  it("falls back to the adapter default model when none is given", async () => {
    const h = makeHarness();
    h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    expect(h.inputs[0]!.config.model).toBe("gpt-5.5");
  });

  it("forwards a child request.opened, namespacing the requestId under the run", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("perm-1");

    const opened = h.appended
      .map((a) => a.event)
      .find(
        (e): e is Extract<RuntimeEvent, { type: "request.opened" }> => e.type === "request.opened",
      );
    expect(opened).toBeDefined();
    expect(opened!.threadId).toBe(PARENT);
    expect(opened!.requestId).toBe(`${runId}::perm-1`);
    expect(opened!.requestType).toBe("tool_call_approval");
  });

  it("routes a namespaced resolution back to the child handle and strips the prefix", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("perm-1");

    const handled = h.manager.resolveChildServerRequest(`${runId}::perm-1`, { optionId: "allow" });
    expect(handled).toBe(true);
    expect(h.handles[0]!.resolvedRequests).toEqual([
      { requestId: "perm-1", response: { optionId: "allow" } },
    ]);
  });

  it("round-trips a request id that itself contains the delimiter", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("weird::id");

    const handled = h.manager.resolveChildServerRequest(`${runId}::weird::id`, { optionId: "ok" });
    expect(handled).toBe(true);
    expect(h.handles[0]!.resolvedRequests[0]!.requestId).toBe("weird::id");
  });

  it("returns false for non-subagent request ids (unknown run / no delimiter / number)", () => {
    const h = makeHarness();
    expect(h.manager.resolveChildServerRequest("plain-request-id", {})).toBe(false);
    expect(h.manager.resolveChildServerRequest("deadbeef::perm", {})).toBe(false);
    expect(h.manager.resolveChildServerRequest(42, {})).toBe(false);
  });

  it("emits a synthetic request.resolved for an unresolved forwarded request on settle", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("perm-1");
    h.handles[0]!.completeTurn("completed");
    await h.manager.waitFor(runId, 1000);

    const resolved = h.appended
      .map((a) => a.event)
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "request.resolved" }> =>
          e.type === "request.resolved",
      )
      .find((e) => e.requestId === `${runId}::perm-1`);
    expect(resolved).toBeDefined();
    expect(resolved!.threadId).toBe(PARENT);
    expect(resolved!.outcome).toBe("cancelled");
  });

  it("clears a forwarded request on cancel and drops its resolution afterward", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("perm-1");
    await h.manager.cancel(runId);

    const resolved = h.appended
      .map((a) => a.event)
      .find(
        (e): e is Extract<RuntimeEvent, { type: "request.resolved" }> =>
          e.type === "request.resolved" && e.requestId === `${runId}::perm-1`,
      );
    expect(resolved).toBeDefined();
    // The run record still exists, so the id is recognized, but its pending set
    // was cleared on settle — the resolve is a no-op on the (already torn-down) handle.
    expect(h.manager.resolveChildServerRequest(`${runId}::perm-1`, {})).toBe(true);
    expect(h.handles[0]!.resolvedRequests).toEqual([]);
  });

  it("does not re-forward a child request.resolved after it was already resolved", async () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "go" });
    await flush();
    h.handles[0]!.openRequest("perm-1");
    h.handles[0]!.emit({
      type: "request.resolved",
      threadId: "child",
      requestId: "perm-1",
      outcome: "accepted",
    });

    const resolvedEvents = h.appended
      .map((a) => a.event)
      .filter(
        (e): e is Extract<RuntimeEvent, { type: "request.resolved" }> =>
          e.type === "request.resolved" && e.requestId === `${runId}::perm-1`,
      );
    expect(resolvedEvents).toHaveLength(1);
    expect(resolvedEvents[0]!.outcome).toBe("accepted");
  });
});
