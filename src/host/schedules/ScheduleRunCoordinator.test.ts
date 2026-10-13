import { ThreadSessionAbsenceRefusalError } from "@/shared/threadSessionRefusal";
import { DEFAULT_SCHEDULE_AUTOMATION, agentStatusesResponseSchema } from "@/shared/contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  AgentStatusesResponse,
  Project,
  RemoteThreadCommand,
  ScheduledTask,
  ScheduledTaskRun,
  Thread,
  ThreadConfig,
  ThreadStatus,
} from "@/shared/contracts";
import { ScheduleExecutionAdmissionError } from "@/host/db/scheduleExecutionAdmission";
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
    admitScheduleExecution: () => {},
    getThreadRuntimeItemCursor: (id) => (runtimeItems.get(id)?.length ?? 0) - 1,
    getThreadRuntimeItemsAfter: (id, cursor) => (runtimeItems.get(id) ?? []).slice(cursor + 1),
    sendThreadCommand: (command) => {
      sent.push(command);
      return true;
    },
    ensureHomeProject: () => HOME_PROJECT,
    getProject: (projectId) =>
      projectId === WORK_PROJECT.id
        ? WORK_PROJECT
        : projectId === HOME_PROJECT.id
          ? HOME_PROJECT
          : null,
    upsertThread: (thread) => {
      threads.set(thread.id, thread);
    },
    deleteThread: (threadId) => {
      threads.delete(threadId);
    },
    threadExists: (threadId) => threads.has(threadId),
    getThread: (id) => threads.get(id) ?? null,
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
  it("cancels a pending capability lookup before thread creation and joins the lookup", async () => {
    const lookup = Promise.withResolvers<AgentStatusesResponse>();
    const entered = Promise.withResolvers<void>();
    const { coordinator, threads, runs, sent, startThread } = makeHarness({
      getAgentStatuses: () => {
        entered.resolve();
        return lookup.promise;
      },
    });
    const completion = coordinator.runScheduleAsThread(task);
    void completion.catch(() => undefined);
    await entered.promise;
    let disposed = false;
    const disposal = coordinator.dispose().then(() => {
      disposed = true;
    });
    await expect(completion).rejects.toThrow("shutting down");
    expect(disposed).toBe(false);
    lookup.resolve(agentStatuses());
    await disposal;
    expect(threads.size).toBe(0);
    expect(runs.size).toBe(0);
    expect(sent).toEqual([]);
    expect(startThread).not.toHaveBeenCalled();
  });

  it.each(["success", "failure"])(
    "joins an admitted launch %s and preserves interrupted history",
    async (outcome) => {
      const launch = Promise.withResolvers<unknown>();
      const entered = Promise.withResolvers<void>();
      const start = vi.fn<ScheduleRunCoordinatorDeps["startThread"]>(() => {
        entered.resolve();
        return launch.promise;
      });
      const { coordinator, threads, runs, sent } = makeHarness({ startThread: start });
      const completion = coordinator.runScheduleAsThread(task);
      void completion.catch(() => undefined);
      await entered.promise;
      const closing = coordinator.dispose();
      expect(coordinator.dispose()).toBe(closing);
      let disposed = false;
      void closing.then(() => {
        disposed = true;
      });
      await expect(completion).rejects.toThrow("shutting down");
      expect(disposed).toBe(false);
      expect(runs.get("run-1")?.status).toBe("interrupted");
      if (outcome === "success") launch.resolve({});
      else launch.reject(new Error("synthetic late launch failure"));
      await closing;
      expect(threads.has("thread-1")).toBe(true);
      expect(sent.map((command) => command.kind)).toEqual(["start"]);
      coordinator.observeSupervisorEvent(threadState("thread-1", "finished"));
      expect(runs.get("run-1")?.status).toBe("interrupted");
    },
  );

  it("interrupts a running task without waiting for its whole turn and rejects new launches", async () => {
    const ensureHomeProject = vi.fn<() => Project>(() => HOME_PROJECT);
    const { coordinator, runs, startThread } = makeHarness({ ensureHomeProject });
    const completion = coordinator.runScheduleAsThread(task);
    void completion.catch(() => undefined);
    await vi.waitFor(() => expect(startThread).toHaveBeenCalledOnce());
    await coordinator.dispose();
    await expect(completion).rejects.toThrow("shutting down");
    expect(runs.get("run-1")?.status).toBe("interrupted");
    await expect(coordinator.runScheduleAsThread(task)).rejects.toThrow("shutting down");
    expect(ensureHomeProject).toHaveBeenCalledOnce();
  });

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

  it("publishes the scheduled run's new thread id for remote membership", async () => {
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const { coordinator } = makeHarness({ publishThreadsChanged });

    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    expect(publishThreadsChanged.mock.calls).toEqual([[["thread-1"]]]);

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("announces the rollback after deleting the fresh row when the launch fails", async () => {
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const { coordinator } = makeHarness({
      publishThreadsChanged,
      startThread: vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("supervisor down")),
    });

    await expect(coordinator.runScheduleAsThread(task)).resolves.toMatchObject({
      status: "failed",
      error: "supervisor down",
    });
    // Create then rollback, both bounded to the one generated id.
    expect(publishThreadsChanged.mock.calls).toEqual([[["thread-1"]], [["thread-1"]]]);
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
    sendThreadInput.mockRejectedValueOnce(
      new ThreadSessionAbsenceRefusalError("Unknown thread session: target-thread"),
    );
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

  it("does not resume a target archived while a missing-session request awaits", async () => {
    const { coordinator, threads, sendThreadInput, startThread } = makeHarness();
    threads.set(
      "target-thread",
      targetThread({
        status: "inactive",
        sessionRef: { providerSessionId: "session", discoveredAt: "2026-07-10T00:00:00.000Z" },
      }),
    );
    const sending = Promise.withResolvers<void>();
    sendThreadInput.mockReturnValueOnce(sending.promise);
    const settled = coordinator.runScheduleAsThread(heartbeatTask());
    await flush();
    threads.set("target-thread", { ...threads.get("target-thread")!, archived: true });
    sending.reject(new ThreadSessionAbsenceRefusalError("Missing session"));
    await expect(settled).resolves.toMatchObject({
      status: "failed",
      error: "The heartbeat conversation is archived.",
    });
    expect(startThread).not.toHaveBeenCalled();
    expect(sendThreadInput).toHaveBeenCalledTimes(1);
  });

  it.each(["archive", "worktree", "project"] as const)(
    "refuses heartbeat input when %s changes while resuming",
    async (change) => {
      let project = WORK_PROJECT;
      const { coordinator, threads, sendThreadInput, startThread } = makeHarness({
        getProject: () => project,
      });
      const heartbeat = { ...heartbeatTask(), projectId: WORK_PROJECT.id };
      threads.set(
        "target-thread",
        targetThread({
          projectId: WORK_PROJECT.id,
          status: "inactive",
          sessionRef: { providerSessionId: "session", discoveredAt: "2026-07-10T00:00:00.000Z" },
        }),
      );
      sendThreadInput.mockRejectedValueOnce(
        new ThreadSessionAbsenceRefusalError("Missing session"),
      );
      const resuming = Promise.withResolvers<unknown>();
      startThread.mockReturnValueOnce(resuming.promise);
      const settled = coordinator.runScheduleAsThread(heartbeat);
      await flush();
      expect(startThread).toHaveBeenCalledTimes(1);
      if (change === "project")
        project = { ...WORK_PROJECT, location: { kind: "windows", path: "C:/moved" } };
      else
        threads.set("target-thread", {
          ...threads.get("target-thread")!,
          ...(change === "archive" ? { archived: true } : { worktreePath: "/new-worktree" }),
        });
      resuming.resolve(undefined);
      await expect(settled).resolves.toMatchObject({ status: "failed" });
      expect(sendThreadInput).toHaveBeenCalledTimes(1);
    },
  );

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

  it("keeps an approval pause cancellable and records the eventual result", async () => {
    const { coordinator, runs, runtimeItems } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();
    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "needs_approval"));
    expect(runs.get("run-1")).toMatchObject({
      status: "waiting-for-approval",
      completedAt: null,
      result: { unread: true },
    });
    runtimeItems.set("thread-1", [
      {
        id: "final",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "Approved and completed." },
      },
    ]);
    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({
      status: "succeeded",
      summary: "Approved and completed.",
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

  it("admits before Home creation and again after the permission lookup", async () => {
    const order: string[] = [];
    const ensureHomeProject = vi.fn<() => Project>(() => {
      order.push("ensureHomeProject");
      return HOME_PROJECT;
    });
    const getAgentStatuses = vi.fn<ScheduleRunCoordinatorDeps["getAgentStatuses"]>(async () => {
      order.push("getAgentStatuses");
      return agentStatuses();
    });
    const upsertThread = vi.fn<ScheduleRunCoordinatorDeps["upsertThread"]>(() => {
      order.push("upsertThread");
    });
    const admit = vi.fn<ScheduleRunCoordinatorDeps["admitScheduleExecution"]>(() => {
      order.push("admit");
    });
    const { coordinator, startThread } = makeHarness({
      ensureHomeProject,
      getAgentStatuses,
      upsertThread,
      admitScheduleExecution: admit,
    });

    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    expect(admit).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      "admit",
      "ensureHomeProject",
      "getAgentStatuses",
      "admit",
      "upsertThread",
    ]);
    expect(startThread).toHaveBeenCalledOnce();

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });

  it("refuses a missing authoritative task before any effect", async () => {
    const ensureHomeProject = vi.fn<() => Project>(() => HOME_PROJECT);
    const getAgentStatuses = vi.fn<ScheduleRunCoordinatorDeps["getAgentStatuses"]>();
    const { coordinator, threads, runs, sent, startThread } = makeHarness({
      ensureHomeProject,
      getAgentStatuses,
      admitScheduleExecution: () => {
        throw new ScheduleExecutionAdmissionError("missing", "changed or was removed");
      },
    });

    await expect(coordinator.runScheduleAsThread(task)).rejects.toThrow("changed or was removed");
    // Not even the Home project row is created before the first admission.
    expect(ensureHomeProject).not.toHaveBeenCalled();
    expect(getAgentStatuses).not.toHaveBeenCalled();
    expect(threads.size).toBe(0);
    expect(runs.size).toBe(0);
    expect(sent).toEqual([]);
    expect(startThread).not.toHaveBeenCalled();
  });

  it("refuses stale authoritative data after the permission lookup, before persisting", async () => {
    const ensureHomeProject = vi.fn<() => Project>(() => HOME_PROJECT);
    let admits = 0;
    const { coordinator, threads, runs, sent, startThread } = makeHarness({
      ensureHomeProject,
      admitScheduleExecution: () => {
        admits += 1;
        if (admits === 2)
          throw new ScheduleExecutionAdmissionError("stale", "changed or was removed");
      },
    });

    await expect(coordinator.runScheduleAsThread(task)).rejects.toThrow("changed or was removed");
    // The first admission passed (Home may have been created), but the
    // awaited permission lookup happened before the second refusal — so the
    // thread, run row, mirror, and launch never happen.
    expect(ensureHomeProject).toHaveBeenCalledOnce();
    expect(threads.size).toBe(0);
    expect(runs.size).toBe(0);
    expect(sent).toEqual([]);
    expect(startThread).not.toHaveBeenCalled();
  });

  it("carries empty, false, and bound controls through the thread config exactly", async () => {
    const { coordinator, threads, sent } = makeHarness();
    const taskBinding = {
      version: 1 as const,
      kind: "family-member" as const,
      owner: { agentKind: "glm:profile-alpha", presentationMode: "gui" as const },
      model: task.config.model,
      inertValues: { fast: false },
    };

    const settled = coordinator.runScheduleAsThread({
      ...task,
      config: {
        model: task.config.model,
        effort: "",
        fast: false,
        thinking: false,
        contextSize: "128k",
        selectionBinding: taskBinding,
      },
    });
    await flush();

    const expectedConfig = {
      model: "claude-fable-5",
      effort: "",
      fast: false,
      thinking: false,
      contextSize: "128k",
      selectionBinding: taskBinding,
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
    };
    // Exact equality: falsy carriers and the recognized binding survive the
    // merge, and nothing else is added or dropped.
    expect(threads.get("thread-1")?.config).toEqual(expectedConfig);
    expect(sent).toEqual([expect.objectContaining({ kind: "start" })]);
    expect((sent[0] as { config: ThreadConfig }).config).toEqual(expectedConfig);

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    await expect(settled).resolves.toMatchObject({ status: "succeeded" });
  });
});

