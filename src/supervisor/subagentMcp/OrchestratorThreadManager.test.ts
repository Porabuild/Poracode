import { describe, expect, it } from "vitest";
import type { ProjectLocation, SendThreadInputPayload, ThreadConfig } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc/events";
import type { AgentAdapter, ThreadHistory } from "@/supervisor/agents/base";
import {
  MAX_CONCURRENT_CHILD_THREADS_PER_PARENT,
  OrchestratorThreadError,
  OrchestratorThreadManager,
} from "./OrchestratorThreadManager";
import type { OrchestratorThreadState } from "./OrchestratorThreadManager";

const PARENT = "parent-thread";
const PROJECT: ProjectLocation = { kind: "posix", path: "/tmp/project" };

type CreatedEvent = Extract<SupervisorEvent, { type: "orchestrator-thread-created" }>;

interface Harness {
  manager: OrchestratorThreadManager;
  emitted: SupervisorEvent[];
  states: Map<string, OrchestratorThreadState>;
  sent: SendThreadInputPayload[];
  interrupted: string[];
  closed: string[];
  worktrees: Array<{ location: ProjectLocation; branch: string; baseBranch?: string }>;
  removedWorktrees: Array<{ location: ProjectLocation; path: string }>;
  setHistory(history: ThreadHistory | undefined): void;
  lastCreated(): CreatedEvent;
}

function makeState(overrides: Partial<OrchestratorThreadState> = {}): OrchestratorThreadState {
  return {
    status: "launching",
    attention: "none",
    config: { model: "gpt-5.5" },
    supportsSteer: false,
    ...overrides,
  };
}

