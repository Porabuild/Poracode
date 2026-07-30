import { describe, expect, it, vi } from "vitest";
import type {
  AgentStatusesResponse,
  Project,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskRun,
  Thread,
  ThreadStatus,
} from "@/shared/contracts";
import { agentStatusesResponseSchema, DEFAULT_SCHEDULE_AUTOMATION } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { defaultSharedSettings } from "@/shared/settings";
import type { PersistedRuntimeItem } from "../db/runtimeItems";
import { ScheduleRunCoordinator, type ScheduleRunCoordinatorDeps } from "./ScheduleRunCoordinator";

const HOME_PROJECT: Project = {
  id: "__lightcode_home__",
  name: "Home",
  location: { kind: "posix", path: "/home/user" },
  disabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

const WORK_PROJECT: Project = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Work",
  location: { kind: "windows", path: "C:/repos/work" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const task: ScheduledTask = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Nightly brief",
  prompt: "Summarize the day.",
  agentKind: "claude:home",
  config: { model: "claude-fable-5", effort: "high" },
  recurrence: { kind: "hourly", minute: 0 },
  enabled: true,
  nextRunAt: null,
  lastRunAt: "2026-07-10T00:00:00.000Z",
  lastCompletedAt: null,
  lastStatus: "running",
  lastResult: null,
  lastError: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

function heartbeatTask(
  automation: Partial<NonNullable<ScheduledTask["automation"]>> = {},
): ScheduledTask {
  return {
    ...task,
    automation: {
      ...DEFAULT_SCHEDULE_AUTOMATION,
      ...automation,
      mode: { kind: "heartbeat", targetThreadId: "target-thread" },
    },
  };
}

function targetThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "target-thread",
    projectId: HOME_PROJECT.id,
    title: "Ongoing automation",
    agentKind: task.agentKind,
    config: { model: task.config.model },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    ...overrides,
  };
}

/** Codex-like posture: bypass options advertised for both approval and sandbox. */
function agentStatuses(
  capabilities: Record<string, unknown> = {
    approvalPolicies: [
      { id: "on-request", label: "On Request" },
      { id: "never", label: "Full Access" },
    ],
    sandboxModes: [
      { id: "workspace-write", label: "Workspace Write" },
      { id: "danger-full-access", label: "Full Access" },
    ],
  },
): AgentStatusesResponse {
  return agentStatusesResponseSchema.parse({
    fromCache: true,
    windows: [
      {
        kind: task.agentKind,
        label: "Claude",
        installed: true,
        authState: "authenticated",
        capabilities,
      },
    ],
    wsl: [],
  });
}

interface Harness {
  coordinator: ScheduleRunCoordinator;
  threads: Map<string, Thread>;
  runs: Map<string, ScheduledTaskRun>;
  sent: RemoteThreadCommand[];
  startThread: ReturnType<typeof vi.fn>;
  sendThreadInput: ReturnType<typeof vi.fn>;
  runtimeItems: Map<string, PersistedRuntimeItem[]>;
}

function makeHarness(overrides: Partial<ScheduleRunCoordinatorDeps> = {}): Harness {
  const threads = new Map<string, Thread>();
  const runs = new Map<string, ScheduledTaskRun>();
  const sent: RemoteThreadCommand[] = [];
  const runtimeItems = new Map<string, PersistedRuntimeItem[]>();
  const ids = ["thread-1", "run-1"];
  let idx = 0;
  const startThread = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);
  const sendThreadInput = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  const deps: ScheduleRunCoordinatorDeps = {
    startThread,
    sendThreadInput,
    interruptThread: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getAgentStatuses: async () => agentStatuses(),
    sendThreadCommand: (command) => {
      sent.push(command);
      return true;
    },
    ensureHomeProject: () => HOME_PROJECT,
    getProject: (projectId) => (projectId === WORK_PROJECT.id ? WORK_PROJECT : null),
    getThread: (threadId) => threads.get(threadId) ?? null,
    getThreadRuntimeItemCursor: (threadId) => (runtimeItems.get(threadId)?.length ?? 0) - 1,
    getThreadRuntimeItemsAfter: (threadId, cursor) =>
      (runtimeItems.get(threadId) ?? []).slice(cursor + 1),
    upsertThread: (thread) => {
      threads.set(thread.id, thread);
    },
    deleteThread: (threadId) => {
      threads.delete(threadId);
    },
    threadExists: (threadId) => threads.has(threadId),
    insertRun: (run) => {
      runs.set(run.id, run);
    },
    updateRun: (id, patch) => {
      const current = runs.get(id);
      if (!current) return;
      runs.set(id, {
        ...current,
        ...(patch.completedAt !== undefined ? { completedAt: patch.completedAt } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        ...(patch.result !== undefined ? { result: patch.result } : {}),
      });
    },
    newId: () => ids[idx++] ?? `id-${idx}`,
    getSharedSettings: () => defaultSharedSettings,
    ...overrides,
  };

  return {
    coordinator: new ScheduleRunCoordinator(deps),
    threads,
    runs,
    sent,
    startThread,
    sendThreadInput,
    runtimeItems,
  };
}

