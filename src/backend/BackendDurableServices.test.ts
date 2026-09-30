import { describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSharedSettingsFile, writeSharedSettingsFile } from "@/host/sharedSettingsFile";
import { RoutingOverridePersistence } from "@/supervisor/crossagentMcp/RoutingOverridePersistence";
import type { ConfirmCrossagentRoutingOverridePayload } from "@/shared/ipc/procedures/mcp";
import { defaultSharedSettings } from "@/shared/settings";
import type { SettingsMutationResult } from "@/shared/settingsTransactions";
import { BackendDurableServices } from "./BackendDurableServices";
import type { BackendDurableServicesOptions } from "./BackendDurableServices";
import {
  dbArchiveDoneThreads,
  dbDeleteThread,
  dbIsThreadPurgeEligible,
  dbSelectPurgeCandidateThreadIds,
  dbUpsertThread,
} from "@/host/db";
import { SupervisorUnavailableError } from "@/host/supervisor/SupervisorClient";
import { agentStatusesResponseSchema, type ScheduledTask, type Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  ingressInstances: [] as Array<{
    info: { url: string; token: string } | null;
    start: ReturnType<typeof vi.fn<() => Promise<{ url: string; token: string }>>>;
  }>,
  runScheduleTask: null as ((task: ScheduledTask) => Promise<string>) | null,
  threadsDeletedListeners: [] as Array<(threadIds: readonly string[]) => void>,
  liveThreadIds: [] as string[],
}));

vi.mock("@/host/db", () => ({
  dbArchiveDoneThreads: vi.fn<() => string[]>(() => []),
  dbDeleteThread: vi.fn<(threadId: string) => void>(),
  dbGetProject: vi.fn<() => undefined>(),
  dbGetProjectNotes: vi.fn<() => undefined>(),
  dbGetProjects: vi.fn<() => never[]>(() => []),
  dbGetState: vi.fn<() => string | null>(() => null),
  dbGetThread: vi.fn<() => undefined>(),
  dbGetThreads: vi.fn<() => never[]>(() => []),
  dbInsertScheduleRun: vi.fn<() => undefined>(),
  dbInterruptScheduleRuns: vi.fn<() => undefined>(),
  dbIsThreadPurgeEligible: vi.fn<() => boolean>(() => false),
  dbListThreadIds: vi.fn<() => string[]>(() => mocks.liveThreadIds),
  dbSelectPurgeCandidateThreadIds: vi.fn<() => string[]>(() => []),
  dbUpdateScheduleRun: vi.fn<() => undefined>(),
  dbUpsertThread: vi.fn<() => undefined>(),
  onThreadsDeleted: vi.fn<(listener: (threadIds: readonly string[]) => void) => () => void>(
    (listener) => {
      mocks.threadsDeletedListeners.push(listener);
      return () => {
        const index = mocks.threadsDeletedListeners.indexOf(listener);
        if (index >= 0) mocks.threadsDeletedListeners.splice(index, 1);
      };
    },
  ),
}));

vi.mock("@/host/app-controls", () => ({
  AppControlsMcpIngress: class {
    info: { url: string; token: string } | null = null;
    start = vi.fn<() => Promise<{ url: string; token: string }>>(() =>
      Promise.resolve({ url: "http://127.0.0.1:0/mcp", token: "token" }).then((info) => {
        // Mirrors the real ingress: the MCP endpoint only exists once the
        // start settles, so the supervisor env appears no earlier.
        this.info = info;
        return info;
      }),
    );
    constructor() {
      mocks.ingressInstances.push(this as never);
    }
    getInfo = () => this.info;
    observeSupervisorEvent = () => {};
    dispose = () => {};
  },
  buildSharedAppControlsIngressDeps: () => ({
    createThread: vi.fn<() => Promise<null>>(async () => null),
  }),
  createAppControlsSupervisorCaller: (call: unknown) => call,
}));

vi.mock("@/host/gitState", () => ({
  createGitStateExecutor: () => ({}),
  GitStateService: class {
    start = () => {};
    dispose = () => {};
    observeSupervisorEvent = () => {};
    applyObservedPullRequest = () => {};
  },
}));

vi.mock("@/host/prWatch", () => ({
  buildPrWatchExecutionDeps: () => ({}),
  createDevicePrWatchService: () => ({
    start: () => {},
    dispose: () => {},
    observeSupervisorEvent: () => {},
  }),
}));