function makeHarness(options?: {
  /** Simulate main launching the child as soon as the create event is emitted. */
  autoLaunch?: boolean;
  parentConfig?: ThreadConfig;
  launchTimeoutMs?: number;
  /** Simulate the create handoff (emit → main) hard-failing after the worktree exists. */
  failEmit?: boolean;
  /** Simulate git failing to create the worktree (e.g. branch collision). */
  createWorktreeError?: Error;
}): Harness {
  const emitted: SupervisorEvent[] = [];
  const states = new Map<string, OrchestratorThreadState>();
  const sent: SendThreadInputPayload[] = [];
  const interrupted: string[] = [];
  const closed: string[] = [];
  const worktrees: Array<{ location: ProjectLocation; branch: string; baseBranch?: string }> = [];
  const removedWorktrees: Array<{ location: ProjectLocation; path: string }> = [];
  let history: ThreadHistory | undefined;

  const structured = {
    kind: "codex",
    label: "Codex",
    capabilities: {
      models: [{ id: "gpt-5.5", label: "GPT-5.5" }],
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
    createStructuredSession: async () => ({}),
  } as unknown as AgentAdapter;
  const oneShot = {
    kind: "commandcode",
    label: "Command Code",
    capabilities: {
      models: [{ id: "cc-1", label: "CC One" }],
      efforts: [],
      approvalPolicies: [],
      sandboxModes: [],
      bypassPermissions: { approvalPolicy: "yolo" },
    },
    buildSubagentOneShotCommand: () => ({ command: "x", args: [] }),
  } as unknown as AgentAdapter;

  const parentConfig: ThreadConfig = options?.parentConfig ?? {
    model: "parent-model",
    approvalPolicy: "never",
    sandboxMode: "workspace-write",
    subagentMcp: true,
    browserMcp: true,
    computerUse: true,
    chromeMcp: true,
  };

  const manager = new OrchestratorThreadManager({
    adapters: new Map([
      ["codex" as never, structured],
      ["commandcode" as never, oneShot],
    ]),
    ...(options?.launchTimeoutMs !== undefined ? { launchTimeoutMs: options.launchTimeoutMs } : {}),
    emit: (event) => {
      emitted.push(event);
      if (event.type === "orchestrator-thread-created" && options?.failEmit) {
        throw new Error("main bridge unavailable");
      }
      if (options?.autoLaunch !== false && event.type === "orchestrator-thread-created") {
        // Simulate main's round-trip: the session appears in the TSM.
        states.set(event.thread.id, makeState());
      }
    },
    host: {
      getParentContext: (threadId) =>
        threadId === PARENT
          ? {
              projectLocation: PROJECT,
              config: parentConfig,
              mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
            }
          : undefined,
      getThreadState: (threadId) => states.get(threadId),
      readThreadHistory: async () => history,
      sendThreadInput: async (payload) => {
        sent.push(payload);
      },
      interruptThread: async (threadId) => {
        interrupted.push(threadId);
      },
      closeThread: async (threadId) => {
        // Mirror the real host: closing removes the session from the TSM map,
        // which is what frees the child's cap slot (getThreadState → undefined).
        closed.push(threadId);
        states.delete(threadId);
      },
    },
    createWorktree: async ({ location, branch, baseBranch }) => {
      if (options?.createWorktreeError) throw options.createWorktreeError;
      worktrees.push({ location, branch, ...(baseBranch ? { baseBranch } : {}) });
      return { path: `/tmp/worktrees/${branch}` };
    },
    removeWorktree: async ({ location, path }) => {
      removedWorktrees.push({ location, path });
    },
  });

  return {
    manager,
    emitted,
    states,
    sent,
    interrupted,
    closed,
    worktrees,
    removedWorktrees,
    setHistory: (next) => {
      history = next;
    },
    lastCreated: () => {
      const event = [...emitted]
        .reverse()
        .find((entry): entry is CreatedEvent => entry.type === "orchestrator-thread-created");
      if (!event) throw new Error("no orchestrator-thread-created event emitted");
      return event;
    },
  };
}

async function createChild(
  h: Harness,
  request: Partial<Parameters<OrchestratorThreadManager["createThread"]>[1]> = {},
): Promise<string> {
  const { threadId } = await h.manager.createThread(PARENT, {
    agent: "codex",
    prompt: "do the ticket",
    ...request,
  });
  return threadId;
}

describe("OrchestratorThreadManager.createThread", () => {
  it("emits a complete thread row + start payload and resolves once the session appears", async () => {
    const h = makeHarness();
    const result = await h.manager.createThread(PARENT, { agent: "codex", prompt: "fix bug #1" });

    const event = h.lastCreated();
    expect(event.parentThreadId).toBe(PARENT);
    expect(event.thread.id).toBe(result.threadId);
    expect(event.thread.title).toBe("fix bug #1");
    expect(event.thread.agentKind).toBe("codex");
    expect(event.thread.status).toBe("launching");
    expect(event.thread.presentationMode).toBe("gui");
    expect(event.thread.parentThreadId).toBe(PARENT);
    expect(event.start.threadId).toBe(result.threadId);
    expect(event.start.prompt).toBe("fix bug #1");
    expect(event.start.presentationMode).toBe("gui");
    expect(event.start.projectLocation).toEqual(PROJECT);
    expect(result.title).toBe("fix bug #1");
    expect(result.worktreePath).toBeUndefined();
  });

  it("uses the target unrestricted posture with only non-recursive MCPs", async () => {
    const h = makeHarness();
    await createChild(h, { effort: "high", fast: true });
    const { start, thread } = h.lastCreated();
    for (const config of [start.config, thread.config]) {
      expect(config).not.toHaveProperty("subagentMcp");
      expect(config).toMatchObject({
        browserMcp: true,
        computerUse: true,
        chromeMcp: true,
      });
      expect(config.model).toBe("gpt-5.5");
      expect(config.effort).toBe("high");
      expect(config.fast).toBe(true);
      expect(config.approvalPolicy).toBe("never");
      expect(config.sandboxMode).toBe("danger-full-access");
    }
  });

  it("creates a worktree with a generated lightcode/ branch and launches inside it", async () => {
    const h = makeHarness();
    const result = await createChild(h, { worktree: true });
    expect(h.worktrees).toHaveLength(1);
    const branch = h.worktrees[0]!.branch;
    expect(branch).toMatch(/^lightcode\/[a-z]+-[a-z]+-[0-9a-f]{8}$/);
    const event = h.lastCreated();
    expect(event.isNewWorktree).toBe(true);
    expect(event.thread.worktreePath).toBe(`/tmp/worktrees/${branch}`);
    expect(event.thread.worktreeBranch).toBe(branch);
    expect(event.start.projectLocation).toEqual({
      kind: "posix",
      path: `/tmp/worktrees/${branch}`,
    });
    expect(result).toBeDefined();
  });

  it("uses the custom branch + base_branch when given (branch implies worktree)", async () => {
    const h = makeHarness();
    await createChild(h, { branch: "feature/PROJ-42", baseBranch: "develop" });
    expect(h.worktrees).toEqual([
      { location: PROJECT, branch: "feature/PROJ-42", baseBranch: "develop" },
    ]);
  });

  it("rejects unknown agents, one-shot-only agents, and empty prompts", async () => {
    const h = makeHarness();
    await expect(h.manager.createThread(PARENT, { agent: "nope", prompt: "x" })).rejects.toThrow(
      OrchestratorThreadError,
    );
    await expect(
      h.manager.createThread(PARENT, { agent: "commandcode", prompt: "x" }),
    ).rejects.toThrow(/one-shot/);
    await expect(h.manager.createThread(PARENT, { agent: "codex", prompt: "  " })).rejects.toThrow(
      OrchestratorThreadError,
    );
  });

  it("rejects when the parent thread is gone", async () => {
    const h = makeHarness();
    await expect(
      h.manager.createThread("other-parent", { agent: "codex", prompt: "x" }),
    ).rejects.toThrow(/no longer active/);
  });

  it("enforces the live-children cap, and close_thread frees a slot", async () => {
    const h = makeHarness();
    const ids: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_CHILD_THREADS_PER_PARENT; i++) {
      ids.push(await createChild(h));
    }
    await expect(createChild(h)).rejects.toThrow(/live child thread/);
    // close_thread tears down a child's session, which frees its slot.
    await h.manager.closeThread(PARENT, ids[0]!);
    expect(h.closed).toEqual([ids[0]]);
    await expect(createChild(h)).resolves.toBeDefined();
  });

  it("resolves when the session appears only after a thread-state wake", async () => {
    const h = makeHarness({ autoLaunch: false });
    const pending = h.manager.createThread(PARENT, { agent: "codex", prompt: "x" });
    const event = h.lastCreated();
    // First wake without a live session: the create must keep pending.
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: event.thread.id,
      status: "launching",
      attention: "none",
      canResumeWithConfig: false,
    });
    h.states.set(event.thread.id, makeState());
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: event.thread.id,
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    await expect(pending).resolves.toBeDefined();
  });

  it("keeps the child + its worktree when launch is not yet confirmed (may still be starting)", async () => {
    const h = makeHarness({ autoLaunch: false, launchTimeoutMs: 25 });
    await expect(
      h.manager.createThread(PARENT, { agent: "codex", prompt: "x", worktree: true }),
    ).rejects.toThrow(/has not confirmed launch/);
    // The record is KEPT so list_threads can surface it if it appears late, and
    // the worktree is preserved — the caller must not recreate it blindly.
    expect(h.manager.listThreads(PARENT)).toHaveLength(1);
    expect(h.removedWorktrees).toEqual([]);
  });

  it("rolls back the worktree and forgets the child when the create handoff hard-fails", async () => {
    const h = makeHarness({ failEmit: true });
    await expect(
      h.manager.createThread(PARENT, { agent: "codex", prompt: "x", worktree: true }),
    ).rejects.toThrow(/main bridge unavailable/);
    // A hard pre-session failure removes the worktree WE created and forgets the child.
    expect(h.manager.listThreads(PARENT)).toEqual([]);
    expect(h.removedWorktrees).toHaveLength(1);
  });

  it("turns a branch collision into actionable guidance and creates no child", async () => {
    const h = makeHarness({
      createWorktreeError: new Error("fatal: a branch named 'PROJ-1' already exists"),
    });
    await expect(
      h.manager.createThread(PARENT, { agent: "codex", prompt: "x", branch: "PROJ-1" }),
    ).rejects.toThrow(/already exists|different `branch`/);
    expect(h.manager.listThreads(PARENT)).toEqual([]);
  });
});

