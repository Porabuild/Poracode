import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupervisorEvent } from "@/shared/ipc";

const mocks = vi.hoisted(() => ({
  initDatabase: vi.fn<(path: string, options?: { schemaMode?: "migrate" | "validate" }) => void>(),
  closeDatabase: vi.fn<() => void>(),
  dbMarkLiveThreadsInactive: vi.fn<() => void>(),
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
  persistSupervisorEvent: vi.fn<(event: SupervisorEvent) => void>(),
  start: vi.fn<() => void>(),
  restart: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  supervisorCall: vi.fn<(type: string, payload: unknown, options?: unknown) => Promise<unknown>>(),
  supervisorOptions: null as null | {
    onEvent(event: SupervisorEvent): void;
    onReset(): void;
  },
  supervisorConstructorError: null as Error | null,
}));

vi.mock("@/main/db", () => ({
  initDatabase: mocks.initDatabase,
  closeDatabase: mocks.closeDatabase,
  dbMarkLiveThreadsInactive: mocks.dbMarkLiveThreadsInactive,
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

vi.mock("@/main/supervisor/SupervisorClient", () => ({
  SupervisorClient: class {
    start = mocks.start;
    restart = mocks.restart;
    dispose = mocks.dispose;
    call = mocks.supervisorCall;

    constructor(options: { onEvent(event: SupervisorEvent): void; onReset(): void }) {
      if (mocks.supervisorConstructorError) throw mocks.supervisorConstructorError;
      mocks.supervisorOptions = options;
    }
  },
}));

import {
  BackendEventRouter,
  BackendHostCore,
  filterSupervisorEventForInterests,
} from "./BackendHostCore";

describe("BackendHostCore", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    mocks.supervisorOptions = null;
    mocks.supervisorConstructorError = null;
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
    expect(mocks.dbMarkLiveThreadsInactive).toHaveBeenCalledOnce();
    // startSupervisor is idempotent (start once); restartSupervisor forces.
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(mocks.restart).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).toHaveBeenCalledOnce();
    expect(mocks.closeDatabase).toHaveBeenCalledOnce();
  });

  it("persists each supervisor event before publishing it", async () => {
    const order: string[] = [];
    mocks.persistSupervisorEvent.mockImplementation(() => order.push("persist"));
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
    await host.dispose();
  });

  it("publishes high-volume events only for interested threads", () => {
    const interests = {
      terminalThreadIds: ["terminal-visible"],
      runtimeThreadIds: ["chat-visible"],
      allRuntimeEvents: false,
    };

    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "terminal-hidden",
          data: "noise",
          outputLength: 5,
          terminalInstanceId: "gen-test",
        },
        interests,
      ),
    ).toBeNull();
    const hiddenShellActivityAt = new Map<string, number>();
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "done",
          outputLength: 4,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_000,
      ),
    ).toEqual({
      type: "thread-output",
      threadId: "shell:action",
      data: "",
      outputLength: 4,
      terminalInstanceId: "gen-test",
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "more",
          outputLength: 8,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_499,
      ),
    ).toBeNull();
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-output",
          threadId: "shell:action",
          data: "more",
          outputLength: 8,
          terminalInstanceId: "gen-test",
        },
        interests,
        hiddenShellActivityAt,
        1_500,
      ),
    ).toEqual({
      type: "thread-output",
      threadId: "shell:action",
      data: "",
      outputLength: 8,
      terminalInstanceId: "gen-test",
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-runtime-events-multi",
          batches: [
            {
              threadId: "chat-visible",
              events: [
                {
                  type: "item.completed",
                  threadId: "chat-visible",
                  itemId: "visible-item",
                },
              ],
            },
            {
              threadId: "chat-hidden",
              events: [
                {
                  type: "item.completed",
                  threadId: "chat-hidden",
                  itemId: "hidden-item",
                },
                {
                  type: "request.opened",
                  threadId: "chat-hidden",
                  requestId: "approval-1",
                  requestType: "tool_call_approval",
                  payload: { summary: "Approve the background command?" },
                },
                {
                  type: "turn.completed",
                  threadId: "chat-hidden",
                  turnId: "turn-hidden",
                  state: "completed",
                },
              ],
            },
          ],
        },
        interests,
      ),
    ).toEqual({
      type: "thread-runtime-events-multi",
      batches: [
        {
          threadId: "chat-visible",
          events: [
            {
              type: "item.completed",
              threadId: "chat-visible",
              itemId: "visible-item",
            },
          ],
        },
        {
          threadId: "chat-hidden",
          events: [
            {
              type: "request.opened",
              threadId: "chat-hidden",
              requestId: "approval-1",
              requestType: "tool_call_approval",
              payload: { summary: "Approve the background command?" },
            },
            {
              type: "turn.completed",
              threadId: "chat-hidden",
              turnId: "turn-hidden",
              state: "completed",
            },
          ],
        },
      ],
    });
    expect(
      filterSupervisorEventForInterests(
        {
          type: "thread-runtime-event",
          threadId: "chat-hidden",
          event: {
            type: "content.delta",
            threadId: "chat-hidden",
            itemId: "hidden-item",
            stream: "assistant_text",
            delta: "noise",
          },
        },
        interests,
      ),
    ).toBeNull();
  });

  it("keeps initial terminal output subscribed until interest acknowledgement", () => {
    vi.useFakeTimers();
    const router = new BackendEventRouter();
    const output: SupervisorEvent = {
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    };

    router.retainTerminalBootstrap("terminal-starting");
    expect(router.filter(output)).toBe(output);
    expect(router.filter(output)).toBe(output);

    router.setInterests({
      terminalThreadIds: ["terminal-starting"],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    expect(router.filter(output)).toBe(output);

    router.setInterests({
      terminalThreadIds: [],
      runtimeThreadIds: [],
      allRuntimeEvents: false,
    });
    expect(router.filter(output)).toBeNull();
    router.dispose();
    vi.useRealTimers();
  });

  it("expires unacknowledged terminal bootstrap interest", () => {
    vi.useFakeTimers();
    const router = new BackendEventRouter();
    const output: SupervisorEvent = {
      type: "thread-output",
      threadId: "terminal-starting",
      data: "first frame",
      outputLength: 11,
      terminalInstanceId: "gen-test",
    };

    router.retainTerminalBootstrap("terminal-starting");
    vi.advanceTimersByTime(10_000);

    expect(router.filter(output)).toBeNull();
    router.dispose();
    vi.useRealTimers();
  });

  it("attributes bootstrap retention to the authenticated requesting window only", () => {
    const router = new BackendEventRouter();

    // Originless starts (server, remote, background) widen no window.
    router.retainTerminalBootstrap("originless");
    expect(router.isTerminalBootstrapRetainedFor(7, "originless")).toBe(false);
    expect(router.isTerminalBootstrapRetainedFor(8, "originless")).toBe(false);
    // The legacy union filter parity (pre-table mainWindow relay) is kept.
    expect(
      router.filter({
        type: "thread-output",
        threadId: "originless",
        data: "x",
        outputLength: 1,
        terminalInstanceId: "gen-test",
      }),
    ).not.toBeNull();

    // Only the authenticated origin window may fail open for the thread.
    router.retainTerminalBootstrap("shell:new", 7);
    expect(router.isTerminalBootstrapRetainedFor(7, "shell:new")).toBe(true);
    expect(router.isTerminalBootstrapRetainedFor(8, "shell:new")).toBe(false);
    // A re-retain by another origin moves the attribution.
    router.retainTerminalBootstrap("shell:new", 8);
    expect(router.isTerminalBootstrapRetainedFor(7, "shell:new")).toBe(false);
    expect(router.isTerminalBootstrapRetainedFor(8, "shell:new")).toBe(true);
    router.dispose();
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