vi.mock("@/host/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/host/schedules")>();
  return {
    ScheduleRunCoordinator: actual.ScheduleRunCoordinator,
    createDeviceScheduleService: (options: { runTask(task: ScheduledTask): Promise<string> }) => {
      mocks.runScheduleTask = options.runTask;
      return { start: () => {}, dispose: () => {} };
    },
    ensureHomeProjectRow: () => ({
      id: "fixture-home",
      name: "Fixture",
      location: { kind: "posix", path: "/synthetic" },
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  };
});

const committedEdit: SettingsMutationResult = {
  status: "committed",
  authorityId: "fixture-authority",
  sequence: 0,
  changes: [],
  revisions: {},
};

function fileBackedEditSettingsField(
  settingsPath: string,
): BackendDurableServicesOptions["editSettingsField"] {
  return async (field, compute) => {
    const current = readSharedSettingsFile(settingsPath);
    const value = compute(current);
    writeSharedSettingsFile(settingsPath, { ...current, [field]: value } as never);
    return committedEdit;
  };
}

function createDurable(
  overrides: Partial<BackendDurableServicesOptions> = {},
): BackendDurableServices {
  return new BackendDurableServices({
    appVersion: "test",
    hostId: "device-1",
    supervisor: {
      call: vi.fn<(name: string, payload: unknown) => Promise<null>>(async () => null),
    },
    getSharedSettings: () => ({}),
    writeSharedSettings: () => {},
    editSettingsField: async () => committedEdit,
    sendThreadCommand: () => true,
    publishProjectsChanged: () => {},
    hasRendererWindow: true,
    openThreadInUi: () => true,
    notifyUser: vi.fn<() => Promise<{ delivered: true }>>(async () => ({ delivered: true })),
    checkForUpdate: vi.fn<() => Promise<{ supported: true }>>(async () => ({ supported: true })),
    onGitPatch: () => {},
    ...overrides,
  } as unknown as BackendDurableServicesOptions);
}

