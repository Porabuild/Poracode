import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, PromptSegment, SendThreadInputPayload, Thread } from "@/shared/contracts";

const mocks = vi.hoisted(() => ({
  appState: {
    threads: [] as Thread[],
    projects: [] as Project[],
    applyRuntimeEvent: vi.fn<(threadId: string, event: unknown) => void>(),
    updateThreadRuntime: vi.fn<(threadId: string, input: { status: string }) => void>(),
    touchThread: vi.fn<(threadId: string) => void>(),
  },
  bridge: {
    sendThreadInput: vi.fn<(payload: SendThreadInputPayload) => Promise<void>>(),
  },
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

import { performThreadInputSubmit, submitThreadInput } from "./threadRuntimeActions";

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

const segments: PromptSegment[] = [{ kind: "text", content: "hello" }];

function rejectingTransport(message: string) {
  return {
    sendThreadInput: vi.fn<() => Promise<void>>(() => Promise.reject(new Error(message))),
  };
}

/** The rollback write restores the pre-submit status; the optimistic one sets "working". */
function rollbackCalls(): unknown[] {
  return mocks.appState.updateThreadRuntime.mock.calls.filter(
    ([, input]) => input.status !== "working",
  );
}

describe("performThreadInputSubmit unknown-session resume", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.bridge.sendThreadInput.mockResolvedValue(undefined);
    mocks.performInitialThreadLaunch.mockResolvedValue(undefined);
    mocks.appState.threads = [];
    mocks.appState.projects = [project];
  });

  it("resumes the thread instead of dropping the prompt when the session is gone", async () => {
    const thread = createThread();
    const resumeLaunch = vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        segments,
        transport: rejectingTransport("Unknown thread session: x"),
        resumeLaunch,
      }),
    ).resolves.toBeUndefined();

    expect(resumeLaunch).toHaveBeenCalledExactlyOnceWith({
      prompt: "hello",
      segments,
      userMessageItemId: expect.stringMatching(/^user-/),
    });
    expect(rollbackCalls()).toEqual([]);
  });

  it("rolls back and rejects when the resume launch itself fails", async () => {
    const thread = createThread();

    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        transport: rejectingTransport("Unknown thread session: x"),
        resumeLaunch: () => Promise.reject(new Error("relaunch failed")),
      }),
    ).rejects.toThrow("relaunch failed");

    expect(rollbackCalls()).toHaveLength(1);
  });

  it("rolls back and rejects for any other transport error", async () => {
    const thread = createThread();
    const resumeLaunch = vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined);

    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        transport: rejectingTransport("boom"),
        resumeLaunch,
      }),
    ).rejects.toThrow("boom");

    expect(resumeLaunch).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });

  it("keeps the old failure behavior without a resume hook or a resumable thread", async () => {
    const thread = createThread();
    await expect(
      performThreadInputSubmit({
        thread,
        prompt: "hello",
        transport: rejectingTransport("Unknown thread session: x"),
      }),
    ).rejects.toThrow("Unknown thread session: x");
    expect(rollbackCalls()).toHaveLength(1);

    vi.clearAllMocks();
    const resumeLaunch = vi.fn<(args: unknown) => Promise<void>>().mockResolvedValue(undefined);
    await expect(
      performThreadInputSubmit({
        thread: createThread({ canResumeWithConfig: false, sessionRef: undefined }),
        prompt: "hello",
        transport: rejectingTransport("Unknown thread session: x"),
        resumeLaunch,
      }),
    ).rejects.toThrow("Unknown thread session: x");
    expect(resumeLaunch).not.toHaveBeenCalled();
    expect(rollbackCalls()).toHaveLength(1);
  });
});

describe("submitThreadInput resume wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.performInitialThreadLaunch.mockResolvedValue(undefined);
    mocks.appState.projects = [project];
    mocks.appState.threads = [createThread()];
  });

  it("relaunches with the freshest thread snapshot and the optimistic item id", async () => {
    mocks.bridge.sendThreadInput.mockRejectedValueOnce(
      new Error("Unknown thread session: thread-1"),
    );
    // The store snapshot moved on since the submit started; the relaunch must
    // carry the newly discovered session ref, not the stale one.
    mocks.appState.threads = [
      createThread({
        sessionRef: { providerSessionId: "ses_2", discoveredAt: "2026-01-02T00:00:00.000Z" },
      }),
    ];

    await expect(submitThreadInput("thread-1", "hello", segments)).resolves.toBeUndefined();

    expect(mocks.performInitialThreadLaunch).toHaveBeenCalledExactlyOnceWith({
      thread: expect.objectContaining({
        sessionRef: expect.objectContaining({ providerSessionId: "ses_2" }),
      }),
      projectLocation: { kind: "posix", path: "/repo" },
      prompt: "hello",
      segments,
      userMessageItemId: expect.stringMatching(/^user-/),
      initialSize: { cols: 120, rows: 30 },
    });
    expect(rollbackCalls()).toEqual([]);
  });
});