function threadState(
  threadId: string,
  status: ThreadStatus,
  errorMessage?: string,
): SupervisorEvent {
  return {
    type: "thread-state",
    threadId,
    status,
    attention: "none",
    canResumeWithConfig: false,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

/**
 * Drain pending microtasks: `runScheduleAsThread` awaits the capability lookup
 * before persisting the thread row and calling `startThread`.
 */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ScheduleRunCoordinator", () => {
  it("creates a real GUI thread, records a running run, then settles succeeded", async () => {
    const { coordinator, threads, runs, sent, startThread } = makeHarness();

    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    // Persisted before the supervisor start resolves.
    const thread = threads.get("thread-1");
    expect(thread).toMatchObject({
      id: "thread-1",
      projectId: HOME_PROJECT.id,
      title: "Nightly brief",
      presentationMode: "gui",
      status: "launching",
    });
    expect(sent[0]).toMatchObject({
      kind: "start",
      threadId: "thread-1",
      title: "Nightly brief",
      launchRuntime: false,
      focus: false,
      presentationMode: "gui",
    });
    expect(runs.get("run-1")).toMatchObject({
      scheduleId: task.id,
      threadId: "thread-1",
      status: "running",
      completedAt: null,
    });
    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-1",
        presentationMode: "gui",
        prompt: task.prompt,
      }),
    );

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));

    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
    expect(runs.get("run-1")).toMatchObject({ status: "succeeded", summary: null });
    expect(runs.get("run-1")?.completedAt).not.toBeNull();
  });

  it("settles failed and rejects when the thread errors", async () => {
    const { coordinator, runs } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "error", "model exploded"));

    await expect(settled).resolves.toMatchObject({ status: "failed", error: "model exploded" });
    expect(runs.get("run-1")).toMatchObject({ status: "failed", error: "model exploded" });
  });

  it("proceeds when no window is present (sendThreadCommand returns false)", async () => {
    const { coordinator, threads, runs } = makeHarness({ sendThreadCommand: () => false });

    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    expect(threads.get("thread-1")).toBeDefined();
    expect(runs.get("run-1")?.status).toBe("running");

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "finished"));

    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
    expect(runs.get("run-1")?.status).toBe("succeeded");
  });

  it("rolls back the fresh thread row and fails the run when startThread throws", async () => {
    const { coordinator, threads, runs, sent } = makeHarness({
      startThread: vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("supervisor down")),
    });

    await expect(coordinator.runScheduleAsThread(task)).resolves.toMatchObject({
      status: "failed",
      error: "supervisor down",
    });
    expect(threads.has("thread-1")).toBe(false);
    expect(sent.some((command) => command.kind === "delete")).toBe(true);
    expect(runs.get("run-1")).toMatchObject({ status: "failed", error: "supervisor down" });
  });

  it("ignores a stale pre-launch inactive echo and waits for a real terminal state", async () => {
    const { coordinator, runs } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    // Arrives before the run ever went active — must not settle.
    coordinator.observeSupervisorEvent(threadState("thread-1", "inactive"));
    expect(runs.get("run-1")?.status).toBe("running");

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
    expect(runs.get("run-1")?.status).toBe("succeeded");
  });

  it("creates the thread in the task's project and uses its location to start", async () => {
    const { coordinator, threads, startThread } = makeHarness();

    const settled = coordinator.runScheduleAsThread({ ...task, projectId: WORK_PROJECT.id });
    await flush();

    expect(threads.get("thread-1")?.projectId).toBe(WORK_PROJECT.id);
    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({ projectLocation: WORK_PROJECT.location }),
    );

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("resolves global and project MCP settings for scheduled launches", async () => {
    const globalServer = {
      id: "global-memory",
      name: "memory",
      description: "global",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio" as const, command: "global-memory", args: [], env: {} },
    };
    const projectServer = {
      ...globalServer,
      id: "project-memory",
      name: "MEMORY",
      description: "project override",
      transport: { ...globalServer.transport, command: "project-memory" },
    };
    const project = { ...WORK_PROJECT, mcpServers: [projectServer] };
    const { coordinator, startThread } = makeHarness({
      getProject: (projectId) => (projectId === project.id ? project : null),
      getSharedSettings: () => ({
        ...defaultSharedSettings,
        mcpServers: [globalServer],
        disabledBuiltInMcpServers: { browser: true },
      }),
    });

    const settled = coordinator.runScheduleAsThread({ ...task, projectId: project.id });
    await flush();

    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [projectServer],
        disabledBuiltInMcpServerIds: ["browser"],
      }),
    );

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("launches scheduled runs with the provider's most-permissive policy", async () => {
    const { coordinator, threads, sent, startThread } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    const expectedConfig = {
      model: "claude-fable-5",
      effort: "high",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
    expect(startThread).toHaveBeenCalledWith(expect.objectContaining({ config: expectedConfig }));
    // The unrestricted config is also what gets persisted and mirrored.
    expect(threads.get("thread-1")?.config).toEqual(expectedConfig);
    expect(sent[0]).toMatchObject({ kind: "start", config: expectedConfig });

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("falls back to the declared bypass posture when no options are advertised", async () => {
    const { coordinator, startThread } = makeHarness({
      getAgentStatuses: async () =>
        agentStatuses({
          approvalPolicies: [],
          sandboxModes: [],
          bypassPermissions: { approvalPolicy: "bypassPermissions" },
        }),
    });
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { model: "claude-fable-5", effort: "high", approvalPolicy: "bypassPermissions" },
      }),
    );

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("keeps provider defaults when the capability lookup fails", async () => {
    const { coordinator, startThread } = makeHarness({
      getAgentStatuses: async () => {
        throw new Error("supervisor busy");
      },
    });
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({ config: { model: "claude-fable-5", effort: "high" } }),
    );

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("fails the run when the task's project no longer exists", async () => {
    const { coordinator, threads, runs } = makeHarness();

    await expect(
      coordinator.runScheduleAsThread({ ...task, projectId: "deleted-project-id" }),
    ).resolves.toMatchObject({ status: "failed", error: "Project no longer exists." });
    // Configuration failures are durable even when no thread can be created.
    expect(threads.size).toBe(0);
    expect(runs.size).toBe(1);
  });

  it("captures fresh assistant text and changed files as a typed finding", async () => {
    const { coordinator, runtimeItems, runs } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    runtimeItems.set("thread-1", [
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Updated the release notes." },
      },
      {
        id: "file-1",
        type: "file_change",
        state: "completed",
        payload: { path: "CHANGELOG.md", changeKind: "edit", status: "success" },
        streams: {},
      },
    ]);

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));

    await expect(settled).resolves.toMatchObject({
      summary: "Updated the release notes.",
      result: {
        outcome: "changed-files",
        unread: true,
        changedFiles: ["CHANGELOG.md"],
      },
    });
    expect(runs.get("run-1")?.summary).toBe("Updated the release notes.");
  });

  it("keeps text-only successful results unknown instead of inventing findings", async () => {
    const { coordinator, runtimeItems } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    runtimeItems.set("thread-1", [
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "No issues found." },
      },
    ]);

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));

    await expect(settled).resolves.toMatchObject({
      summary: "No issues found.",
      result: { outcome: "unknown", unread: true },
    });
  });

  it("runs a heartbeat in an idle conversation and excludes its prior items", async () => {
    const { coordinator, threads, runtimeItems, sendThreadInput } = makeHarness();
    threads.set("target-thread", targetThread());
    runtimeItems.set("target-thread", [
      {
        id: "old-assistant",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Old result" },
      },
    ]);
    const settled = coordinator.runScheduleAsThread(heartbeatTask());
    await flush();
    expect(sendThreadInput).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "target-thread", prompt: task.prompt }),
    );
    runtimeItems.get("target-thread")!.push({
      id: "new-assistant",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: "Fresh result" },
    });

    coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));

    await expect(settled).resolves.toMatchObject({
      status: "succeeded",
      summary: "Fresh result",
    });
  });

  it("resumes a persisted heartbeat session before sending its turn", async () => {
    const { coordinator, threads, sendThreadInput, startThread } = makeHarness();
    threads.set(
      "target-thread",
      targetThread({
        status: "inactive",
        sessionRef: {
          providerSessionId: "provider-session",
          discoveredAt: "2026-07-10T00:00:00.000Z",
        },
      }),
    );
    sendThreadInput.mockRejectedValueOnce(new Error("Unknown thread session"));
    const settled = coordinator.runScheduleAsThread(heartbeatTask());
    await flush();

    expect(startThread).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "target-thread",
        prompt: "",
        sessionRef: expect.objectContaining({ providerSessionId: "provider-session" }),
      }),
    );
    expect(sendThreadInput).toHaveBeenCalledTimes(2);

    coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("rejects a heartbeat target that is already working", async () => {
    const { coordinator, threads, sendThreadInput } = makeHarness();
    threads.set("target-thread", targetThread({ status: "working" }));

    await expect(coordinator.runScheduleAsThread(heartbeatTask())).resolves.toMatchObject({
      status: "failed",
      error: "The heartbeat conversation is currently busy.",
    });
    expect(sendThreadInput).not.toHaveBeenCalled();
  });

  it("rejects an archived heartbeat target", async () => {
    const { coordinator, threads, sendThreadInput } = makeHarness();
    threads.set("target-thread", targetThread({ archived: true }));

    await expect(coordinator.runScheduleAsThread(heartbeatTask())).resolves.toMatchObject({
      status: "failed",
      error: "The heartbeat conversation is archived.",
    });
    expect(sendThreadInput).not.toHaveBeenCalled();
  });

  it("surfaces an unattended approval request in triage", async () => {
    const { coordinator } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "needs_approval"));

    await expect(settled).resolves.toMatchObject({
      status: "waiting-for-approval",
      result: { outcome: "needs-attention", unread: true },
    });
  });

  it("evaluates a heartbeat completion condition after a successful turn", async () => {
    const { coordinator, threads, runtimeItems } = makeHarness({
      evaluateCompletion: vi
        .fn<NonNullable<ScheduleRunCoordinatorDeps["evaluateCompletion"]>>()
        .mockResolvedValue({
          stopMatched: true,
          confidence: 0.95,
          reason: "The requested artifact exists.",
        }),
    });
    threads.set("target-thread", targetThread());
    const scheduled = heartbeatTask({
      completionPolicy: {
        kind: "ai-evaluated",
        stopWhen: "The artifact exists",
        confidenceThreshold: 0.9,
      },
    });
    const settled = coordinator.runScheduleAsThread(scheduled);
    await flush();
    runtimeItems.set("target-thread", [
      {
        id: "assistant-1",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Created the artifact." },
      },
    ]);
    coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));

    await expect(settled).resolves.toMatchObject({
      stopMatched: true,
      result: {
        stopReason: "completion-condition",
        completionEvaluation: {
          condition: "The artifact exists",
          stopMatched: true,
        },
      },
    });
  });

  it("cancels an active automation by run id", async () => {
    const { coordinator, runs } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    const runId = [...runs.keys()][0]!;

    expect(coordinator.cancelRun(runId)).toBe(true);
    await expect(settled).resolves.toMatchObject({ status: "cancelled" });
    expect(coordinator.cancelRun(runId)).toBe(false);
  });

  it("cancels an automation while its completion condition is being evaluated", async () => {
    const evaluateCompletion = vi.fn<NonNullable<ScheduleRunCoordinatorDeps["evaluateCompletion"]>>(
      () => new Promise(() => undefined),
    );
    const { coordinator, runs, threads } = makeHarness({ evaluateCompletion });
    threads.set("target-thread", targetThread());
    const scheduled = heartbeatTask({
      completionPolicy: {
        kind: "ai-evaluated",
        stopWhen: "The artifact exists",
        confidenceThreshold: 0.9,
      },
    });
    const settled = coordinator.runScheduleAsThread(scheduled);
    await flush();
    const runId = [...runs.keys()][0]!;
    coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));
    await vi.waitFor(() => expect(evaluateCompletion).toHaveBeenCalledOnce());

    expect(coordinator.cancelRun(runId)).toBe(true);
    await expect(settled).resolves.toMatchObject({
      status: "cancelled",
      result: { stopReason: "cancelled" },
    });
    expect(runs.get(runId)).toMatchObject({ status: "cancelled" });
    expect(coordinator.cancelRun(runId)).toBe(false);
  });

  it("interrupts active automations when the supervisor resets", async () => {
    const { coordinator } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    coordinator.handleSupervisorReset();

    await expect(settled).resolves.toMatchObject({
      status: "interrupted",
      result: { stopReason: "supervisor-reset" },
    });
  });
});