describe("headless routing durability", () => {
  it("still confirms a persistence failure if diagnostic reporting itself throws", async () => {
    const error = new Error("Fixture persistence failed");
    const confirm = vi.fn<() => Promise<null>>(async () => null);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const durable = createDurable({
      getSharedSettings: () => defaultSharedSettings,
      editSettingsField: () => Promise.reject(error),
      supervisor: { call: confirm } as unknown as BackendDurableServicesOptions["supervisor"],
      reportError: () => {
        throw new Error("Fixture diagnostics failed");
      },
    });
    try {
      expect(() =>
        durable.observeSupervisorEvent({
          type: "crossagent-routing-override-changed",
          requestId: "fixture-failure",
          change: { action: "remove", tags: ["review"] },
        }),
      ).not.toThrow();
      // The edit commits on the authority queue, so the acknowledgement
      // follows its settlement asynchronously.
      await vi.waitFor(() =>
        expect(confirm).toHaveBeenCalledExactlyOnceWith("confirmCrossagentRoutingOverride", {
          requestId: "fixture-failure",
          ok: false,
          error: error.message,
        }),
      );
    } finally {
      try {
        await durable.dispose();
      } finally {
        warning.mockRestore();
      }
    }
  });

  it("acknowledges a failed write as failure instead of hanging or reporting success", async () => {
    const reportError = vi.fn<(error: unknown) => void>();
    let durable!: BackendDurableServices;
    const persistence = new RoutingOverridePersistence({
      emit: (event) => durable.observeSupervisorEvent(event),
      invalidateSettings: () => {},
      timeoutMs: 25,
    });
    const confirm = vi.fn<(name: string, payload: unknown) => Promise<null>>(
      async (_name, payload) => {
        persistence.confirm(payload as ConfirmCrossagentRoutingOverridePayload);
        return null;
      },
    );
    const error = new Error("Fixture disk is read-only");
    durable = createDurable({
      hasRendererWindow: false,
      supervisor: { call: confirm } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
      editSettingsField: () => Promise.reject(error),
      reportError,
    });
    try {
      await expect(persistence.persist({ action: "remove", tags: ["review"] })).rejects.toThrow(
        error.message,
      );
      expect(confirm).toHaveBeenCalledExactlyOnceWith("confirmCrossagentRoutingOverride", {
        requestId: expect.any(String),
        ok: false,
        error: error.message,
      });
      expect(reportError).toHaveBeenCalledExactlyOnceWith(error);
    } finally {
      persistence.dispose();
      await durable.dispose();
    }
  });

  it("reports a rejected acknowledgement without leaking an unhandled rejection", async () => {
    const error = new Error("Fixture supervisor stopped");
    const reportError = vi.fn<(error: unknown) => void>();
    const durable = createDurable({
      getSharedSettings: () => defaultSharedSettings,
      supervisor: {
        call: vi.fn<() => Promise<never>>(async () => {
          throw error;
        }),
      } as unknown as BackendDurableServicesOptions["supervisor"],
      reportError,
    });
    try {
      expect(
        durable.observeSupervisorEvent({
          type: "crossagent-routing-override-changed",
          requestId: "fixture-request",
          change: { action: "remove", tags: ["review"] },
        }),
      ).toBe(true);
      await vi.waitFor(() => expect(reportError).toHaveBeenCalledExactlyOnceWith(error));
    } finally {
      await durable.dispose();
    }
  });

  it("persists and acknowledges set/remove without an Electron observer", async () => {
    const root = mkdtempSync(join(tmpdir(), "routing-owner-"));
    const settingsPath = join(root, "settings.json");
    let durable!: BackendDurableServices;
    const persistence = new RoutingOverridePersistence({
      emit: (event) => durable.observeSupervisorEvent(event),
      invalidateSettings: () => {},
      timeoutMs: 25,
    });
    const confirm = vi.fn<(name: string, payload: unknown) => Promise<null>>(
      async (name, payload) => {
        expect(name).toBe("confirmCrossagentRoutingOverride");
        // The acknowledgement must arrive after the real atomic file write.
        expect(readSharedSettingsFile(settingsPath).crossagentRoutingOverrides).toEqual(expected);
        persistence.confirm(payload as ConfirmCrossagentRoutingOverridePayload);
        return null;
      },
    );
    const override = {
      tags: ["review"],
      agentKind: "fixture-agent",
      modelId: "small",
      updatedAt: 1,
    };
    let expected = [override];
    durable = createDurable({
      hasRendererWindow: false,
      supervisor: { call: confirm } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => readSharedSettingsFile(settingsPath),
      editSettingsField: fileBackedEditSettingsField(settingsPath),
    });
    try {
      await expect(persistence.persist({ action: "set", override })).resolves.toBeUndefined();
      expect(readSharedSettingsFile(settingsPath).crossagentRoutingOverrides).toEqual([override]);
      expected = [];
      await expect(
        persistence.persist({ action: "remove", tags: ["review"] }),
      ).resolves.toBeUndefined();
      expect(confirm).toHaveBeenCalledTimes(2);
    } finally {
      persistence.dispose();
      await durable.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("BackendDurableServices host-local invalidation", () => {
  it("publishes the scheduled run's thread id and created home project through the narrow callbacks", async () => {
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const publishProjectsChanged = vi.fn<() => void>();
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async (name) =>
      name === "getAgentStatuses"
        ? agentStatusesResponseSchema.parse({ fromCache: true, windows: [], wsl: [] })
        : null,
    );
    const durable = createDurable({
      supervisor: { call } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
      publishThreadsChanged,
      publishProjectsChanged,
    });
    const task: ScheduledTask = {
      id: "fixture-schedule",
      name: "Fixture",
      prompt: "Synthetic task",
      agentKind: "fixture-agent",
      config: { model: "fixture-model" },
      recurrence: { kind: "hourly", minute: 0 },
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      lastCompletedAt: null,
      lastStatus: "never",
      lastResult: null,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    try {
      const completion = mocks.runScheduleTask!(task);
      void completion.catch(() => undefined);
      await vi.waitFor(() => expect(dbUpsertThread).toHaveBeenCalledOnce());
      const created = vi.mocked(dbUpsertThread).mock.calls[0]![0] as Thread;
      expect(publishThreadsChanged).toHaveBeenCalledExactlyOnceWith([created.id]);
      // The Home row did not exist, so its creation is published too.
      expect(publishProjectsChanged).toHaveBeenCalledTimes(1);

      durable.observeSupervisorEvent({
        type: "thread-state",
        threadId: created.id,
        status: "working",
        attention: "none",
        canResumeWithConfig: false,
      });
      durable.observeSupervisorEvent({
        type: "thread-state",
        threadId: created.id,
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      });
      await expect(completion).resolves.toBe("");
    } finally {
      await durable.dispose();
    }
  });
});

describe("BackendDurableServices thread housekeeping", () => {
  it("runs exactly one host-policy sweep when background services start", async () => {
    vi.mocked(dbSelectPurgeCandidateThreadIds).mockReturnValue([]);
    const durable = createDurable({
      supervisor: {
        call: vi.fn<(name: string, payload: unknown) => Promise<null>>(async () => null),
        runThreadMutation: <T>(_threadId: string, operation: () => Promise<T>) => operation(),
      } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
    });
    try {
      durable.startBackgroundServices();
      durable.startBackgroundServices();
      await vi.waitFor(() => expect(dbArchiveDoneThreads).toHaveBeenCalledTimes(1));
      expect(dbSelectPurgeCandidateThreadIds).toHaveBeenCalledTimes(1);
    } finally {
      await durable.dispose();
    }
  });

  it("purges through the confirmed close, custody delete, and bounded publication", async () => {
    vi.mocked(dbSelectPurgeCandidateThreadIds).mockReturnValue(["t-old"]);
    vi.mocked(dbIsThreadPurgeEligible).mockReturnValue(true);
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async (name) =>
      name === "closeThreadConfirmed" ? { confirmed: true } : null,
    );
    const runThreadMutation = vi.fn<
      (threadId: string, operation: () => Promise<unknown>) => Promise<unknown>
    >((_threadId, operation) => operation());
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const durable = createDurable({
      supervisor: {
        call,
        runThreadMutation,
      } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
      publishThreadsChanged,
    });
    try {
      durable.startThreadHousekeeping();
      await vi.waitFor(() => expect(dbDeleteThread).toHaveBeenCalledWith("t-old"));
      expect(runThreadMutation).toHaveBeenCalledWith("t-old", expect.any(Function));
      expect(call).toHaveBeenCalledWith(
        "closeThreadConfirmed",
        { threadId: "t-old" },
        {
          startIfNeeded: false,
        },
      );
      expect(publishThreadsChanged).toHaveBeenCalledExactlyOnceWith(["t-old"]);
    } finally {
      await durable.dispose();
    }
  });

  it("purges with no supervisor running and never starts one (H2)", async () => {
    vi.mocked(dbSelectPurgeCandidateThreadIds).mockReturnValue(["t-cold"]);
    vi.mocked(dbIsThreadPurgeEligible).mockReturnValue(true);
    const call = vi.fn<() => Promise<never>>(async () => {
      throw new SupervisorUnavailableError();
    });
    const isSupervisorProvenAbsent = vi.fn<() => boolean>(() => true);
    const durable = createDurable({
      supervisor: {
        call,
        runThreadMutation: <T>(_threadId: string, operation: () => Promise<T>) => operation(),
        isSupervisorProvenAbsent,
      } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
    });
    try {
      durable.startThreadHousekeeping();
      await vi.waitFor(() => expect(dbDeleteThread).toHaveBeenCalledWith("t-cold"));
      expect(call).toHaveBeenCalledWith(
        "closeThreadConfirmed",
        { threadId: "t-cold" },
        {
          startIfNeeded: false,
        },
      );
      expect(isSupervisorProvenAbsent).toHaveBeenCalled();
    } finally {
      await durable.dispose();
    }
  });

  it("skips purge when a disconnected child or transition cannot prove absence (H2)", async () => {
    vi.mocked(dbSelectPurgeCandidateThreadIds).mockReturnValue(["t-transition"]);
    vi.mocked(dbIsThreadPurgeEligible).mockReturnValue(true);
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const reportError = vi.fn<(error: unknown) => void>();
    const durable = createDurable({
      supervisor: {
        call: vi.fn<() => Promise<never>>(async () => {
          throw new SupervisorUnavailableError();
        }),
        runThreadMutation: <T>(_threadId: string, operation: () => Promise<T>) => operation(),
        isSupervisorProvenAbsent: () => false,
      } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
      publishThreadsChanged,
      reportError,
    });
    try {
      durable.startThreadHousekeeping();
      await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
      expect(dbDeleteThread).not.toHaveBeenCalled();
      expect(publishThreadsChanged).not.toHaveBeenCalled();
    } finally {
      await durable.dispose();
    }
  });

  it("cancels and joins a held retirement before disposal resolves, with no later DB touch (H4)", async () => {
    vi.mocked(dbSelectPurgeCandidateThreadIds).mockReturnValue(["t-held"]);
    vi.mocked(dbIsThreadPurgeEligible).mockReturnValue(true);
    const entered = Promise.withResolvers<void>();
    const held = Promise.withResolvers<{ confirmed: boolean }>();
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => {
      entered.resolve();
      return held.promise;
    });
    const publishThreadsChanged = vi.fn<(threadIds: readonly string[]) => void>();
    const eligibleCallsBeforeDispose = vi.mocked(dbIsThreadPurgeEligible).mock.calls.length;
    const durable = createDurable({
      supervisor: {
        call,
        runThreadMutation: <T>(_threadId: string, operation: () => Promise<T>) => operation(),
        isSupervisorProvenAbsent: () => false,
      } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
      publishThreadsChanged,
    });
    durable.startThreadHousekeeping();
    await entered.promise;
    const deletesBefore = vi.mocked(dbDeleteThread).mock.calls.length;
    const readsWhileHeld = vi.mocked(dbIsThreadPurgeEligible).mock.calls.length;

    let disposed = false;
    const disposal = durable.dispose().then(() => {
      disposed = true;
    });
    await Promise.resolve();
    // The owner joins the held retirement instead of closing underneath it.
    expect(disposed).toBe(false);

    held.resolve({ confirmed: true });
    await disposal;
    expect(disposed).toBe(true);
    // Cancellation won after the await: no eligibility re-read, no delete, no publication.
    expect(vi.mocked(dbIsThreadPurgeEligible).mock.calls.length).toBe(readsWhileHeld);
    expect(vi.mocked(dbDeleteThread).mock.calls.length).toBe(deletesBefore);
    expect(publishThreadsChanged).not.toHaveBeenCalled();
    expect(vi.mocked(dbIsThreadPurgeEligible).mock.calls.length).toBeGreaterThan(
      eligibleCallsBeforeDispose,
    );
  });
});

describe("BackendDurableServices startIngress", () => {
  it("cancels a schedule waiting for capabilities and joins its continuation before disposal resolves", async () => {
    const lookup = Promise.withResolvers<ReturnType<typeof agentStatusesResponseSchema.parse>>();
    const entered = Promise.withResolvers<void>();
    const call = vi.fn<(name: string, payload: unknown) => Promise<unknown>>((name) => {
      if (name === "getAgentStatuses") {
        entered.resolve();
        return lookup.promise;
      }
      return Promise.resolve({});
    });
    const durable = createDurable({
      supervisor: { call } as unknown as BackendDurableServicesOptions["supervisor"],
      getSharedSettings: () => defaultSharedSettings,
    });
    const task: ScheduledTask = {
      id: "fixture-schedule",
      name: "Fixture",
      prompt: "Synthetic task",
      agentKind: "fixture-agent",
      config: { model: "fixture-model" },
      recurrence: { kind: "hourly", minute: 0 },
      enabled: true,
      nextRunAt: null,
      lastRunAt: null,
      lastCompletedAt: null,
      lastStatus: "never",
      lastResult: null,
      lastError: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const completion = mocks.runScheduleTask!(task);
    void completion.catch(() => undefined);
    await entered.promise;
    let disposed = false;
    const disposal = Promise.resolve(durable.dispose()).then(() => {
      disposed = true;
    });
    await Promise.resolve();
    expect.soft(disposed).toBe(false);
    lookup.resolve(agentStatusesResponseSchema.parse({ fromCache: true, windows: [], wsl: [] }));
    await disposal;
    // Also lets the pre-fix composition's abandoned coordinator continuation run.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect.soft(dbUpsertThread).not.toHaveBeenCalled();
    expect.soft(call.mock.calls.filter(([name]) => name === "startThread")).toHaveLength(0);
    // Settle the old implementation's synthetic run so a red does not leave
    // a pending fixture promise; the fixed coordinator has already interrupted it.
    const launched = call.mock.calls.find(([name]) => name === "startThread")?.[1] as
      | { threadId: string }
      | undefined;
    if (launched)
      durable.observeSupervisorEvent({
        type: "thread-state",
        threadId: launched.threadId,
        status: "finished",
        attention: "none",
        canResumeWithConfig: false,
      });
    await completion.catch(() => undefined);
  });

  it("shares one start attempt across concurrent callers", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    let release!: (info: { url: string; token: string }) => void;
    ingress.start.mockImplementationOnce(
      () =>
        new Promise<{ url: string; token: string }>((resolve) => {
          release = resolve;
        }),
    );

    const first = durable.startIngress();
    const second = durable.startIngress();
    expect(ingress.start).toHaveBeenCalledTimes(1);

    release({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    // A settled start is reused, never re-run.
    await durable.startIngress();
    expect(ingress.start).toHaveBeenCalledTimes(1);
  });

  it("retries ingress start after a failed attempt", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    ingress.start
      .mockRejectedValueOnce(new Error("Port 0 is unavailable."))
      .mockResolvedValueOnce({ url: "http://127.0.0.1:0/mcp", token: "token" });

    await expect(durable.startIngress()).rejects.toThrow("Port 0 is unavailable.");
    // The failure must not latch the service off: the next caller retries.
    await expect(durable.startIngress()).resolves.toBeUndefined();
    expect(ingress.start).toHaveBeenCalledTimes(2);
  });

  it("gives concurrent callers the same failed attempt and retries afterwards", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    ingress.start.mockRejectedValueOnce(new Error("Ingress start failed."));

    const outcomes = await Promise.allSettled([
      durable.startIngress(),
      durable.startIngress(),
      durable.startIngress(),
    ]);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    expect(ingress.start).toHaveBeenCalledTimes(1);

    ingress.start.mockResolvedValueOnce({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await expect(durable.startIngress()).resolves.toBeUndefined();
    expect(ingress.start).toHaveBeenCalledTimes(2);
  });

  it("exposes the app-controls supervisor env only once ingress is up", async () => {
    const durable = createDurable();
    const ingress = mocks.ingressInstances[mocks.ingressInstances.length - 1]!;
    let release!: (info: { url: string; token: string }) => void;
    ingress.start.mockImplementationOnce(
      () =>
        new Promise<{ url: string; token: string }>((resolve) => {
          release = (info) => {
            ingress.info = info;
            resolve(info);
          };
        }),
    );

    // While the start is in flight there is no MCP endpoint, so a supervisor
    // spawned now would have to start without the app-controls env — which is
    // exactly why supervisor start-up awaits this gate.
    expect(durable.getSupervisorExtraEnv()).toEqual({});

    const started = durable.startIngress();
    expect(durable.getSupervisorExtraEnv()).toEqual({});
    release({ url: "http://127.0.0.1:0/mcp", token: "token" });
    await started;

    expect(durable.getSupervisorExtraEnv()).toEqual({
      PORACODE_APP_CONTROLS_MCP_URL: "http://127.0.0.1:0/mcp",
      PORACODE_APP_CONTROLS_MCP_TOKEN: "token",
    });
  });
});

describe("BackendDurableServices attachment reclamation", () => {
  it("reclaims a deleted thread's attachment directory through the DB seam and unsubscribes on dispose", async () => {
    const root = mkdtempSync(join(tmpdir(), "reclaim-wiring-"));
    try {
      const attachmentsDir = join(root, "attachments");
      mkdirSync(join(attachmentsDir, "gone-12"), { recursive: true });
      writeFileSync(join(attachmentsDir, "gone-12", "a.png"), "a");
      mocks.liveThreadIds = [];
      const durable = createDurable({ attachmentsDir });
      expect(mocks.threadsDeletedListeners.length).toBeGreaterThan(0);
      const listener = mocks.threadsDeletedListeners.at(-1)!;
      listener(["gone-12"]);
      await vi.waitFor(() => expect(existsSync(join(attachmentsDir, "gone-12"))).toBe(false));
      // Dispose owns the subscription: a late seam notification is a no-op.
      await durable.dispose();
      const listenersBefore = mocks.threadsDeletedListeners.length;
      listener(["gone-12"]);
      expect(mocks.threadsDeletedListeners.length).toBe(listenersBefore);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stays unsubscribed when no attachments root is wired", async () => {
    const durable = createDurable();
    try {
      expect(mocks.threadsDeletedListeners).toHaveLength(0);
    } finally {
      await durable.dispose();
    }
  });
});