describe("OrchestratorThreadManager registry scoping", () => {
  it("scopes list_threads to the parent's own children", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    expect(h.manager.listThreads(PARENT).map((t) => t.threadId)).toEqual([childId]);
    expect(h.manager.listThreads("other-parent")).toEqual([]);
  });

  it("rejects access to another parent's child across all tools", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    expect(() => h.manager.getThread("intruder", childId)).toThrow(/Unknown thread_id/);
    await expect(h.manager.readThread("intruder", childId, 20)).rejects.toThrow(
      /Unknown thread_id/,
    );
    await expect(h.manager.sendToThread("intruder", childId, "hi", false)).rejects.toThrow(
      /Unknown thread_id/,
    );
    await expect(h.manager.waitForThreads("intruder", [childId], 10)).rejects.toThrow(
      /Unknown thread_id/,
    );
    await expect(h.manager.interruptThread("intruder", childId)).rejects.toThrow(
      /Unknown thread_id/,
    );
  });

  it("reports live status and worktree metadata in summaries", async () => {
    const h = makeHarness();
    const childId = await createChild(h, { branch: "feature/x" });
    h.states.set(childId, makeState({ status: "working", attention: "working" }));
    const [summary] = h.manager.listThreads(PARENT);
    expect(summary).toMatchObject({
      threadId: childId,
      agent: "codex",
      status: "working",
      attention: "working",
      branch: "feature/x",
      worktreePath: "/tmp/worktrees/feature/x",
    });
  });

  it("reports inactive once the session is gone", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.delete(childId);
    expect(h.manager.getThread(PARENT, childId).status).toBe("inactive");
  });
});

