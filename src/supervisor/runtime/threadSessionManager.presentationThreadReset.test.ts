/**
 * Production regression for the B1 GUI `thread-reset` skip.
 *
 * Two independent facts keep the acknowledged transcript prefix alive:
 *  - a GUI start must not emit `thread-reset` (the host IPC funnel persists it
 *    and the deferred reset would rebase the runtime snapshot to empty);
 *  - a terminal start must still emit it (terminal scrollback and the
 *    renderer-side server-request slice depend on the reset).
 *
 * This focused test drives the real `startThread` entry for both presentations
 * so a future unification of reset behavior fails here instead of silently
 * erasing committed bytes on a device journey.
 */

import { afterEach, expect, it, vi } from "vitest";

const ptySpawnMock = vi.hoisted(() => vi.fn<(...args: unknown[]) => unknown>());

vi.mock("node-pty", () => ({ spawn: ptySpawnMock }));

vi.mock("../agents/binaryResolver", async (importActual) => {
  const actual = await importActual<typeof import("../agents/binaryResolver")>();
  return {
    ...actual,
    resolveAgentBinaryPath: (location: { kind: string }, binary: string) =>
      location.kind === "windows" && process.platform !== "win32"
        ? undefined
        : actual.resolveAgentBinaryPath(location as never, binary),
  };
});

vi.mock("../agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/base")>()),
  primeProjectShellEnv: async () => undefined,
}));

import { SupervisorRuntime } from "../supervisorRuntime";

const runtimesToDispose: SupervisorRuntime[] = [];
const ptyExitCleanups: Array<() => void> = [];

function makeRuntime(emit: ConstructorParameters<typeof SupervisorRuntime>[0]): SupervisorRuntime {
  const runtime = new SupervisorRuntime(emit);
  runtimesToDispose.push(runtime);
  return runtime;
}

afterEach(async () => {
  for (const emitExit of ptyExitCleanups.splice(0)) emitExit();
  for (const runtime of runtimesToDispose.splice(0)) await runtime.disposeAsync();
  ptySpawnMock.mockReset();
});

function createMockPty() {
  let onExitHandler: ((event: { exitCode: number | null }) => void) | undefined;
  const pty = {
    pid: 4242,
    write: vi.fn<(data: string) => void>(),
    resize: vi.fn<(cols: number, rows: number) => void>(),
    kill: vi.fn<() => void>(),
    onData: vi.fn<(handler: (data: string) => void) => void>(),
    onExit: vi.fn<(handler: (event: { exitCode: number | null }) => void) => void>((handler) => {
      onExitHandler = handler;
    }),
  };
  ptyExitCleanups.push(() => {
    const handler = onExitHandler;
    onExitHandler = undefined;
    handler?.({ exitCode: 0 });
  });
  return pty;
}

const capabilities = {
  models: [{ id: "fixture-model", label: "Fixture" }],
  efforts: [] as string[],
  modelEfforts: {},
  modes: ["agent"],
  approvalPolicies: [{ id: "default", label: "Default" }],
  sandboxModes: [] as Array<{ id: string; label: string }>,
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal" as const,
  presentationMode: "terminal" as const,
};

function guiAdapter() {
  const startTurn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const openThread = vi.fn<() => Promise<string>>().mockResolvedValue("session-1");
  return {
    kind: "fixture-gui",
    label: "Fixture GUI",
    capabilities: { ...capabilities, presentationModes: ["terminal", "gui"] as const },
    detectInstall: vi.fn<() => void>(),
    buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
      binary: "fixture-gui-agent",
      args: ["should-not-spawn"],
    })),
    buildResumeArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
      binary: "fixture-gui-agent",
      args: [],
    })),
    createInitialSessionRef: vi.fn<() => undefined>(() => undefined),
    createStructuredSession: vi.fn<() => Promise<Record<string, unknown>>>(async () => ({
      launchOptions: {},
      activate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      openThread,
      startTurn,
      setListener: vi.fn<(listener: unknown) => void>(),
      dispose: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    })),
  };
}

function terminalAdapter() {
  return {
    kind: "fixture-terminal",
    label: "Fixture Terminal",
    capabilities: { ...capabilities },
    detectInstall: vi.fn<() => void>(),
    buildLaunchArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
      binary: "fixture-terminal-agent",
      args: [],
    })),
    buildResumeArgv: vi.fn<() => { binary: string; args: string[] }>(() => ({
      binary: "fixture-terminal-agent",
      args: [],
    })),
    createInitialSessionRef: vi.fn<() => undefined>(() => undefined),
  };
}

it("keeps the GUI thread-reset skip while a terminal start still resets", async () => {
  const emitted: Array<Record<string, unknown>> = [];
  const runtime = makeRuntime((event) => {
    emitted.push(event as Record<string, unknown>);
  });
  const adapters = (runtime as unknown as { adapters: Map<string, unknown> }).adapters;
  const gui = guiAdapter();
  adapters.set("fixture-gui", gui);
  adapters.set("fixture-terminal", terminalAdapter());

  const projectLocation = { kind: "windows" as const, path: "C:\\repo" };
  const initialSize = { cols: 120, rows: 30 };

  await runtime.threadSessionManager.startThread({
    threadId: "thread-reset-gui",
    projectLocation,
    agentKind: "fixture-gui",
    config: { model: "fixture-model" },
    prompt: "hi",
    presentationMode: "gui",
    initialSize,
  });

  const guiResets = emitted.filter(
    (event) => event.type === "thread-reset" && event.threadId === "thread-reset-gui",
  );
  expect(guiResets).toEqual([]);
  // The GUI start really ran: it published a working state on the structured
  // session and never spawned a PTY.
  expect(emitted).toContainEqual(
    expect.objectContaining({
      type: "thread-state",
      threadId: "thread-reset-gui",
      status: "working",
    }),
  );
  expect(gui.createStructuredSession).toHaveBeenCalledTimes(1);
  expect(ptySpawnMock).not.toHaveBeenCalled();

  ptySpawnMock.mockReturnValueOnce(createMockPty());
  await runtime.threadSessionManager.startThread({
    threadId: "thread-reset-terminal",
    projectLocation,
    agentKind: "fixture-terminal",
    config: { model: "fixture-model" },
    prompt: "hi",
    presentationMode: "terminal",
    initialSize,
  });

  const terminalResets = emitted.filter(
    (event) => event.type === "thread-reset" && event.threadId === "thread-reset-terminal",
  );
  expect(terminalResets).toHaveLength(1);
  expect(ptySpawnMock).toHaveBeenCalledTimes(1);
});
