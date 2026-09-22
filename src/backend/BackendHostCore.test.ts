import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { SupervisorEvent } from "@/shared/ipc";
import type { SupervisorClient } from "@/host/supervisor/SupervisorClient";
import type {
  PersistOutcome,
  PersistSupervisorEventOptions,
} from "@/host/remote/server/runtimePersistence";

const mocks = vi.hoisted(() => ({
  initDatabase: vi.fn<(path: string, options?: { schemaMode?: "migrate" | "validate" }) => void>(),
  closeDatabase: vi.fn<() => void>(),
  attachRuntimePersistenceDurableGapFromCurrentConnection: vi.fn<() => void>(),
  armRuntimeThreadForLaunch: vi.fn<(threadId: string) => void>(),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
  dbGetProjects: vi.fn<() => { id: string }[]>(() => []),
  dbUpsertProject: vi.fn<(project: { id: string }) => void>(),
  dbTruncateThreadRuntimeAfter: vi.fn<
    (
      threadId: string,
      itemId: string,
    ) => {
      truncated: boolean;
      removedCompletedTurnAnchors: string[];
    }
  >(),
  dbGetThread: vi.fn<(threadId: string) => unknown>(),
  dbGetProject: vi.fn<(projectId: string) => unknown>(),
  dbHasThreadRuntimeItem: vi.fn<(threadId: string, itemId: string) => boolean>(),
  dbClaimCheckpointRevertOperation: vi.fn<(input: unknown) => unknown>(),
  dbGetCheckpointRevertOperation: vi.fn<(operationKey: string) => unknown>(),
  dbUpdateCheckpointRevertPhases: vi.fn<() => void>(),
  getRuntimeThreadGapDescriptor: vi.fn<(threadId: string) => unknown>(),
  acknowledgeRuntimeThreadGap: vi.fn<(threadId: string, token: string) => Promise<unknown>>(),
  runThreadMutation:
    vi.fn<(threadId: string, operation: () => Promise<unknown>) => Promise<unknown>>(),
  persistSupervisorEvent:
    vi.fn<
      (
        event: SupervisorEvent,
        options?: PersistSupervisorEventOptions,
      ) => PersistOutcome<SupervisorEvent>
    >(),
  acknowledgeCanonicalFlow: vi.fn<(flowSeq: number) => void>(),
  getPeerCanonicalCapabilities: vi.fn<SupervisorClient["getPeerCanonicalCapabilities"]>(),
  setEventBackpressured: vi.fn<SupervisorClient["setEventBackpressured"]>(),
  start: vi.fn<() => void>(),
  restart: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  supervisorCall: vi.fn<(type: string, payload: unknown, options?: unknown) => Promise<unknown>>(),
  supervisorOptions: null as null | {
    onEvent(event: SupervisorEvent): void;
    onReset(): void;
    onFlowControlReady?(): void;
    prepareStartThread?(payload: { threadId?: string }): { threadId?: string };
  },
  supervisorConstructorError: null as Error | null,
}));

vi.mock("@/host/db", () => ({
  initDatabase: mocks.initDatabase,
  closeDatabase: mocks.closeDatabase,
  attachRuntimePersistenceDurableGapFromCurrentConnection:
    mocks.attachRuntimePersistenceDurableGapFromCurrentConnection,
  armRuntimeThreadForLaunch: mocks.armRuntimeThreadForLaunch,
  getRuntimeThreadGapDescriptor: mocks.getRuntimeThreadGapDescriptor,
  acknowledgeRuntimeThreadGap: mocks.acknowledgeRuntimeThreadGap,
  addRuntimePersistenceHealthListener: vi.fn<() => () => void>(() => () => undefined),
  getRuntimePersistenceShutdownReport: vi.fn<() => null>(() => null),
  setRuntimePersistenceInFlightWindowBytes: vi.fn<(bytes: number | null) => void>(),
  dbMarkLiveThreadsInactive: mocks.dbMarkLiveThreadsInactive,
  dbGetProjects: mocks.dbGetProjects,
  dbUpsertProject: mocks.dbUpsertProject,
  dbTruncateThreadRuntimeAfter: mocks.dbTruncateThreadRuntimeAfter,
  dbGetThread: mocks.dbGetThread,
  dbGetProject: mocks.dbGetProject,
  dbHasThreadRuntimeItem: mocks.dbHasThreadRuntimeItem,
  dbClaimCheckpointRevertOperation: mocks.dbClaimCheckpointRevertOperation,
  dbGetCheckpointRevertOperation: mocks.dbGetCheckpointRevertOperation,
  dbUpdateCheckpointRevertPhases: mocks.dbUpdateCheckpointRevertPhases,
  dbAppendThreadTerminalOutput: vi.fn<() => void>(),
  dbClearThreadTerminalScrollback: vi.fn<() => void>(),
}));

