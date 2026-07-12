import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

// These tests synchronize lifecycle races with explicit deferred promises;
// the production-only 150ms process-settle pause adds no behavioral coverage.
vi.mock("node:timers/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: vi.fn<(delay?: number) => Promise<void>>(async () => undefined),
  };
});

import { ThreadSessionManager } from "./threadSessionManager";

vi.mock("node-pty", () => ({
  spawn: vi.fn<
    () => {
      pid: number;
      kill: () => void;
      onData: () => void;
      onExit: () => void;
      write: () => void;
    }
  >(() => ({
    pid: 123,
    kill: vi.fn<() => void>(),
    onData: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
    write: vi.fn<() => void>(),
  })),
}));

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve(value: T | PromiseLike<T>): void;
  reject(reason?: unknown): void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createManager(agentKind: AgentKind, adapter: AgentAdapter): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "lightcode-start-close-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: vi.fn<() => void>(),
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[agentKind, adapter]]),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
  });
  managersToDispose.push(manager);
  return manager;
}

function createStructuredSession(
  activation: Promise<void>,
  onActivate?: () => void,
): StructuredSessionHandle {
  return {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => {
      onActivate?.();
      return activation;
    }),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => "ses_test"),
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
  };
}

function createAdapter(
  agentKind: AgentKind,
  structuredSession: StructuredSessionHandle,
): AgentAdapter {
  return {
    kind: agentKind,
    label: agentKind,
    binary: agentKind,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: agentKind,
      args: [],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: agentKind,
      args: [],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => structuredSession,
    ),
  };
}

function createInactiveRuntime(
  agentKind: AgentKind,
  adapter: AgentAdapter,
  structuredSession: StructuredSessionHandle,
): SessionRuntime {
  return {
    instanceId: `instance-${agentKind}`,
    threadId: `thread-${agentKind}`,
    agentKind,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${agentKind}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    sessionRef: { providerSessionId: "ses_existing" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    structuredSession,
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
  } as unknown as SessionRuntime;
}

const guardedStructuredProviders = ["codex", "opencode"] as const;
const managersToDispose: ThreadSessionManager[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const manager of managersToDispose.splice(0)) {
    await manager.dispose();
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("ThreadSessionManager start guards", () => {
  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session that is closed before activation completes",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.closeThread({ threadId: `thread-${agentKind}` });
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session that is interrupted before activation completes",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "hello",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.interruptThread({ threadId: `thread-${agentKind}` });
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a %s structured GUI session when the manager is disposed during activation",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const structuredSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, structuredSession);
      const manager = createManager(agentKind, adapter);

      const start = manager.startThread({
        threadId: `thread-${agentKind}`,
        projectLocation: { kind: "windows", path: "C:\\repo" },
        agentKind,
        config: { model: `${agentKind}/model` },
        prompt: "hello",
        initialSize: { cols: 80, rows: 24 },
        presentationMode: "gui",
      });
      await activationStarted.promise;
      expect(structuredSession.activate).toHaveBeenCalledTimes(1);

      await manager.dispose();
      activation.resolve();
      await start;

      expect(structuredSession.dispose).toHaveBeenCalledTimes(1);
      expect(structuredSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(`thread-${agentKind}`)).toBe(false);
    },
  );

  it.each(guardedStructuredProviders)(
    "disposes a replacement %s structured GUI session when the thread is closed during restart",
    async (agentKind) => {
      const activation = deferred<void>();
      const activationStarted = deferred<void>();
      const replacementSession = createStructuredSession(activation.promise, () =>
        activationStarted.resolve(),
      );
      const adapter = createAdapter(agentKind, replacementSession);
      const existingSession = createInactiveRuntime(
        agentKind,
        adapter,
        createStructuredSession(Promise.resolve()),
      );
      const manager = createManager(agentKind, adapter);
      manager.sessions.set(existingSession.threadId, existingSession);

      const restart = manager.sendThreadInput({
        threadId: existingSession.threadId,
        prompt: "resume work",
        config: { model: `${agentKind}/model` },
      });
      await activationStarted.promise;
      expect(replacementSession.activate).toHaveBeenCalledTimes(1);

      await manager.closeThread({ threadId: existingSession.threadId });
      activation.resolve();
      await restart;

      expect(replacementSession.dispose).toHaveBeenCalledTimes(1);
      expect(replacementSession.openThread).not.toHaveBeenCalled();
      expect(manager.sessions.has(existingSession.threadId)).toBe(false);
    },
  );
});