describe("OrchestratorThreadManager.waitForThreads", () => {
  it("returns immediately when a thread is already settled", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "idle" }));
    const result = await h.manager.waitForThreads(PARENT, [childId], 60_000);
    expect(result).toEqual({
      statuses: { [childId]: { status: "idle", attention: "none" } },
      settled: [childId],
      timedOut: false,
    });
  });

  it("times out while all listed threads stay busy", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "working" }));
    const result = await h.manager.waitForThreads(PARENT, [childId], 30);
    expect(result.timedOut).toBe(true);
    expect(result.settled).toEqual([]);
    expect(result.statuses[childId]!.status).toBe("working");
  });

  it("wakes when ANY listed thread settles via a thread-state event", async () => {
    const h = makeHarness();
    const a = await createChild(h);
    const b = await createChild(h);
    h.states.set(a, makeState({ status: "working" }));
    h.states.set(b, makeState({ status: "working" }));

    const pending = h.manager.waitForThreads(PARENT, [a, b], 10_000);
    h.states.set(b, makeState({ status: "needs_approval", attention: "needs_approval" }));
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: b,
      status: "needs_approval",
      attention: "needs_approval",
      canResumeWithConfig: false,
    });
    const result = await pending;
    expect(result.timedOut).toBe(false);
    expect(result.settled).toEqual([b]);
    expect(result.statuses).toEqual({
      [a]: { status: "working", attention: "none" },
      [b]: { status: "needs_approval", attention: "needs_approval" },
    });
  });

  it("validates the 1..8 thread_ids bound", async () => {
    const h = makeHarness();
    await expect(h.manager.waitForThreads(PARENT, [], 10)).rejects.toThrow(/between 1 and 8/);
  });
});

describe("OrchestratorThreadManager.sendToThread", () => {
  it("starts a new turn when the child is idle", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "idle", config: { model: "child-model" } }));
    const result = await h.manager.sendToThread(PARENT, childId, "next step", false);
    expect(result.delivery).toBe("started_turn");
    expect(h.sent).toEqual([
      { threadId: childId, prompt: "next step", config: { model: "child-model" } },
    ]);
  });

  it("steers when working and the session supports steer", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "working", supportsSteer: true }));
    const result = await h.manager.sendToThread(PARENT, childId, "also do X", false);
    expect(result.delivery).toBe("steered");
    expect(h.sent).toHaveLength(1);
  });

  it("errors when working without steer support and interrupt=false", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "working", supportsSteer: false }));
    await expect(h.manager.sendToThread(PARENT, childId, "msg", false)).rejects.toThrow(
      /does not support steering/,
    );
    expect(h.sent).toEqual([]);
  });

  it("interrupts then sends when interrupt=true", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "working", supportsSteer: false }));
    const pending = h.manager.sendToThread(PARENT, childId, "stop and pivot", true);
    // Simulate the interrupt landing: the thread leaves `working`.
    h.states.set(childId, makeState({ status: "idle" }));
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: childId,
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
    const result = await pending;
    expect(result.delivery).toBe("interrupted_and_sent");
    expect(h.interrupted).toEqual([childId]);
    expect(h.sent).toHaveLength(1);
  });

  it("errors when the child session is gone", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.delete(childId);
    await expect(h.manager.sendToThread(PARENT, childId, "msg", false)).rejects.toThrow(
      /not running/,
    );
  });
});

