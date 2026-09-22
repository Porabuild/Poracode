import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteClientError } from "@/shared/remote/client";
import type { Project, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    threads: [] as Thread[],
    projects: [] as Project[],
    applyRuntimeEvent: vi.fn<(threadId: string, event: unknown) => void>(),
    updateThreadRuntime: vi.fn<(threadId: string, input: unknown) => void>(),
    touchThread: vi.fn<(threadId: string) => void>(),
  },
  bridge: {
    sendThreadInput: vi.fn<() => Promise<void>>(),
  },
  notify: vi.fn<() => void>(),
  reconcile: vi.fn<(thread: Thread) => Promise<boolean>>(),
  performInitialThreadLaunch: vi.fn<(input: unknown) => Promise<void>>(),
}));

vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => mocks.appState },
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => mocks.bridge,
}));
vi.mock("@/renderer/state/remoteProjection", () => ({
  remoteOwner: () => undefined,
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: vi.fn<(input: unknown) => Promise<void>>(),
}));
vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  threadProductProperties: () => ({}),
}));
vi.mock("@/renderer/analytics/productAnalytics", () => ({
  captureProductEvent: vi.fn<(...args: unknown[]) => void>(),
}));
vi.mock("./threadLaunchActions", () => ({
  performInitialThreadLaunch: mocks.performInitialThreadLaunch,
}));
vi.mock("./threadCommandOutcomeActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./threadCommandOutcomeActions")>();
  return {
    ...actual,
    notifyThreadCommandOutcomeUncertain: mocks.notify,
    reconcileThreadCommandOutcome: mocks.reconcile,
  };
});

import { performThreadInputSubmit } from "./threadRuntimeActions";

const project: Project = {
  id: "project-1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  scripts: { actions: [] },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function createThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: "thread-1",
    projectId: project.id,
    title: "Thread",
    agentKind: "codex",
    config: { model: "codex/model" },
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: "ses_1", discoveredAt: "2026-01-01T00:00:00.000Z" },
    archived: false,
    done: false,
    starred: false,
    presentationMode: "gui",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as Thread;
}

function uncertainError(): RemoteClientError {
  return new RemoteClientError(
    "Remote command outcome is uncertain and was not repeated.",
    409,
    "command_outcome_uncertain",
  );
}

function rejectingTransport(error: unknown) {
  return {
    sendThreadInput: vi.fn<() => Promise<void>>(() => Promise.reject(error)),
  };
}

/** The rollback write restores the pre-submit status; the optimistic one sets "working". */
function rollbackCalls(): unknown[] {
  return mocks.appState.updateThreadRuntime.mock.calls.filter(
    ([, input]) => (input as { status?: string }).status !== "working",
  );
}

describe("performThreadInputSubmit uncertain outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bridge.sendThreadInput.mockResolvedValue(undefined);
    mocks.reconcile.mockResolvedValue(true);
    mocks.appState.threads = [];
    mocks.appState.projects = [project];
  });

  it("keeps the optimistic turn, reconciles once, and never resends on uncertain", async () => {
    const thread = createThread();
    const transport = rejectingTransport(uncertainError());
    const resumeLaunch = vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      performThreadInputSubmit({ thread, prompt: "hello", transport, resumeLaunch }),
    ).rejects.toMatchObject({ status: 409, code: "command_outcome_uncertain" });

    expect(transport.sendThreadInput).toHaveBeenCalledTimes(1);
    expect(resumeLaunch).not.toHaveBeenCalled();
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith(thread);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    // No force-close: the pre-submit status must not be repainted.
    expect(rollbackCalls()).toEqual([]);
  });

  it("preserves the definitive rollback for a non-uncertain 409", async () => {
    const thread = createThread();
    const error = new RemoteClientError("conflict", 409, "command_id_conflict");

    await expect(
      performThreadInputSubmit({ thread, prompt: "hello", transport: rejectingTransport(error) }),
    ).rejects.toBe(error);

    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });

  it("does not roll back an uncertain relaunch that already reconciled", async () => {
    const thread = createThread();
    const resumeLaunch = vi
      .fn<(args: unknown) => Promise<void>>()
      .mockRejectedValue(uncertainError());

    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        transport: rejectingTransport(new Error("Unknown thread session: thread-1")),
        resumeLaunch,
      }),
    ).rejects.toMatchObject({ status: 409, code: "command_outcome_uncertain" });

    expect(resumeLaunch).toHaveBeenCalledTimes(1);
    // The launch action owns the single reconcile; the send must not add one.
    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(rollbackCalls()).toEqual([]);
  });

  it("keeps the ordinary success path free of uncertainty handling", async () => {
    const thread = createThread();

    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        transport: { sendThreadInput: vi.fn<() => Promise<void>>().mockResolvedValue(undefined) },
      }),
    ).resolves.toBeUndefined();

    expect(mocks.reconcile).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(rollbackCalls()).toEqual([]);
  });
});
