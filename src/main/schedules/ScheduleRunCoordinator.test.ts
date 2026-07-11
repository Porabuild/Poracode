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
import { agentStatusesResponseSchema } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
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
}

function makeHarness(overrides: Partial<ScheduleRunCoordinatorDeps> = {}): Harness {
  const threads = new Map<string, Thread>();
  const runs = new Map<string, ScheduledTaskRun>();
  const sent: RemoteThreadCommand[] = [];
  const ids = ["thread-1", "run-1"];
  let idx = 0;
  const startThread = vi.fn<() => Promise<unknown>>().mockResolvedValue(undefined);

  const deps: ScheduleRunCoordinatorDeps = {
    startThread,
    getAgentStatuses: async () => agentStatuses(),
    sendThreadCommand: (command) => {
      sent.push(command);
      return true;
    },
    ensureHomeProject: () => HOME_PROJECT,
    getProject: (projectId) => (projectId === WORK_PROJECT.id ? WORK_PROJECT : null),
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
      });
    },
    newId: () => ids[idx++] ?? `id-${idx}`,
    ...overrides,
  };

  return { coordinator: new ScheduleRunCoordinator(deps), threads, runs, sent, startThread };
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

    await expect(settled).resolves.toBe("");
    expect(runs.get("run-1")).toMatchObject({ status: "succeeded", summary: null });
    expect(runs.get("run-1")?.completedAt).not.toBeNull();
  });

  it("settles failed and rejects when the thread errors", async () => {
    const { coordinator, runs } = makeHarness();
    const settled = coordinator.runScheduleAsThread(task);
    await flush();

    coordinator.observeSupervisorEvent(threadState("thread-1", "working"));
    coordinator.observeSupervisorEvent(threadState("thread-1", "error", "model exploded"));

    await expect(settled).rejects.toThrow("model exploded");
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

    await expect(settled).resolves.toBe("");
    expect(runs.get("run-1")?.status).toBe("succeeded");
  });

  it("rolls back the fresh thread row and fails the run when startThread throws", async () => {
    const { coordinator, threads, runs, sent } = makeHarness({
      startThread: vi.fn<() => Promise<unknown>>().mockRejectedValue(new Error("supervisor down")),
    });

    await expect(coordinator.runScheduleAsThread(task)).rejects.toThrow("supervisor down");
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
    await expect(settled).resolves.toBe("");
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
    await expect(settled).resolves.toBe("");
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
    await expect(settled).resolves.toBe("");
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
    await expect(settled).resolves.toBe("");
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
    await expect(settled).resolves.toBe("");
  });

  it("fails the run when the task's project no longer exists", async () => {
    const { coordinator, threads, runs } = makeHarness();

    await expect(
      coordinator.runScheduleAsThread({ ...task, projectId: "deleted-project-id" }),
    ).rejects.toThrow("Project no longer exists.");
    // No thread row or run row is created when the project can't be resolved.
    expect(threads.size).toBe(0);
    expect(runs.size).toBe(0);
  });
});