vi.mock("@/host/remote/server/runtimePersistence", () => ({
  persistSupervisorEvent: mocks.persistSupervisorEvent,
}));

vi.mock("@/host/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = mocks.start;
    restart = mocks.restart;
    dispose = mocks.dispose;
    call = mocks.supervisorCall;
    acknowledgeCanonicalFlow = mocks.acknowledgeCanonicalFlow;
    getPeerCanonicalCapabilities = mocks.getPeerCanonicalCapabilities;
    setEventBackpressured = mocks.setEventBackpressured;
    runThreadMutation = mocks.runThreadMutation;

    constructor(options: { onEvent(event: SupervisorEvent): void; onReset(): void }) {
      if (mocks.supervisorConstructorError) throw mocks.supervisorConstructorError;
      mocks.supervisorOptions = options;
    }
  },
}));

import { BackendHostCore } from "./BackendHostCore";

describe("BackendHostCore", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mocks.supervisorOptions = null;
    mocks.supervisorConstructorError = null;
    mocks.dbGetProjects.mockImplementation(() => []);
    mocks.dbUpsertProject.mockImplementation(() => undefined);
    mocks.persistSupervisorEvent.mockImplementation((event) => ({ kind: "publish", event }));
    mocks.getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: false,
      generation: null,
    });
    mocks.runThreadMutation.mockImplementation((_threadId, operation) =>
      Promise.resolve(operation()),
    );
  });

  it("negotiates canonical credit when the supervisor advertises and clears it for a legacy restart", async () => {
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });
    mocks.getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: true,
      generation: "boot-1",
      maxInFlightBytes: 17 * 1024 * 1024,
      maxEnvelopeBytes: 8 * 1024 * 1024,
    });
    mocks.supervisorOptions?.onFlowControlReady?.();
    expect(mocks.setEventBackpressured).toHaveBeenLastCalledWith(false, undefined, {
      canonicalCreditBytes: 17 * 1024 * 1024,
    });
    mocks.getPeerCanonicalCapabilities.mockReturnValue({
      supportsCanonicalCredit: false,
      generation: null,
    });
    mocks.supervisorOptions?.onFlowControlReady?.();
    expect(mocks.setEventBackpressured).toHaveBeenLastCalledWith(false, undefined, {});
    await host.dispose();
  });

  it("owns database and supervisor lifecycle", async () => {
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      markLiveThreadsInactiveOnOpen: true,
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    await host.startSupervisor();
    await host.restartSupervisor();
    await host.dispose();
    host.closeDatabase();

    expect(mocks.initDatabase).toHaveBeenCalledExactlyOnceWith("/data/state.sqlite");
    // The eager runtime-owned durable-gap open runs right after the migrate
    // open, before any canonical event can be admitted.
    expect(mocks.attachRuntimePersistenceDurableGapFromCurrentConnection).toHaveBeenCalledOnce();
    expect(mocks.dbMarkLiveThreadsInactive).toHaveBeenCalledOnce();
    // The canonical Home row is persisted at startup, before any catalog or
    // launch request can observe an absent row.
    expect(mocks.dbGetProjects).toHaveBeenCalled();
    expect(mocks.dbUpsertProject).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: HOME_PROJECT_ID }),
      0,
    );
    // startSupervisor is idempotent (start once); restartSupervisor forces.
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("persists each supervisor event before publishing it", async () => {
    const order: string[] = [];
    mocks.persistSupervisorEvent.mockImplementation((event) => {
      order.push("persist");
      return { kind: "publish", event };
    });
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: () => order.push("publish"),
      onReset: vi.fn<() => void>(),
    });
    const event: SupervisorEvent = { type: "git-changed", projectId: "project" };

    mocks.supervisorOptions?.onEvent(event);
    await host.dispose();

    expect(order).toEqual(["persist", "publish"]);
  });

  describe("persistence admission publication", () => {
    function createHost(onEvent: (event: SupervisorEvent) => void): BackendHostCore {
      return new BackendHostCore({
        baseDir: "/data",
        dbPath: "/data/state.sqlite",
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath: "/supervisor.cjs",
          wslHelpersDir: "/wsl",
          secretStorageKey: "secret",
        },
        onEvent,
        onReset: vi.fn<() => void>(),
      });
    }

    function canonicalBatch(): Extract<SupervisorEvent, { type: "thread-runtime-events" }> {
      return {
        type: "thread-runtime-events",
        threadId: "thread",
        flowSeq: 7,
        events: ["accepted", "refused"].map((delta) => ({
          type: "content.delta",
          threadId: "thread",
          itemId: "item",
          stream: "command_output",
          delta,
        })),
      };
    }

    it("acknowledges an explicit refusal only after admission and never publishes it", async () => {
      const order: string[] = [];
      const publish = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(publish);
      mocks.persistSupervisorEvent.mockImplementation(() => {
        expect(mocks.acknowledgeCanonicalFlow).not.toHaveBeenCalled();
        order.push("admission-refused");
        return { kind: "withhold", reason: "refused", threadIds: ["thread"] };
      });
      mocks.acknowledgeCanonicalFlow.mockImplementation(() => order.push("ack"));
      mocks.supervisorOptions!.onEvent(canonicalBatch());
      expect(publish).not.toHaveBeenCalled();
      expect(mocks.acknowledgeCanonicalFlow).toHaveBeenCalledExactlyOnceWith(7);
      expect(order).toEqual(["admission-refused", "ack"]);
      await host.dispose();
    });

    it("publishes the admitted prefix while acknowledging the original envelope", async () => {
      const publish = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(publish);
      const original = canonicalBatch();
      const accepted: SupervisorEvent = { ...original, events: original.events.slice(0, 1) };
      mocks.persistSupervisorEvent.mockReturnValue({
        kind: "publish-partial",
        event: accepted,
        droppedEvents: 1,
        droppedBytes: 32,
      });
      mocks.supervisorOptions!.onEvent(original);
      expect(publish).toHaveBeenCalledExactlyOnceWith(accepted);
      expect(mocks.acknowledgeCanonicalFlow).toHaveBeenCalledExactlyOnceWith(7);
      expect(original.events).toHaveLength(2);
      await host.dispose();
    });

    it("publishes a deferred reset only when persistence confirms completion", async () => {
      const publish = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(publish);
      const reset: SupervisorEvent = { type: "thread-reset", threadId: "thread" };
      let complete: PersistSupervisorEventOptions["publishDeferredEvent"];
      mocks.persistSupervisorEvent.mockImplementation((_event, options) => {
        complete = options?.publishDeferredEvent;
        return { kind: "withhold", reason: "deferred-reset", threadIds: ["thread"] };
      });
      mocks.supervisorOptions!.onEvent(reset);
      expect(publish).not.toHaveBeenCalled();
      expect(complete).toBeTypeOf("function");
      complete!(reset);
      expect(publish).toHaveBeenCalledExactlyOnceWith(reset);
      expect(mocks.acknowledgeCanonicalFlow).not.toHaveBeenCalled();
      await host.dispose();
    });
  });

  it("closes the database when supervisor construction fails", () => {
    mocks.supervisorConstructorError = new Error("constructor failed");

    expect(
      () =>
        new BackendHostCore({
          baseDir: "/data",
          dbPath: "/data/state.sqlite",
          supervisor: {
            appVersion: "test",
            isDev: false,
            supervisorPath: "/supervisor.cjs",
            wslHelpersDir: "/wsl",
            secretStorageKey: "secret",
          },
          onEvent: vi.fn<(event: SupervisorEvent) => void>(),
          onReset: vi.fn<() => void>(),
        }),
    ).toThrow("constructor failed");
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("can validate a schema owned by the desktop main process", async () => {
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      databaseSchemaMode: "validate",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    expect(mocks.initDatabase).toHaveBeenCalledExactlyOnceWith("/data/state.sqlite", {
      schemaMode: "validate",
    });
    // A validate-only open never arms or binds durable evidence, and never
    // writes the canonical Home row (offline/import opens stay read-only).
    expect(mocks.attachRuntimePersistenceDurableGapFromCurrentConnection).not.toHaveBeenCalled();
    expect(mocks.dbGetProjects).not.toHaveBeenCalled();
    expect(mocks.dbUpsertProject).not.toHaveBeenCalled();
    await host.dispose();
  });

  it("composes the existing prepareStartThread and arms the durable touch before dispatch", async () => {
    const existingPrepare = vi.fn<
      (payload: { threadId?: string }) => { threadId?: string; preparedByMain?: boolean }
    >((payload) => ({
      ...payload,
      preparedByMain: true,
    }));
    const host = new BackendHostCore({
      baseDir: "/data",
      dbPath: "/data/state.sqlite",
      supervisor: {
        appVersion: "test",
        isDev: false,
        supervisorPath: "/supervisor.cjs",
        wslHelpersDir: "/wsl",
        secretStorageKey: "secret",
        prepareStartThread: existingPrepare as never,
      },
      onEvent: vi.fn<(event: SupervisorEvent) => void>(),
      onReset: vi.fn<() => void>(),
    });

    const prepare = mocks.supervisorOptions?.prepareStartThread;
    expect(prepare).toBeTypeOf("function");
    const prepared = prepare!({ threadId: "thread-1" }) as {
      threadId?: string;
      preparedByMain?: boolean;
    };
    // The existing callback is composed, not overwritten, and the durable
    // touch runs after it with the final thread id.
    expect(existingPrepare).toHaveBeenCalledExactlyOnceWith({ threadId: "thread-1" });
    expect(prepared).toMatchObject({ threadId: "thread-1", preparedByMain: true });
    expect(mocks.armRuntimeThreadForLaunch).toHaveBeenCalledExactlyOnceWith("thread-1");

    // A refused (unknown/storage-failed) touch propagates, so the supervisor
    // request rejects before `child.send`.
    mocks.armRuntimeThreadForLaunch.mockImplementationOnce(() => {
      throw new Error("durable touch refused");
    });
    expect(() => prepare!({ threadId: "thread-unknown" })).toThrow("durable touch refused");

    // A launch without a host-known thread id (supervisor allocates it) has no
    // touch target; admission covers its first canonical event instead.
    mocks.armRuntimeThreadForLaunch.mockClear();
    prepare!({});
    expect(mocks.armRuntimeThreadForLaunch).not.toHaveBeenCalled();
    await host.dispose();
  });

  describe("runtime gap acknowledgement", () => {
    function appliedResult() {
      return {
        outcome: "applied" as const,
        notice: {
          threadId: "thread-1",
          acknowledgedToken: "gap2:e11111111-1111-4111-8111-111111111111",
          source: "exact" as const,
          reason: "age" as const,
          refusedEvents: 1,
          refusedBytes: 10,
          acknowledgedCount: 1,
          firstAcknowledgedAt: 1,
          lastAcknowledgedAt: 1,
        },
        descriptor: {
          threadId: "thread-1",
          token: "gap2:e11111111-1111-4111-8111-111111111111",
          source: "exact" as const,
          reason: "age" as const,
          refusedEvents: 1,
          refusedBytes: 10,
          createdAt: 7,
        },
        supersededAcceptedEvents: 2,
      };
    }

    function createHost(options: {
      onEvent: (event: SupervisorEvent) => void;
      onRuntimeGapAcknowledged?: (threadId: string) => void;
    }): BackendHostCore {
      return new BackendHostCore({
        baseDir: "/data",
        dbPath: "/data/state.sqlite",
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath: "/supervisor.cjs",
          wslHelpersDir: "/wsl",
          secretStorageKey: "secret",
        },
        onEvent: options.onEvent,
        onReset: vi.fn<() => void>(),
        ...(options.onRuntimeGapAcknowledged
          ? { onRuntimeGapAcknowledged: options.onRuntimeGapAcknowledged }
          : {}),
      });
    }

    it("reads the current episode descriptor through the database layer", async () => {
      const host = createHost({ onEvent: vi.fn<(event: SupervisorEvent) => void>() });
      const descriptor = {
        threadId: "thread-1",
        token: "gap2:e11111111-1111-4111-8111-111111111111",
        source: "exact",
        reason: "age",
        refusedEvents: 2,
        refusedBytes: 20,
        createdAt: 7,
      };
      mocks.getRuntimeThreadGapDescriptor.mockReturnValue(descriptor);

      expect(host.getThreadRuntimeGap("thread-1")).toEqual(descriptor);
      expect(mocks.getRuntimeThreadGapDescriptor).toHaveBeenCalledExactlyOnceWith("thread-1");

      await host.dispose();
      expect(() => host.getThreadRuntimeGap("thread-1")).toThrow("shutting down");
    });

    it("acknowledges under the supervisor dispatch lock and only `applied` runs the reset + hook", async () => {
      const order: string[] = [];
      const onEvent = vi.fn<(event: SupervisorEvent) => void>((event) => {
        if (event.type === "thread-reset") order.push("reset");
      });
      const host = createHost({
        onEvent,
        onRuntimeGapAcknowledged: () => order.push("hook"),
      });
      mocks.acknowledgeRuntimeThreadGap.mockImplementation(async () => {
        order.push("commit");
        return {
          outcome: "applied",
          notice: {
            threadId: "thread-1",
            acknowledgedToken: "gap2:e11111111-1111-4111-8111-111111111111",
            source: "exact",
            reason: "age",
            refusedEvents: 2,
            refusedBytes: 20,
            acknowledgedCount: 1,
            firstAcknowledgedAt: 1,
            lastAcknowledgedAt: 1,
          },
          descriptor: {
            threadId: "thread-1",
            token: "gap2:e11111111-1111-4111-8111-111111111111",
            source: "exact",
            reason: "age",
            refusedEvents: 2,
            refusedBytes: 20,
            createdAt: 7,
          },
          supersededAcceptedEvents: 2,
        };
      });

      const result = await host.acknowledgeThreadRuntimeGap(
        "thread-1",
        "gap2:e11111111-1111-4111-8111-111111111111",
      );
      expect(result).toMatchObject({ outcome: "applied" });
      expect(mocks.runThreadMutation).toHaveBeenCalledOnce();
      expect(mocks.runThreadMutation.mock.calls[0]?.[0]).toBe("thread-1");
      expect(mocks.acknowledgeRuntimeThreadGap).toHaveBeenCalledExactlyOnceWith(
        "thread-1",
        "gap2:e11111111-1111-4111-8111-111111111111",
      );
      expect(order).toEqual(["commit", "reset", "hook"]);

      order.length = 0;
      mocks.acknowledgeRuntimeThreadGap.mockResolvedValue({ outcome: "stale", current: null });
      expect(
        await host.acknowledgeThreadRuntimeGap(
          "thread-1",
          "gap2:e00000000-0000-4000-8000-000000000000",
        ),
      ).toMatchObject({ outcome: "stale" });
      expect(order).toEqual([]);
      await host.dispose();
    });

    it("a throwing post-commit hook never turns an applied acknowledgement into a failure", async () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost({
        onEvent,
        onRuntimeGapAcknowledged: () => {
          throw new Error("hook exploded");
        },
      });
      mocks.acknowledgeRuntimeThreadGap.mockResolvedValue({
        outcome: "applied",
        notice: {
          threadId: "thread-1",
          acknowledgedToken: "gap2:e11111111-1111-4111-8111-111111111111",
          source: "exact",
          reason: "age",
          refusedEvents: 1,
          refusedBytes: 10,
          acknowledgedCount: 1,
          firstAcknowledgedAt: 1,
          lastAcknowledgedAt: 1,
        },
        descriptor: {
          threadId: "thread-1",
          token: "gap2:e11111111-1111-4111-8111-111111111111",
          source: "exact",
          reason: "age",
          refusedEvents: 1,
          refusedBytes: 10,
          createdAt: 7,
        },
        supersededAcceptedEvents: 0,
      });
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          host.acknowledgeThreadRuntimeGap(
            "thread-1",
            "gap2:e11111111-1111-4111-8111-111111111111",
          ),
        ).resolves.toMatchObject({ outcome: "applied" });
        expect(onEvent.mock.calls.some(([event]) => event.type === "thread-reset")).toBe(true);
      } finally {
        consoleError.mockRestore();
      }
      await host.dispose();
    });

    it("a throwing reset fan-out does not reject the applied ack or skip the hook", async () => {
      const order: string[] = [];
      const host = createHost({
        onEvent: vi.fn<(event: SupervisorEvent) => void>((event) => {
          if (event.type === "thread-reset") {
            order.push("reset");
            throw new Error("reset fan-out exploded");
          }
        }),
        onRuntimeGapAcknowledged: () => order.push("hook"),
      });
      mocks.acknowledgeRuntimeThreadGap.mockResolvedValue(appliedResult());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          host.acknowledgeThreadRuntimeGap(
            "thread-1",
            "gap2:e11111111-1111-4111-8111-111111111111",
          ),
        ).resolves.toMatchObject({ outcome: "applied" });
        // Both callbacks ran despite the first throwing, in publication order.
        expect(order).toEqual(["reset", "hook"]);
      } finally {
        consoleError.mockRestore();
      }
      await host.dispose();
    });

    it("a throwing hook does not suppress the reset fan-out", async () => {
      const order: string[] = [];
      const host = createHost({
        onEvent: vi.fn<(event: SupervisorEvent) => void>((event) => {
          if (event.type === "thread-reset") order.push("reset");
        }),
        onRuntimeGapAcknowledged: () => {
          order.push("hook");
          throw new Error("hook exploded");
        },
      });
      mocks.acknowledgeRuntimeThreadGap.mockResolvedValue(appliedResult());
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        await expect(
          host.acknowledgeThreadRuntimeGap(
            "thread-1",
            "gap2:e11111111-1111-4111-8111-111111111111",
          ),
        ).resolves.toMatchObject({ outcome: "applied" });
        expect(order).toEqual(["reset", "hook"]);
      } finally {
        consoleError.mockRestore();
      }
      await host.dispose();
    });
  });

  describe("truncateThreadRuntime", () => {
    function createHost(onEvent: (event: SupervisorEvent) => void): BackendHostCore {
      return new BackendHostCore({
        baseDir: "/data",
        dbPath: "/data/state.sqlite",
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath: "/supervisor.cjs",
          wslHelpersDir: "/wsl",
          secretStorageKey: "secret",
        },
        onEvent,
        onReset: vi.fn<() => void>(),
      });
    }

    it("publishes exactly one runtime.truncated event with the exact removed anchors", () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(onEvent);
      mocks.dbTruncateThreadRuntimeAfter.mockReturnValue({
        truncated: true,
        removedCompletedTurnAnchors: ["item-c", "item-d"],
      });

      const result = host.truncateThreadRuntime("thread-1", "item-b");

      expect(mocks.dbTruncateThreadRuntimeAfter).toHaveBeenCalledExactlyOnceWith(
        "thread-1",
        "item-b",
      );
      expect(onEvent).toHaveBeenCalledOnce();
      expect(onEvent.mock.calls[0]?.[0]).toEqual({
        type: "thread-runtime-event",
        threadId: "thread-1",
        event: {
          type: "runtime.truncated",
          threadId: "thread-1",
          itemId: "item-b",
          removedCompletedTurnAnchors: ["item-c", "item-d"],
        },
      });
      expect(result).toEqual({
        truncated: true,
        removedCompletedTurnAnchors: ["item-c", "item-d"],
      });
    });

    it("publishes even when an actual truncation removed no completed turns", () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(onEvent);
      mocks.dbTruncateThreadRuntimeAfter.mockReturnValue({
        truncated: true,
        removedCompletedTurnAnchors: [],
      });

      host.truncateThreadRuntime("thread-1", "item-b");

      expect(onEvent).toHaveBeenCalledOnce();
      expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
        type: "thread-runtime-event",
        event: { type: "runtime.truncated", removedCompletedTurnAnchors: [] },
      });
    });

    it("never publishes when the mutation was a no-op", () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(onEvent);
      mocks.dbTruncateThreadRuntimeAfter.mockReturnValue({
        truncated: false,
        removedCompletedTurnAnchors: [],
      });

      const result = host.truncateThreadRuntime("thread-1", "item-b");

      expect(onEvent).not.toHaveBeenCalled();
      expect(result).toEqual({ truncated: false, removedCompletedTurnAnchors: [] });
    });

    it("does not republish when a re-applied truncate becomes a no-op", () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(onEvent);
      mocks.dbTruncateThreadRuntimeAfter
        .mockReturnValueOnce({ truncated: true, removedCompletedTurnAnchors: ["item-c"] })
        .mockReturnValue({ truncated: false, removedCompletedTurnAnchors: [] });

      host.truncateThreadRuntime("thread-1", "item-b");
      host.truncateThreadRuntime("thread-1", "item-b");

      expect(onEvent).toHaveBeenCalledOnce();
    });

    it("never publishes when the transaction fails", () => {
      const onEvent = vi.fn<(event: SupervisorEvent) => void>();
      const host = createHost(onEvent);
      mocks.dbTruncateThreadRuntimeAfter.mockImplementation(() => {
        throw new Error("transaction failed");
      });

      expect(() => host.truncateThreadRuntime("thread-1", "item-b")).toThrow("transaction failed");
      expect(onEvent).not.toHaveBeenCalled();
    });
  });

  describe("compound revert delete-mid-revert revalidation", () => {
    function createRevertHost(): BackendHostCore {
      return new BackendHostCore({
        baseDir: "/data",
        dbPath: "/data/state.sqlite",
        supervisor: {
          appVersion: "test",
          isDev: false,
          supervisorPath: "/supervisor.cjs",
          wslHelpersDir: "/wsl",
          secretStorageKey: "secret",
        },
        onEvent: vi.fn<(event: SupervisorEvent) => void>(),
        onReset: vi.fn<() => void>(),
      });
    }

    function claimRow(operationKey: string, projectLocation: unknown) {
      return {
        operationKey,
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        numTurns: 0,
        projectLocationJson: JSON.stringify(projectLocation),
        configJson: null,
        providerAnchorJson: null,
        providerPhase: "pending" as const,
        filesPhase: "pending" as const,
        truncatePhase: "pending" as const,
        removedAnchors: [],
        outcome: "running" as const,
        createdAt: 1,
        updatedAt: 1,
      };
    }

    beforeEach(() => {
      mocks.dbGetThread.mockReturnValue({
        id: "thread-1",
        projectId: "project-1",
        status: "inactive",
      });
      mocks.dbHasThreadRuntimeItem.mockReturnValue(true);
      mocks.dbTruncateThreadRuntimeAfter.mockReturnValue({
        truncated: false,
        removedCompletedTurnAnchors: [],
      });
      mocks.supervisorCall.mockResolvedValue(undefined);
    });

    it("skips the file restore when the project was deleted mid-revert", async () => {
      const host = createRevertHost();
      const frozenLocation = { kind: "local", linuxPath: "/repo" };
      mocks.dbClaimCheckpointRevertOperation.mockReturnValue({
        kind: "claimed",
        row: claimRow("op-1", frozenLocation),
      });
      // The delete won between the claim and the file-restore phase.
      mocks.dbGetProject.mockReturnValue(null);

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result.outcome).toBe("completed");
      expect(result.filesPhase).toBe("skipped_no_location");
      const restored = mocks.supervisorCall.mock.calls.filter(
        ([type]) => type === "restoreFileCheckpoint",
      );
      expect(restored).toEqual([]);
    });

    it("skips the file restore when the project moved off the frozen location", async () => {
      const host = createRevertHost();
      mocks.dbClaimCheckpointRevertOperation.mockReturnValue({
        kind: "claimed",
        row: claimRow("op-1", { kind: "local", linuxPath: "/repo" }),
      });
      mocks.dbGetProject.mockReturnValue({
        id: "project-1",
        location: { kind: "local", linuxPath: "/moved-elsewhere" },
      });

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result.filesPhase).toBe("skipped_no_location");
      expect(
        mocks.supervisorCall.mock.calls.filter(([type]) => type === "restoreFileCheckpoint"),
      ).toEqual([]);
    });

    it("still restores when the thread and project match the frozen plan", async () => {
      const host = createRevertHost();
      const frozenLocation = { kind: "local", linuxPath: "/repo" };
      mocks.dbClaimCheckpointRevertOperation.mockReturnValue({
        kind: "claimed",
        row: claimRow("op-1", frozenLocation),
      });
      mocks.dbGetProject.mockReturnValue({ id: "project-1", location: frozenLocation });

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result.filesPhase).toBe("completed");
      expect(
        mocks.supervisorCall.mock.calls.some(([type]) => type === "restoreFileCheckpoint"),
      ).toBe(true);
    });

    it("settles a crash-orphaned running row when nothing is left to revert", async () => {
      const host = createRevertHost();
      // The checkpoint is gone: a previous attempt already truncated the tail
      // and crashed before settling its journal row.
      mocks.dbHasThreadRuntimeItem.mockReturnValue(false);
      mocks.dbGetCheckpointRevertOperation.mockReturnValue(claimRow("op-1", { kind: "local" }));

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result.outcome).toBe("noop");
      expect(result.replayed).toBe(false);
      expect(mocks.dbUpdateCheckpointRevertPhases).toHaveBeenCalledWith("op-1", {
        outcome: "completed",
        truncatePhase: "noop",
        removedAnchors: [],
      });
    });

    it("replays a settled ambiguous row when the checkpoint is already gone", async () => {
      const host = createRevertHost();
      mocks.dbHasThreadRuntimeItem.mockReturnValue(false);
      mocks.dbGetCheckpointRevertOperation.mockReturnValue({
        ...claimRow("op-1", { kind: "local" }),
        numTurns: 2,
        outcome: "ambiguous" as const,
        providerPhase: "ambiguous" as const,
        filesPhase: "completed" as const,
        truncatePhase: "completed" as const,
        removedAnchors: ["turn-a"],
      });

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result).toEqual({
        outcome: "ambiguous",
        replayed: true,
        numTurns: 2,
        providerPhase: "ambiguous",
        filesPhase: "completed",
        truncatePhase: "completed",
        removedCompletedTurnAnchors: ["turn-a"],
      });
      expect(mocks.dbUpdateCheckpointRevertPhases).not.toHaveBeenCalled();
    });

    it("returns a missing-checkpoint noop when no journal row exists", async () => {
      const host = createRevertHost();
      mocks.dbHasThreadRuntimeItem.mockReturnValue(false);
      mocks.dbGetCheckpointRevertOperation.mockReturnValue(null);

      const result = await host.revertCheckpoint({
        threadId: "thread-1",
        checkpointItemId: "checkpoint-1",
        operationKey: "op-1",
      });

      expect(result).toEqual({
        outcome: "noop",
        replayed: false,
        numTurns: 0,
        providerPhase: "skipped_missing_checkpoint",
        filesPhase: "skipped_missing_checkpoint",
        truncatePhase: "noop",
        removedCompletedTurnAnchors: [],
      });
      expect(mocks.dbUpdateCheckpointRevertPhases).not.toHaveBeenCalled();
    });
  });
});
