import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ProjectLocation, RuntimeEvent, ThreadConfig } from "@/shared/contracts";
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

  setListener(listener: StructuredSessionListener): void {
    this.listener = listener;
  }
  async startTurn(prompt: string, config: ThreadConfig): Promise<void> {
    this.startTurns.push({ prompt, config });
  }
  async interruptTurn(): Promise<void> {
    this.interrupted = true;
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
}

interface Harness {
  manager: SubagentRunManager;
  handles: FakeHandle[];
  inputs: CreateStructuredSessionInput[];
  appended: Array<{ threadId: string; event: RuntimeEvent }>;
}

function makeHarness(options?: { models?: Array<{ id: string; label: string }> }): Harness {
  const handles: FakeHandle[] = [];
  const inputs: CreateStructuredSessionInput[] = [];
  const appended: Array<{ threadId: string; event: RuntimeEvent }> = [];

  const adapter = {
    kind: "codex",
    label: "Codex",
    capabilities: {
      models: options?.models ?? [{ id: "gpt-5.5", label: "GPT-5.5" }],
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
      const handle = new FakeHandle();
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
              subagentMcp: true,
              computerUse: true,
              chromeMcp: true,
            },
          }
        : undefined,
    resolveParentMcpAccess: async () => ({
      browserMcp: {
        url: "http://browser/mcp",
        token: "browser-token",
        headers: { Authorization: "Bearer browser-token" },
      },
      computerUseMcp: {
        url: "http://computer/mcp",
        token: "computer-token",
        headers: { Authorization: "Bearer computer-token" },
      },
      chromeMcp: {
        url: "http://chrome/mcp",
        token: "chrome-token",
        headers: { Authorization: "Bearer chrome-token" },
      },
    }),
    appendRuntimeEvent: (threadId, event) => appended.push({ threadId, event }),
  };

  const manager = new SubagentRunManager({
    adapters: new Map([["codex" as never, adapter]]),
    host,
  });
  return { manager, handles, inputs, appended };
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

  it("emits a synthetic sub-agent tool_call tile on spawn", () => {
    const h = makeHarness();
    const { runId } = h.manager.spawn(PARENT, { agent: "codex", prompt: "do work" });
    const started = h.appended.find((a) => a.event.type === "item.started");
    expect(started).toBeDefined();
    const event = started!.event as Extract<RuntimeEvent, { type: "item.started" }>;
    expect(event.threadId).toBe(PARENT);
    expect(event.itemId).toBe(`sub:${runId}`);
    expect(event.itemType).toBe("tool_call");
    expect(event.payload).toMatchObject({
      isSubAgent: true,
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
      .find((e) => e.itemId === `${runId}:abc`);
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
      .find((e) => e.itemId === `${runId}:leaf`);
    expect(started!.parentItemId).toBe(`${runId}:branch`);
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
      isSubAgent: true,
      result: "Hello",
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

  it("enforces the per-parent concurrency cap", () => {
    const h = makeHarness();
    for (let i = 0; i < MAX_CONCURRENT_CHILDREN_PER_PARENT; i++) {
      h.manager.spawn(PARENT, { agent: "codex", prompt: `t${i}` });
    }
    expect(() => h.manager.spawn(PARENT, { agent: "codex", prompt: "overflow" })).toThrow(
      SubagentSpawnError,
    );
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
    expect(childInput.config).not.toHaveProperty("subagentMcp");
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
    expect(childInput).not.toHaveProperty("subagentMcp");
    expect(childInput).toMatchObject({
      browserMcp: { url: "http://browser/mcp" },
      computerUseMcp: { url: "http://computer/mcp" },
      chromeMcp: { url: "http://chrome/mcp" },
    });
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
