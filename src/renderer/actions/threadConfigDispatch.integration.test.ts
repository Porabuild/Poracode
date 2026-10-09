import "fake-indexeddb/auto";
import { beforeEach, expect, it, vi } from "vitest";
import type { Thread, ThreadConfig } from "@/shared/contracts";
import { RemoteClientError } from "@/shared/remote/client";
import { useAppStore } from "@/renderer/state/appStore";
import { performThreadInputSubmit } from "./threadRuntimeActions";
import { performInitialThreadLaunch } from "./threadLaunchActions";
import { buildCommandRegistry } from "@/renderer/commands/registry";

const mocks = vi.hoisted(() => ({
  send: vi.fn<(payload: unknown) => Promise<void>>(),
  start: vi.fn<(payload: unknown) => Promise<{ threadId: string }>>(),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ sendThreadInput: mocks.send, startThread: mocks.start }),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
vi.mock("@/renderer/analytics/posthog", () => ({
  captureThreadPromptSubmitted: vi.fn<(...args: unknown[]) => void>(),
  captureThreadStarted: vi.fn<(...args: unknown[]) => void>(),
  threadProductProperties: () => ({}),
}));
vi.mock("./threadCommandOutcomeActions", async (original) => ({
  ...(await original<typeof import("./threadCommandOutcomeActions")>()),
  notifyThreadCommandOutcomeUncertain: vi.fn<() => void>(),
  reconcileThreadCommandOutcome: vi.fn<() => Promise<boolean>>().mockResolvedValue(true),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({
    projects: [],
    threads: [],
    view: { kind: "home" },
    pendingThreadConfigByThreadId: {},
    lastRuntimeConfigByThreadId: {},
  });
});
function seed(): Thread {
  const store = useAppStore.getState();
  const project = store.addProject({ kind: "posix", path: "/fixture" });
  const thread = store.createThread({
    projectId: project.id,
    agentKind: "structured-example",
    config: { model: "model-a", effort: "xhigh" },
    prompt: "Fixture",
    presentationMode: "gui",
    suppressHostCreateIntent: true,
  });
  store.updateThreadConfig(thread.id, { ...thread.config, effort: "high" });
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    config: thread.config,
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: "fixture-session", discoveredAt: "2026-10-09T00:00:00.000Z" },
  });
  return current(thread.id);
}
function current(id: string): Thread {
  return useAppStore.getState().threads.find((row) => row.id === id)!;
}
function echo(id: string, config: ThreadConfig = { model: "model-a", effort: "xhigh" }) {
  useAppStore.getState().updateThreadRuntime(id, {
    status: "idle",
    attention: "none",
    config,
    canResumeWithConfig: true,
  });
}
function launch(thread: Thread) {
  return performInitialThreadLaunch({
    thread,
    projectLocation: { kind: "posix", path: "/fixture" },
    prompt: "Fixture",
    initialSize: { cols: 80, rows: 24 },
  });
}

it.each(["send", "start", "relaunch", "registry"])(
  "restores High after definite %s failure and keeps resume/history guards",
  async (path) => {
    const thread = seed();
    mocks.send.mockRejectedValue(new Error("definite rejection"));
    mocks.start.mockRejectedValue(new Error("definite start rejection"));
    const action =
      path === "registry"
        ? paletteCommand(thread).run()
        : path === "start"
          ? launch(thread)
          : performThreadInputSubmit({
              thread,
              prompt: "followup",
              transport: { sendThreadInput: mocks.send },
              ...(path === "relaunch"
                ? {
                    transport: {
                      sendThreadInput: vi
                        .fn<() => Promise<void>>()
                        .mockRejectedValue(new Error(`Unknown thread session: ${thread.id}`)),
                    },
                    resumeLaunch: () => launch(thread),
                  }
                : {}),
            });
    await expect(action).rejects.toThrow(/definite/);
    echo(thread.id);
    expect(current(thread.id).config.effort).toBe("high");
    expect(current(thread.id)).toMatchObject({
      canResumeWithConfig: true,
      sessionRef: thread.sessionRef,
    });
  },
);

function paletteCommand(thread: Thread) {
  useAppStore.setState({
    view: { kind: "thread", panes: [thread.id] },
    threads: [{ ...thread, slashCommands: [{ id: "inspect", label: "Inspect" }] }],
  });
  return buildCommandRegistry().find((row) => row.id === "chat.command.inspect")!;
}

it("retires command-palette config so an actual acknowledgement is visible", async () => {
  const thread = seed();
  mocks.send.mockImplementation(async () => echo(thread.id));
  const command = paletteCommand(thread);
  await command.run();
  expect(current(thread.id).config.effort).toBe("xhigh");
  expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
});

function deferredFailure() {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, rejectPromise) => {
    reject = rejectPromise;
  });
  return { promise, reject };
}