describe("scheduled turn ownership regressions", () => {
  it("reserves a heartbeat conversation before capability lookup", async () => {
    const capabilities = Promise.withResolvers<AgentStatusesResponse>();
    const h = makeHarness({ getAgentStatuses: () => capabilities.promise });
    h.threads.set("target-thread", targetThread());
    const first = h.coordinator.runScheduleAsThread(heartbeatTask());
    await expect(h.coordinator.runScheduleAsThread(heartbeatTask())).resolves.toMatchObject({
      status: "failed",
      result: { stopReason: "target-busy" },
    });
    capabilities.resolve(agentStatuses());
    await flush();
    expect(h.sendThreadInput).toHaveBeenCalledTimes(1);
    h.coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    h.coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));
    await expect(first).resolves.toMatchObject({ status: "succeeded" });
  });

  it("settles an already-aborted preparation without launching", async () => {
    const controller = new AbortController();
    controller.abort();
    const h = makeHarness();
    await expect(
      h.coordinator.runScheduleAsThread(task, {
        signal: controller.signal,
        scheduledFor: task.createdAt,
        trigger: "manual",
        attempt: 1,
        iteration: 1,
      }),
    ).resolves.toMatchObject({ status: "cancelled" });
    expect(h.startThread).not.toHaveBeenCalled();
    expect(h.threads.size).toBe(0);
    await expect(h.coordinator.dispose()).resolves.toBeUndefined();
  });

  it("does not interrupt a newer user turn while collecting a completed result", async () => {
    const evidence = Promise.withResolvers<PersistedRuntimeItem[]>();
    const interruptThread = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const h = makeHarness({ interruptThread, getThreadRuntimeItemsAfter: () => evidence.promise });
    h.threads.set("target-thread", targetThread());
    const settled = h.coordinator.runScheduleAsThread(heartbeatTask());
    await flush();
    const runId = [...h.runs.keys()][0]!;
    h.coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    h.coordinator.observeSupervisorEvent(threadState("target-thread", "idle"));
    h.coordinator.observeSupervisorEvent(threadState("target-thread", "working"));
    expect(h.coordinator.cancelRun(runId)).toBe(true);
    expect(interruptThread).not.toHaveBeenCalled();
    evidence.resolve([]);
    await expect(settled).resolves.toMatchObject({ status: "cancelled" });
  });

  it("keeps a failed final write in custody and lets shutdown retry after recovery", async () => {
    let failures = 2;
    const h = makeHarness({
      updateRun: (id, patch) => {
        if (failures-- > 0) throw new Error("disk temporarily unavailable");
        const current = h.runs.get(id)!;
        h.runs.set(id, { ...current, ...patch });
      },
    });
    const settled = h.coordinator.runScheduleAsThread(task);
    const refused = settled.catch((error: unknown) => error);
    await flush();
    h.coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    h.coordinator.observeSupervisorEvent(threadState("thread-1", "idle"));
    expect(await refused).toBeInstanceOf(Error);
    expect(((await refused) as Error).message).toBe("disk temporarily unavailable");
    expect(h.runs.get("run-1")?.status).toBe("running");
    await expect(h.coordinator.dispose()).rejects.toThrow(
      "Unable to persist scheduled run results",
    );
    await expect(h.coordinator.dispose()).resolves.toBeUndefined();
    expect(h.runs.get("run-1")?.status).toBe("succeeded");
    expect(h.coordinator.cancelRun("run-1")).toBe(false);
  });

  it("records a supervisor reset as interrupted before its inactive event", async () => {
    const evaluateCompletion =
      vi.fn<NonNullable<ScheduleRunCoordinatorDeps["evaluateCompletion"]>>();
    const h = makeHarness({ evaluateCompletion });
    const settled = h.coordinator.runScheduleAsThread(task);
    await flush();
    h.coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    h.coordinator.handleSupervisorReset();
    h.coordinator.observeSupervisorEvent(threadState("thread-1", "inactive"));
    await expect(settled).resolves.toMatchObject({
      status: "interrupted",
      result: { stopReason: "supervisor-reset" },
    });
    expect(evaluateCompletion).not.toHaveBeenCalled();
  });
});