describe("OrchestratorThreadManager.readThread", () => {
  it("returns the transcript tail with truncated bodies", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    const long = "x".repeat(10_000);
    h.setHistory({
      providerSessionId: "session-1",
      messages: [
        { messageId: "m1", role: "user", parts: [{ type: "text", text: "hello" }], info: {} },
        { messageId: "m2", role: "assistant", parts: [{ type: "text", text: long }], info: {} },
      ],
    });
    const result = await h.manager.readThread(PARENT, childId, 20);
    if (result.source !== "native") throw new Error("expected native transcript");
    expect(result.messageCount).toBe(2);
    expect(result.messages[0]).toEqual({ role: "user", text: "hello" });
    expect(result.messages[1]!.text.length).toBeLessThan(5_000);
    expect(result.messages[1]!.text).toContain("[truncated]");
  });

  it("slices to the requested tail, clamped to 1..100", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.setHistory({
      providerSessionId: "session-1",
      messages: Array.from({ length: 5 }, (_, i) => ({
        messageId: `m${i}`,
        role: "assistant" as const,
        parts: [`message ${i}`],
        info: {},
      })),
    });
    const result = await h.manager.readThread(PARENT, childId, 2);
    if (result.source !== "native") throw new Error("expected native transcript");
    expect(result.messages.map((m) => m.text)).toEqual(["message 3", "message 4"]);
  });

  it("serves the buffered transcript when the adapter lacks native readThread", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.setHistory(undefined);
    // Feed a couple of runtime items so the structured buffer is non-empty.
    h.manager.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: childId,
      events: [
        {
          type: "item.completed",
          threadId: childId,
          itemId: "a1",
          payload: { content: [{ kind: "text", text: "did the thing" }] },
        },
      ],
    });
    const result = await h.manager.readThread(PARENT, childId, 20);
    if (result.source !== "buffer") throw new Error("expected buffered transcript");
    expect(result.entries.at(-1)).toEqual({ kind: "assistant", text: "did the thing" });
  });

  it("returns a note when nothing has been recorded and there is no native transcript", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.setHistory(undefined);
    const result = await h.manager.readThread(PARENT, childId, 20);
    expect(result.source).toBe("note");
  });
});

describe("OrchestratorThreadManager.interruptThread + output tail", () => {
  it("interrupts an owned live child", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    await h.manager.interruptThread(PARENT, childId);
    expect(h.interrupted).toEqual([childId]);
  });

  it("errors when interrupting a closed child", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.delete(childId);
    await expect(h.manager.interruptThread(PARENT, childId)).rejects.toThrow(/not running/);
  });

  it("keeps a bounded assistant-output tail from runtime events", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.manager.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: childId,
      events: [
        {
          type: "content.delta",
          threadId: childId,
          itemId: "m",
          stream: "assistant_text",
          delta: "working on it: ",
        },
        {
          type: "content.delta",
          threadId: childId,
          itemId: "m",
          stream: "assistant_text",
          delta: "a".repeat(5_000),
        },
      ],
    });
    const summary = h.manager.getThread(PARENT, childId);
    expect(summary.recentOutput).toBeDefined();
    expect(summary.recentOutput!.length).toBeLessThanOrEqual(2_000);
    expect(summary.recentOutput!.endsWith("a")).toBe(true);
  });
});

describe("OrchestratorThreadManager failure reason + final result", () => {
  it("captures the failure reason from thread-state and clears it when work resumes", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "error", attention: "error" }));
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: childId,
      status: "error",
      attention: "error",
      canResumeWithConfig: false,
      errorMessage: "provider auth failed",
    });
    expect(h.manager.getThread(PARENT, childId).error).toBe("provider auth failed");

    // A fresh turn clears the stale reason so it doesn't linger.
    h.states.set(childId, makeState({ status: "working", attention: "working" }));
    h.manager.observeSupervisorEvent({
      type: "thread-state",
      threadId: childId,
      status: "working",
      attention: "working",
      canResumeWithConfig: false,
    });
    expect(h.manager.getThread(PARENT, childId).error).toBeUndefined();
  });

  it("captures a durable final_result that survives close_thread", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.manager.observeSupervisorEvent({
      type: "thread-runtime-events",
      threadId: childId,
      events: [
        {
          type: "content.delta",
          threadId: childId,
          itemId: "m",
          stream: "assistant_text",
          delta: "Ticket done: shipped the fix.",
        },
        { type: "turn.completed", threadId: childId, turnId: "t1", state: "completed" },
      ],
    });
    await h.manager.closeThread(PARENT, childId);
    const summary = h.manager.getThread(PARENT, childId);
    // Session is gone, but the collected result remains for the orchestrator.
    expect(summary.status).toBe("inactive");
    expect(summary.finalResult).toBe("Ticket done: shipped the fix.");
  });
});

describe("OrchestratorThreadManager.sendToThread approval handling", () => {
  it("refuses to send into a needs_approval child but answers a needs_reply", async () => {
    const h = makeHarness();
    const childId = await createChild(h);
    h.states.set(childId, makeState({ status: "needs_approval", attention: "needs_approval" }));
    await expect(h.manager.sendToThread(PARENT, childId, "approved", false)).rejects.toThrow(
      /approval/,
    );
    expect(h.sent).toEqual([]);

    // needs_reply is a question to the caller → answering starts a turn.
    h.states.set(
      childId,
      makeState({
        status: "needs_reply",
        attention: "needs_reply",
        config: { model: "child-model" },
      }),
    );
    const result = await h.manager.sendToThread(PARENT, childId, "use option B", false);
    expect(result.delivery).toBe("started_turn");
    expect(h.sent).toHaveLength(1);
  });
});