it.each([false, true])(
  "does not restore over a newer model/effort edit, even if submitted=%s",
  async (submitted) => {
    const thread = seed(),
      store = useAppStore.getState(),
      failure = deferredFailure();
    mocks.send.mockReturnValueOnce(failure.promise);
    const first = performThreadInputSubmit({
      thread,
      prompt: "old",
      transport: { sendThreadInput: mocks.send },
    });
    const result = first.catch((error: unknown) => error);
    store.updateThreadConfig(thread.id, { model: "model-b", effort: "low" });
    if (submitted) {
      mocks.send.mockImplementationOnce(async () =>
        echo(thread.id, { model: "model-b", effort: "low" }),
      );
      await performThreadInputSubmit({
        thread: current(thread.id),
        prompt: "new",
        transport: { sendThreadInput: mocks.send },
      });
    }
    failure.reject(new Error("definite rejection"));
    await expect(result).resolves.toMatchObject({ message: "definite rejection" });
    echo(thread.id, { model: "model-b", effort: "low" });
    expect(current(thread.id).config).toMatchObject({ model: "model-b", effort: "low" });
    expect(
      useAppStore.getState().pendingThreadConfigByThreadId[thread.id]?.submissions ?? [],
    ).toEqual([]);
  },
);

it("restores only the retired effort while preserving a newer unrelated edit", async () => {
  const thread = seed(),
    store = useAppStore.getState(),
    failure = deferredFailure();
  mocks.send.mockReturnValueOnce(failure.promise);
  const first = performThreadInputSubmit({
    thread,
    prompt: "old",
    transport: { sendThreadInput: mocks.send },
  });
  const result = first.catch((error: unknown) => error);
  store.updateThreadConfig(thread.id, { ...current(thread.id).config, fast: true });
  echo(thread.id);
  failure.reject(new Error("definite rejection"));
  await expect(result).resolves.toMatchObject({ message: "definite rejection" });
  echo(thread.id);
  expect(current(thread.id).config).toMatchObject({ effort: "high", fast: true });
});

it.each(["switch", "remove"])("does not restore retired fields after owner %s", async (change) => {
  const thread = seed(),
    store = useAppStore.getState(),
    failure = deferredFailure();
  mocks.send.mockReturnValueOnce(failure.promise);
  const first = performThreadInputSubmit({
    thread,
    prompt: "old",
    transport: { sendThreadInput: mocks.send },
  });
  const result = first.catch((error: unknown) => error);
  if (change === "switch")
    store.applyProviderSwitch(thread.id, {
      agentKind: "other-provider",
      config: { model: "other-model" },
      presentationMode: "gui",
    });
  else store.deleteThread(thread.id);
  failure.reject(new Error("definite rejection"));
  await expect(result).resolves.toMatchObject({ message: "definite rejection" });
  expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
  expect(
    useAppStore.getState().threads.find((row) => row.id === thread.id)?.config.effort,
  ).toBeUndefined();
});

it("does not restore or resend an uncertain dispatch, and preserves its newer successor", async () => {
  const thread = seed(),
    store = useAppStore.getState(),
    failure = deferredFailure();
  mocks.send.mockReturnValueOnce(failure.promise);
  const first = performThreadInputSubmit({
    thread,
    prompt: "old",
    transport: { sendThreadInput: mocks.send },
  });
  const result = first.catch((error: unknown) => error);
  store.updateThreadConfig(thread.id, { ...current(thread.id).config, effort: "medium" });
  failure.reject(new RemoteClientError("Fixture uncertain", 409, "command_outcome_uncertain"));
  await expect(result).resolves.toMatchObject({ code: "command_outcome_uncertain" });
  echo(thread.id);
  expect(current(thread.id).config.effort).toBe("medium");
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send).toHaveBeenCalledWith(
    expect.objectContaining({ config: expect.objectContaining({ effort: "high" }) }),
  );
});

it("does not restore effort refused by an authoritative no-effort inventory", async () => {
  const thread = seed(),
    store = useAppStore.getState(),
    failure = deferredFailure();
  mocks.send.mockReturnValueOnce(failure.promise);
  const first = performThreadInputSubmit({
    thread,
    prompt: "old",
    transport: { sendThreadInput: mocks.send },
  });
  const result = first.catch((error: unknown) => error);
  store.updateThreadRuntime(thread.id, {
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    config: { model: "model-a", effort: "" },
    sessionConfigOptions: [
      {
        id: "model",
        type: "select",
        role: "model",
        currentValue: "model-a",
        values: [{ value: "model-a" }],
        groups: [],
      },
    ],
  });
  failure.reject(new Error("definite rejection"));
  await expect(result).resolves.toMatchObject({ message: "definite rejection" });
  expect(current(thread.id).config.effort).toBe("");
  expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
});

it("does not restore an older High after a newer High submission was natively rejected", async () => {
  const thread = seed(),
    store = useAppStore.getState(),
    failure = deferredFailure();
  mocks.send.mockReturnValueOnce(failure.promise);
  const first = performThreadInputSubmit({
    thread,
    prompt: "old",
    transport: { sendThreadInput: mocks.send },
  });
  const result = first.catch((error: unknown) => error);
  store.updateThreadConfig(thread.id, { ...current(thread.id).config, effort: "low" });
  store.updateThreadConfig(thread.id, { ...current(thread.id).config, effort: "high" });
  mocks.send.mockImplementationOnce(async () => echo(thread.id));
  await performThreadInputSubmit({
    thread: current(thread.id),
    prompt: "new",
    transport: { sendThreadInput: mocks.send },
  });
  expect(current(thread.id).config.effort).toBe("xhigh");
  failure.reject(new Error("definite rejection"));
  await expect(result).resolves.toMatchObject({ message: "definite rejection" });
  expect(current(thread.id).config.effort).toBe("xhigh");
  expect(useAppStore.getState().pendingThreadConfigByThreadId[thread.id]).toBeUndefined();
});
