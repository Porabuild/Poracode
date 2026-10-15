import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, SendThreadInputPayload, Thread } from "@/shared/contracts";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/clientErrors";

const mocks = vi.hoisted(() => ({
  startThread: vi.fn<() => Promise<{ threadId: string }>>(),
  captureFileCheckpoint: vi.fn<() => Promise<void>>(),
  reconcile: vi.fn<(thread: Thread) => Promise<boolean>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ startThread: mocks.startThread }),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: mocks.captureFileCheckpoint,
}));
vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: vi.fn<(...args: unknown[]) => void>(),
  threadProductProperties: () => ({}),
}));
vi.mock("./threadCommandOutcomeActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./threadCommandOutcomeActions")>();
  return {
    ...actual,
    notifyThreadCommandOutcomeUncertain: vi.fn<() => void>(),
    reconcileThreadCommandOutcome: mocks.reconcile,
  };
});

import { useAppStore } from "@/renderer/state/appStore";
import { resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { applyRootCatalogThreadRows } from "@/renderer/state/managedRootCatalog/rootCatalogRows";
import {
  __resetManagedRootCatalogStoreForTest,
  dropPendingManagedRootLaunch,
  notePendingManagedRootLaunch,
} from "@/renderer/state/managedRootCatalog/rootCatalogStore";
import { applyThreadSnapshot, dispatchRemoteSupervisorEvent } from "@/renderer/state/remote/sync";
import { projectRemoteProject, projectRemoteThread } from "@/renderer/state/remoteProjection";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { syncRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import {
  carryPendingThreadInput,
  confirmPendingThreadInput,
  retainPendingThreadInput,
} from "@/renderer/state/pendingThreadInput";
import { performInitialThreadLaunch } from "./threadLaunchActions";
import { performThreadInputSubmit } from "./threadRuntimeActions";

const project: Project = {
  id: "working-project",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const idle: Thread = {
  id: "working-thread",
  projectId: project.id,
  title: "Chat",
  agentKind: "test-agent",
  config: { model: "test-model" },
  status: "idle",
  attention: "none",
  presentationMode: "gui",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  createdAt: project.createdAt,
  updatedAt: project.createdAt,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function snapshot(thread: Thread): RemoteThreadSnapshot {
  return {
    snapshotSeq: 1,
    thread,
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  };
}

function currentThread() {
  return useAppStore.getState().threads[0]!;
}

function idleRuntimeSnapshot() {
  return {
    threadId: idle.id,
    agentKind: idle.agentKind,
    status: idle.status,
    attention: idle.attention,
    canResumeWithConfig: idle.canResumeWithConfig,
  };
}

describe("working state during prompt admission", () => {
  beforeEach(async () => {
    resetClientRuntimeForTest();
    if (!useAppStore.persist.hasHydrated()) {
      await new Promise<void>((resolve) => useAppStore.persist.onFinishHydration(() => resolve()));
    }
    useAppStore.setState({
      projects: [project],
      threads: [idle, { ...idle, id: "other-thread" }],
      view: { kind: "thread", panes: [idle.id] },
      pendingThreadConfigByThreadId: {},
      runtimeItemIdsByThread: {},
      runtimeItemsByIdByThread: {},
      runtimeCompletedTurnsByThread: {},
      runtimeOpenTurnByThread: {},
    });
    mocks.captureFileCheckpoint.mockResolvedValue(undefined);
    mocks.startThread.mockResolvedValue({ threadId: idle.id });
  });

  afterEach(() => {
    __resetManagedRootCatalogStoreForTest();
    confirmPendingThreadInput(idle.id);
    confirmPendingThreadInput(projectRemoteThread("desktop", idle).id);
    resetClientRuntimeForTest();
    useAppStore.setState({ threads: [], projects: [], view: { kind: "home" } });
  });

  it.each(["idle", "working"] as const)(
    "reconciles accepted in-place input to live %s state",
    async (status) => {
      const working: Thread = { ...idle, status: "working", attention: "working" };
      useAppStore.setState({ threads: [working] });
      mocks.reconcile.mockImplementationOnce(async () => {
        useAppStore.getState().reconcileRuntimeSnapshots([
          {
            ...idleRuntimeSnapshot(),
            status,
            attention: status === "working" ? "working" : "none",
          },
        ]);
        return true;
      });
      await performThreadInputSubmit({
        thread: working,
        prompt: "Answer: A",
        transport: {
          sendThreadInput: async () => {
            // The old turn completes without a new working admission for the
            // native steer. Its idle frame cannot settle a still-pending send.
            useAppStore.getState().updateThreadRuntime(idle.id, {
              status: "idle",
              attention: "none",
              canResumeWithConfig: true,
            });
            expect(currentThread().status).toBe("working");
          },
        },
      });
      expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(working);
      expect(currentThread().status).toBe(status);
    },
  );

  it.each(["catalog", "history", "reconcile"] as const)(
    "preserves a draft launch through a stale %s read before the launch action begins",
    (source) => {
      const startedAt = "2026-01-01T01:00:00.000Z";
      const preparing: Thread = {
        ...idle,
        status: "launching",
        canResumeWithConfig: false,
        activeTurnStartedAt: startedAt,
      };
      const inactive: Thread = { ...idle, status: "inactive", canResumeWithConfig: false };
      useAppStore.setState({ threads: [preparing] });
      notePendingManagedRootLaunch(idle.id, false);
      useAppStore.getState().openThread("other-thread");
      if (source === "catalog") applyRootCatalogThreadRows([inactive], new Set());
      else if (source === "history") applyThreadSnapshot(snapshot(inactive));
      else
        useAppStore
          .getState()
          .reconcileRuntimeSnapshots([
            { ...idleRuntimeSnapshot(), status: "inactive", canResumeWithConfig: false },
          ]);
      expect(currentThread().status).toBe("launching");
      expect(currentThread().activeTurnStartedAt).toBe(startedAt);
      dropPendingManagedRootLaunch(idle.id);
      applyThreadSnapshot(snapshot(inactive));
      expect(currentThread().status).toBe("inactive");
    },
  );

  it("accepts current host runtime while draft creation is still retained", () => {
    const preparing: Thread = { ...idle, status: "launching", canResumeWithConfig: false };
    const inactive: Thread = { ...idle, status: "inactive", canResumeWithConfig: false };
    useAppStore.setState({ threads: [preparing] });
    notePendingManagedRootLaunch(idle.id, false);
    applyThreadSnapshot({ ...snapshot(inactive), runtimeStateCurrent: true });
    expect(currentThread().status).toBe("inactive");
  });

  it.each(["capability", "reference"] as const)(
    "accepts an inactive runtime with a new resumable %s during draft launch",
    (proof) => {
      useAppStore.setState({
        threads: [{ ...idle, status: "launching", canResumeWithConfig: false }],
      });
      notePendingManagedRootLaunch(idle.id, false);
      useAppStore.getState().reconcileRuntimeSnapshots([
        {
          ...idleRuntimeSnapshot(),
          status: "inactive",
          canResumeWithConfig: proof === "capability",
          ...(proof === "reference"
            ? {
                sessionRef: {
                  providerSessionId: "new-session",
                  discoveredAt: idle.createdAt,
                },
              }
            : {}),
        },
      ]);
      expect(currentThread().status).toBe("inactive");
    },
  );

  it.each(["catalog", "history", "runtime", "reconcile", "missing-runtime"] as const)(
    "keeps a sent prompt working through a stale %s refresh after switching threads",
    async (source) => {
      const checkpoint = deferred();
      const sendThreadInput = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const sending = performThreadInputSubmit({
        thread: idle,
        prompt: "hello",
        transport: { sendThreadInput },
        captureCheckpoint: () => checkpoint.promise,
      });
      const startedAt = currentThread().activeTurnStartedAt;
      expect(currentThread().status).toBe("working");
      expect(startedAt).toBeDefined();
      useAppStore.getState().openThread("other-thread");
      if (source === "catalog") applyRootCatalogThreadRows([idle], new Set());
      else if (source === "history") applyThreadSnapshot(snapshot(idle));
      else if (source === "reconcile" || source === "missing-runtime")
        useAppStore
          .getState()
          .reconcileRuntimeSnapshots(
            source === "missing-runtime" ? [] : [idleRuntimeSnapshot()],
            new Set([idle.id]),
          );
      else
        useAppStore.getState().updateThreadRuntime(idle.id, {
          status: "idle",
          attention: "none",
          canResumeWithConfig: idle.canResumeWithConfig,
        });
      expect(currentThread()).toMatchObject({
        status: "working",
        attention: "working",
        activeTurnStartedAt: startedAt,
      });
      expect(useAppStore.getState().runtimeCompletedTurnsByThread[idle.id] ?? []).toHaveLength(0);
      expect(sendThreadInput).not.toHaveBeenCalled();
      checkpoint.resolve();
      await sending;
      if (source === "catalog") applyRootCatalogThreadRows([idle], new Set());
      else if (source === "history") applyThreadSnapshot(snapshot(idle));
      else if (source === "reconcile" || source === "missing-runtime")
        useAppStore
          .getState()
          .reconcileRuntimeSnapshots(
            source === "missing-runtime" ? [] : [idleRuntimeSnapshot()],
            new Set([idle.id]),
          );
      else
        useAppStore.getState().updateThreadRuntime(idle.id, {
          status: "idle",
          attention: "none",
          canResumeWithConfig: idle.canResumeWithConfig,
        });
      expect(currentThread().status).toBe("working");
    },
  );

  it("keeps a new thread working while checkpoint capture and launch are pending", async () => {
    const checkpoint = deferred();
    const launch = deferred();
    const draft = { ...idle, status: "launching" as const, canResumeWithConfig: false };
    useAppStore.setState({ threads: [draft, { ...idle, id: "other-thread" }] });
    mocks.captureFileCheckpoint.mockReturnValue(checkpoint.promise);
    mocks.startThread.mockImplementation(async () => {
      await launch.promise;
      return { threadId: idle.id };
    });
    const launching = performInitialThreadLaunch({
      thread: draft,
      projectLocation: project.location,
      prompt: "hello",
      initialSize: { cols: 80, rows: 24 },
    });
    useAppStore.getState().openThread("other-thread");
    applyRootCatalogThreadRows(
      [{ ...idle, status: "inactive", canResumeWithConfig: false }],
      new Set(),
    );
    expect(currentThread().status).toBe("working");
    checkpoint.resolve();
    await vi.waitFor(() => expect(mocks.startThread).toHaveBeenCalledTimes(1));
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("working");
    launch.resolve();
    await launching;
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("working");
  });

  it("does not confirm input from a synthetic root launch working state", async () => {
    const launchResponse = deferred();
    mocks.startThread.mockImplementation(async () => {
      await launchResponse.promise;
      return { threadId: idle.id };
    });
    const launch = performInitialThreadLaunch({
      thread: idle,
      projectLocation: project.location,
      prompt: "First prompt",
      initialSize: { cols: 80, rows: 24 },
    });
    notePendingManagedRootLaunch(idle.id, false);
    useAppStore.getState().openThread("other-thread");
    applyRootCatalogThreadRows(
      [{ ...idle, status: "inactive", canResumeWithConfig: false }],
      new Set(),
    );
    expect(currentThread().status).toBe("working");
    dropPendingManagedRootLaunch(idle.id);
    launchResponse.resolve();
    await launch;
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("working");
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: idle.id,
      agentKind: idle.agentKind,
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("idle");
  });

  it("lets real completion settle the thread even before the submit response arrives", async () => {
    const response = deferred();
    const sending = performThreadInputSubmit({
      thread: idle,
      prompt: "hello",
      transport: { sendThreadInput: () => response.promise },
    });
    useAppStore.getState().openThread("other-thread");
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: idle.id,
      agentKind: idle.agentKind,
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    applyThreadSnapshot(snapshot({ ...idle, status: "finished" }));
    expect(currentThread().status).toBe("finished");
    response.resolve();
    await sending;
    expect(currentThread().status).toBe("finished");
  });

  it.each(["checkpoint", "transport"] as const)(
    "rolls back a definite %s failure",
    async (failure) => {
      const response = deferred();
      const sending = performThreadInputSubmit({
        thread: idle,
        prompt: "hello",
        transport: {
          sendThreadInput: async () => {
            await response.promise;
            if (failure === "transport") throw new Error("refused");
          },
        },
        captureCheckpoint: async () => {
          if (failure === "checkpoint") {
            await response.promise;
            throw new Error("refused");
          }
        },
      });
      const rejection = sending.catch((error: unknown) => error);
      applyThreadSnapshot(snapshot(idle));
      expect(currentThread().status).toBe("working");
      response.resolve();
      expect(await rejection).toEqual(new Error("refused"));
      expect(currentThread().status).toBe("idle");
      expect(currentThread().activeTurnStartedAt).toBeUndefined();
    },
  );

  it("keeps remote projections stable after a response until working is confirmed", async () => {
    const remote = projectRemoteThread("desktop", idle);
    const remoteProject = projectRemoteProject("desktop", project);
    useAppStore.setState({ projects: [remoteProject], threads: [remote] });
    useRemoteServersStore.setState({
      excludedProjectIds: {},
      projectNameOverrides: {},
      projectWorkspaceIds: {},
    });
    const response = deferred();
    const sending = performThreadInputSubmit({
      thread: remote,
      prompt: "hello",
      transport: { sendThreadInput: () => response.promise },
    });
    syncRemoteAppRows("desktop", [project], [idle], { partial: true });
    expect(currentThread().status).toBe("working");
    const carried = currentThread();
    syncRemoteAppRows("desktop", [project], [idle], { partial: true });
    expect(currentThread()).toBe(carried);
    response.resolve();
    await sending;
    syncRemoteAppRows("desktop", [project], [idle], { partial: true });
    expect(currentThread().status).toBe("working");
    const afterResponse = currentThread();
    syncRemoteAppRows("desktop", [project], [idle], { partial: true });
    expect(currentThread()).toBe(afterResponse);
    applyThreadSnapshot(snapshot(remote));
    expect(currentThread().status).toBe("working");
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: remote.id,
      agentKind: remote.agentKind,
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    syncRemoteAppRows("desktop", [project], [idle], { partial: true });
    expect(currentThread().status).toBe("idle");
  });

  it("accepts a working snapshot when the live admission event was missed", async () => {
    await performThreadInputSubmit({
      thread: idle,
      prompt: "hello",
      transport: { sendThreadInput: async () => {} },
    });
    applyThreadSnapshot(snapshot({ ...idle, status: "working", attention: "working" }));
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("idle");
  });

  it.each(["2020-01-01T00:00:01.000Z", "2036-01-01T00:00:01.000Z"])(
    "accepts a completed prompt snapshot with host time %s when live events were missed",
    async (endedAt) => {
      const sendThreadInput = vi
        .fn<(input: SendThreadInputPayload) => Promise<void>>()
        .mockResolvedValue(undefined);
      await performThreadInputSubmit({
        thread: idle,
        prompt: "hello",
        transport: { sendThreadInput },
      });
      const userMessageItemId = sendThreadInput.mock.calls[0]![0].userMessageItemId!;
      applyThreadSnapshot({
        ...snapshot({ ...idle, lastTurnEndedAt: endedAt }),
        runtimeItems: [
          { id: userMessageItemId, type: "user_message", state: "completed", streams: {} },
        ],
        completedTurns: [
          {
            startedAt: new Date(Date.parse(endedAt) - 1000).toISOString(),
            endedAt,
            anchorItemId: userMessageItemId,
          },
        ],
      });
      expect(currentThread().status).toBe("idle");
    },
  );

  it("keeps a new prompt working across an older completed turn replay", async () => {
    await performThreadInputSubmit({
      thread: idle,
      prompt: "hello",
      transport: { sendThreadInput: async () => {} },
    });
    useAppStore.getState().applyRuntimeEvents(idle.id, [
      { type: "turn.completed", threadId: idle.id, turnId: "old-turn", state: "completed" },
      { type: "session.exited", threadId: idle.id, reason: "old-session" },
    ]);
    applyThreadSnapshot({
      ...snapshot(idle),
      runtimeItems: [{ id: "old-message", type: "user_message", state: "completed", streams: {} }],
      completedTurns: [
        { startedAt: idle.createdAt, endedAt: idle.updatedAt, anchorItemId: "old-message" },
      ],
    });
    expect(currentThread().status).toBe("working");
  });

  it.each([false, true])(
    "recovers a short completed prompt from a current runtime snapshot (canonical event seen: %s)",
    async (canonicalSeen) => {
      const sendThreadInput = vi
        .fn<(input: SendThreadInputPayload) => Promise<void>>()
        .mockResolvedValue(undefined);
      await performThreadInputSubmit({
        thread: idle,
        prompt: "/status",
        transport: { sendThreadInput },
      });
      const itemId = sendThreadInput.mock.calls[0]![0].userMessageItemId!;
      const runtimeItems = [
        { id: itemId, type: "user_message", state: "completed" as const, streams: {} },
      ];
      // A legacy host may persist the prompt ahead of its status control write.
      applyThreadSnapshot({ ...snapshot(idle), runtimeItems });
      expect(currentThread().status).toBe("working");
      if (canonicalSeen) {
        dispatchRemoteSupervisorEvent({
          type: "thread-runtime-event",
          threadId: idle.id,
          event: { type: "item.started", threadId: idle.id, itemId, itemType: "user_message" },
        });
      }
      applyThreadSnapshot({
        ...snapshot({
          ...idle,
          lastTurnStartedAt: "2020-01-01T00:00:00.000Z",
          lastTurnEndedAt: "2020-01-01T00:00:00.100Z",
        }),
        runtimeStateCurrent: true,
        // Cursor-covered recovery may deliver the user row in a prior frame.
        runtimeItems: canonicalSeen ? [] : runtimeItems,
      });
      expect(currentThread().status).toBe("idle");
    },
  );

  it("ignores a previous provider's forced close while current input is pending", async () => {
    await performThreadInputSubmit({
      thread: idle,
      prompt: "hello",
      transport: { sendThreadInput: async () => {} },
    });
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: idle.id,
      agentKind: "previous-agent",
      status: "inactive",
      attention: "none",
      canResumeWithConfig: false,
      forceCloseActiveTurn: true,
    });
    applyThreadSnapshot(snapshot(idle));
    expect(currentThread().status).toBe("working");
  });

  it.each(["send", "launch"] as const)(
    "allows uncertain %s reconciliation to install the authoritative result",
    async (operation) => {
      const uncertain = new RemoteClientError("unknown outcome", 409, "command_outcome_uncertain");
      mocks.reconcile.mockImplementation(async (thread) => {
        applyThreadSnapshot(snapshot({ ...thread, status: "idle", attention: "none" }));
        return true;
      });
      let submitting: Promise<void>;
      if (operation === "send") {
        submitting = performThreadInputSubmit({
          thread: idle,
          prompt: "hello",
          transport: {
            sendThreadInput: async () => {
              throw uncertain;
            },
          },
        });
      } else {
        mocks.startThread.mockRejectedValue(uncertain);
        submitting = performInitialThreadLaunch({
          thread: idle,
          prompt: "hello",
          projectLocation: project.location,
          initialSize: { cols: 80, rows: 24 },
        });
      }
      await expect(submitting).rejects.toBe(uncertain);
      expect(mocks.reconcile).toHaveBeenCalledTimes(1);
      expect(currentThread().status).toBe("idle");
    },
  );

  it("fences cleanup from an older submission after live admission and a newer submit", () => {
    const releaseOld = retainPendingThreadInput(idle.id);
    dispatchRemoteSupervisorEvent({
      type: "thread-state",
      threadId: idle.id,
      status: "working",
      attention: "working",
      canResumeWithConfig: true,
    });
    const releaseNew = retainPendingThreadInput(idle.id);
    releaseOld();
    expect(carryPendingThreadInput(currentThread(), idle).status).toBe("working");
    releaseNew();
    expect(carryPendingThreadInput(currentThread(), idle).status).toBe("idle");
  });

  it("releases pending input when a thread is deleted", async () => {
    await performThreadInputSubmit({
      thread: idle,
      prompt: "hello",
      transport: { sendThreadInput: async () => {} },
    });
    const optimistic = currentThread();
    useAppStore.getState().deleteThread(idle.id);
    expect(carryPendingThreadInput(optimistic, idle)).toBe(idle);
  });

  it("retires previous-provider admission before a replacement input", async () => {
    await performThreadInputSubmit({
      thread: idle,
      prompt: "old",
      transport: { sendThreadInput: async () => {} },
    });
    useAppStore.getState().applyProviderSwitch(idle.id, {
      agentKind: "replacement",
      config: { model: "new" },
      presentationMode: "gui",
    });
    const replacement = currentThread();
    const sendThreadInput = vi
      .fn<(input: SendThreadInputPayload) => Promise<void>>()
      .mockResolvedValue(undefined);
    await performThreadInputSubmit({
      thread: replacement,
      prompt: "new",
      transport: { sendThreadInput },
    });
    applyThreadSnapshot({
      ...snapshot({ ...replacement, status: "idle", attention: "none" }),
      runtimeStateCurrent: true,
      runtimeItems: [
        {
          id: sendThreadInput.mock.calls[0]![0].userMessageItemId!,
          type: "user_message",
          state: "completed",
          streams: {},
        },
      ],
    });
    expect(currentThread().status).toBe("idle");
  });
});
