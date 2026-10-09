import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import type { StartThreadRuntimeInput } from "./workspaceScope";
import { SpawnPipeline, type SpawnPipelineContext } from "./threadSession/spawnPipeline";
import { spawn } from "node-pty";
import { STRUCTURED_INTERRUPT_FORCE_STOP_MS } from "./threadSession/userInterrupt";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => never>(() => {
    throw new Error("Unexpected PTY spawn");
  }),
}));
const resolveLocation = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      environment?: ThreadConfig["executionEnvironment"],
    ) => Promise<ProjectLocation>
  >(async (location) => location),
);
vi.mock("../agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../agents/base")>()),
  resolveAgentProjectLocation: resolveLocation,
  primeProjectShellEnv: async () => undefined,
}));
vi.mock("node:timers/promises", () => ({ setTimeout: async () => undefined }));

import { ThreadSessionManager } from "./threadSessionManager";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function handle(): StructuredSessionHandle {
  return {
    launchOptions: {},
    setListener: vi.fn<NonNullable<StructuredSessionHandle["setListener"]>>(),
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "fixture-session",
    ),
    dispose: vi.fn<NonNullable<StructuredSessionHandle["dispose"]>>(async () => undefined),
  };
}

function adapter(kind: string, session: StructuredSessionHandle): AgentAdapter {
  return {
    supportsStructuredWorkspaceDirectories: true,
    kind,
    label: kind,
    binary: kind,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      presentationModes: ["gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<NonNullable<AgentAdapter["detectInstall"]>>(),
    buildLaunchArgv: vi.fn<NonNullable<AgentAdapter["buildLaunchArgv"]>>(() => {
      throw new Error("Unexpected native launch");
    }),
    buildResumeArgv: vi.fn<NonNullable<AgentAdapter["buildResumeArgv"]>>(() => {
      throw new Error("Unexpected native resume");
    }),
    createInitialSessionRef: vi.fn<NonNullable<AgentAdapter["createInitialSessionRef"]>>(
      () => undefined,
    ),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => session,
    ),
  };
}

const fixtures: Array<{ manager: ThreadSessionManager; directory: string }> = [];
function managerFor(adapters: AgentAdapter[], options: Partial<ThreadSessionManagerOptions> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "poracode-pending-close-"));
  const manager = new ThreadSessionManager({
    emit: vi.fn<ThreadSessionManagerOptions["emit"]>(),
    isDev: false,
    logsDir: join(directory, "logs"),
    settingsPath: join(directory, "settings.json"),
    readDisableCliHookPlugin: () => true,
    adapters: new Map(adapters.map((value) => [value.kind, value])),
    resolveWindowsShell: () => ({ shell: "", kind: "cmd", args: [] }),
    ...options,
  });
  fixtures.push({ manager, directory });
  return manager;
}

function payload(agentKind = "fixture"): StartThreadRuntimeInput {
  return {
    threadId: "pending-close",
    agentKind,
    projectLocation: { kind: "posix", path: process.cwd() },
    config: { model: "fixture-model" },
    prompt: "",
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "gui",
  };
}

afterEach(async () => {
  resolveLocation.mockReset().mockImplementation(async (location) => location);
  vi.mocked(spawn).mockClear();
  for (const { manager, directory } of fixtures.splice(0)) {
    await manager.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});

function scopedPayload(): StartThreadRuntimeInput {
  const input = payload();
  return {
    ...input,
    workspaceScope: {
      primaryLocation: { ...input.projectLocation },
      additionalDirectories: [{ kind: "posix", path: "/approved-extra" }],
      revision: 3,
    },
  };
}

describe("approved workspace runtime launch carrier", () => {
  it.each(["new", "load", "resume"])(
    "carries detached roots through %s open and preserves legacy reopen ownership",
    async (mode) => {
      const session = handle();
      session.startTurn = vi.fn<() => Promise<void>>(async () => undefined);
      const provider = adapter("fixture", session);
      const manager = managerFor([provider]);
      const input = scopedPayload();
      if (mode !== "new")
        input.sessionRef = {
          providerSessionId: "existing",
          discoveredAt: new Date(0).toISOString(),
        };
      if (mode === "resume") input.prompt = "next";
      const expected = structuredClone(input.workspaceScope!);
      const start = manager.startThread(input);
      const mutable = input.workspaceScope!.additionalDirectories[0]!;
      if (mutable.kind === "posix") mutable.path = "/unauthorized-mutation";
      if (input.projectLocation.kind === "posix") input.projectLocation.path = "/wrong-primary";
      await start;
      expect(provider.createStructuredSession).toHaveBeenCalledWith(
        expect.objectContaining({
          projectLocation: expected.primaryLocation,
          additionalDirectories: expected.additionalDirectories,
        }),
      );
      const runtime = manager.sessions.get("pending-close")!;
      expect(runtime.workspaceScope).toEqual(expected);
      expect(runtime.executionWorkspaceScope).toEqual(expected);
      expect(Object.isFrozen(runtime.workspaceScope)).toBe(true);
      expect(Object.isFrozen(runtime.workspaceScope!.additionalDirectories[0])).toBe(true);
      expect(session.startTurn).toHaveBeenCalledTimes(mode === "resume" ? 1 : 0);
      await manager.ensureThreadRunning({
        ...payload(),
        projectLocation: expected.primaryLocation,
      });
      expect(provider.createStructuredSession).toHaveBeenCalledTimes(1);
      expect(session.dispose).not.toHaveBeenCalled();
    },
  );

  it.each(["terminal", "default-terminal", "undeclared", "absent-factory"])(
    "rejects %s before admission, helpers or retirement",
    async (mode) => {
      const session = handle();
      const provider = adapter("fixture", session);
      provider.capabilities.presentationModes = ["gui", "terminal"];
      const prepare = vi.fn<() => Promise<void>>(async () => undefined);
      const manager = managerFor([provider], { prepareSkillsForLaunch: prepare });
      await manager.startThread(payload());
      const input = scopedPayload();
      if (mode === "terminal") input.presentationMode = "terminal";
      if (mode === "default-terminal") {
        delete input.presentationMode;
        provider.capabilities.presentationMode = "terminal";
      }
      if (mode === "undeclared") delete provider.supportsStructuredWorkspaceDirectories;
      if (mode === "absent-factory") delete provider.createStructuredSession;
      prepare.mockClear();
      await expect(manager.startThread(input)).rejects.toThrow("qualified structured GUI");
      expect(prepare).not.toHaveBeenCalled();
      expect(provider.buildLaunchArgv).not.toHaveBeenCalled();
      expect(session.dispose).not.toHaveBeenCalled();
      expect(spawn).not.toHaveBeenCalled();
      expect(manager.hostResourceAdmission.usage().total).toBe(1);
    },
  );

  it.each(["undefined", "throw"])("never falls through a %s factory to PTY", async (mode) => {
    const provider = adapter("fixture", handle());
    provider.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => {
        if (mode === "throw") throw new Error("native capability refused");
        return undefined;
      },
    );
    const manager = managerFor([provider]);
    await expect(manager.startThread(scopedPayload())).rejects.toThrow(/./u);
    expect(provider.buildLaunchArgv).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("refuses malformed scope and primary mismatch before any process preparation", async () => {
    const provider = adapter("fixture", handle());
    const manager = managerFor([provider]);
    const input = scopedPayload();
    await expect(
      manager.startThread({
        ...input,
        workspaceScope: { ...input.workspaceScope!, additionalDirectories: null as never },
      }),
    ).rejects.toThrow(/./u);
    await expect(
      manager.startThread({ ...input, projectLocation: { kind: "posix", path: "/foreign" } }),
    ).rejects.toThrow("primary");
    expect(provider.createStructuredSession).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("rejects omitted/changed scopes during a pending start and on a live runtime", async () => {
    const gate = deferred();
    const session = handle();
    session.openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(async () => {
      await gate.promise;
      return "owned";
    });
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const input = scopedPayload();
    const start = manager.startThread(input);
    await expect(manager.startThread(payload())).rejects.toThrow("conflicts");
    await expect(
      manager.ensureThreadRunning({
        ...input,
        workspaceScope: { ...input.workspaceScope!, revision: 4 },
      }),
    ).rejects.toThrow("conflicts");
    gate.resolve();
    await start;
    await expect(manager.startThread(payload())).rejects.toThrow("conflicts");
    await expect(
      manager.startThread({
        ...input,
        workspaceScope: { ...input.workspaceScope!, additionalDirectories: [] },
      }),
    ).rejects.toThrow("conflicts");
    expect(session.dispose).not.toHaveBeenCalled();
    expect(provider.createStructuredSession).toHaveBeenCalledTimes(1);
  });

  it.each(["ensure", "send", "force-stopped"])(
    "preserves roots when restarting via %s",
    async (mode) => {
      const session = handle();
      session.startTurn = vi.fn<() => Promise<void>>(async () => undefined);
      const provider = adapter("fixture", session);
      const manager = managerFor([provider]);
      const input = scopedPayload();
      await manager.startThread(input);
      const previous = manager.sessions.get("pending-close")!;
      previous.status = mode === "force-stopped" ? "error" : "inactive";
      if (mode === "force-stopped") {
        previous.structuredSession = undefined;
        previous.structuredRetired = true;
      }
      if (mode === "ensure") await manager.ensureThreadRunning(payload());
      else
        await manager.sendThreadInput({
          threadId: "pending-close",
          prompt: "next",
          config: input.config,
        });
      expect(provider.createStructuredSession).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(provider.createStructuredSession!).mock.calls[1]![0].additionalDirectories,
      ).toEqual(input.workspaceScope!.additionalDirectories);
      expect(manager.sessions.get("pending-close")!.workspaceScope).toEqual(input.workspaceScope);
      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it("resolves all logical roots with an updated WSL pin and retains both host coordinate sets", async () => {
    const session = handle();
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const primary = { kind: "windows" as const, path: "C:\\repo", remoteServerId: "host-a" };
    const root = { ...primary, path: "C:\\extra" };
    const input: StartThreadRuntimeInput = {
      ...payload(),
      projectLocation: primary,
      workspaceScope: { primaryLocation: primary, additionalDirectories: [root], revision: 1 },
    };
    await manager.startThread(input);
    const old = manager.sessions.get("pending-close")!;
    old.status = "inactive";
    resolveLocation.mockImplementation(async (location, environment) => ({
      kind: "wsl",
      distro: environment!.distro,
      linuxPath:
        location === old.workspaceScope?.primaryLocation
          ? "/repo"
          : location.kind === "windows" && location.path.endsWith("repo")
            ? "/repo"
            : "/extra",
      uncPath: `\\\\wsl.localhost\\${environment!.distro}\\${location.kind === "windows" && location.path.endsWith("repo") ? "repo" : "extra"}`,
      remoteServerId: location.remoteServerId,
    }));
    await manager.sendThreadInput({
      threadId: "pending-close",
      prompt: "",
      config: { model: "fixture-model", executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
    });
    const runtime = manager.sessions.get("pending-close")!;
    expect(runtime.workspaceScope).toEqual(input.workspaceScope);
    expect(runtime.executionWorkspaceScope!.primaryLocation).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
      remoteServerId: "host-a",
      linuxPath: "/repo",
    });
    expect(runtime.executionWorkspaceScope!.additionalDirectories[0]).toMatchObject({
      kind: "wsl",
      distro: "Ubuntu",
      remoteServerId: "host-a",
      linuxPath: "/extra",
    });
    expect(old.projectLocation).toEqual(primary);
    expect(
      vi.mocked(provider.createStructuredSession!).mock.calls[1]![0].additionalDirectories,
    ).toEqual(runtime.executionWorkspaceScope!.additionalDirectories);
  });

  it("rejects a partial execution mapping before predecessor retirement", async () => {
    const session = handle();
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    await manager.startThread(scopedPayload());
    const old = manager.sessions.get("pending-close")!;
    old.status = "inactive";
    resolveLocation.mockImplementation(async (location) =>
      location.kind === "posix" && location.path === "/approved-extra"
        ? { kind: "windows", path: "C:\\extra" }
        : location,
    );
    await expect(
      manager.sendThreadInput({ threadId: "pending-close", prompt: "next", config: old.config }),
    ).rejects.toThrow("environment");
    expect(session.dispose).not.toHaveBeenCalled();
    expect(provider.createStructuredSession).toHaveBeenCalledTimes(1);
    expect(old.workspaceScope!.additionalDirectories[0]).toEqual({
      kind: "posix",
      path: "/approved-extra",
    });
  });

  it("releases a refused restart factory reservation without spawning fallback", async () => {
    const session = handle();
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    await manager.startThread(scopedPayload());
    manager.sessions.get("pending-close")!.status = "inactive";
    vi.mocked(provider.createStructuredSession!).mockResolvedValueOnce(undefined);
    await expect(
      manager.sendThreadInput({
        threadId: "pending-close",
        prompt: "next",
        config: payload().config,
      }),
    ).rejects.toThrow("Structured runtime");
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
    expect(provider.buildResumeArgv).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("retires a non-GUI structured helper without activation or PTY fallback", async () => {
    const session = handle();
    delete session.openThread;
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    await expect(manager.startThread(scopedPayload())).rejects.toThrow("structured GUI open");
    expect(session.activate).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
    expect(provider.buildLaunchArgv).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("keeps confirmed-close exclusion while a scoped execution mapping is pending", async () => {
    const gate = deferred<ProjectLocation>();
    const session = handle();
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const input = scopedPayload();
    resolveLocation.mockImplementationOnce(() => gate.promise);
    const start = manager.startThread(input);
    const close = manager.closeThreadConfirmed({ threadId: "pending-close" });
    let closed = false;
    void close.then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);
    await expect(manager.startThread(payload())).rejects.toThrow("conflicts");
    gate.resolve(input.projectLocation);
    await start;
    await expect(close).resolves.toEqual({ confirmed: true });
    expect(provider.createStructuredSession).not.toHaveBeenCalled();
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("refuses live execution-pin changes and unqualified child projection", async () => {
    const session = handle();
    session.startTurn = vi.fn<() => Promise<void>>(async () => undefined);
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    await manager.startThread(scopedPayload());
    const current = manager.sessions.get("pending-close")!;
    await expect(
      manager.sendThreadInput({
        threadId: "pending-close",
        prompt: "next",
        config: { model: "fixture-model", executionEnvironment: { kind: "wsl", distro: "Ubuntu" } },
      }),
    ).rejects.toThrow("require a session restart");
    expect(current.config.executionEnvironment).toBeUndefined();
    expect(session.startTurn).not.toHaveBeenCalled();
    expect(() => manager.getSubagentParentContext("pending-close")).toThrow("child launch carrier");
  });

  it("carries scope through the pending-steer watchdog restart", async () => {
    const session = handle();
    session.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    session.interruptTurn = vi.fn<() => Promise<void>>(async () => undefined);
    const replacement = handle();
    replacement.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const input = scopedPayload();
    await manager.startThread(input);
    const current = manager.sessions.get("pending-close")!;
    current.status = "working";
    vi.mocked(provider.createStructuredSession!).mockResolvedValueOnce(replacement);
    vi.useFakeTimers();
    try {
      await manager.setPendingSteer({
        threadId: current.threadId,
        prompt: "survive stop",
        config: current.config,
      });
      await vi.advanceTimersByTimeAsync(STRUCTURED_INTERRUPT_FORCE_STOP_MS);
    } finally {
      vi.useRealTimers();
    }
    await vi.waitFor(() => expect(replacement.startTurn).toHaveBeenCalledTimes(1));
    expect(
      vi.mocked(provider.createStructuredSession!).mock.calls[1]![0].additionalDirectories,
    ).toEqual(input.workspaceScope!.additionalDirectories);
    expect(manager.sessions.get(current.threadId)!.workspaceScope).toEqual(input.workspaceScope);
    expect(vi.mocked(replacement.startTurn!).mock.calls[0]![0]).toBe("survive stop");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("carries scope through queued follow-up restart after forced retirement", async () => {
    const session = handle();
    session.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async () => undefined,
    );
    const replacement = handle();
    replacement.startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => ({
      outcome: "completed-without-turn",
    }));
    const provider = adapter("fixture", session);
    const manager = managerFor([provider]);
    const input = scopedPayload();
    await manager.startThread(input);
    const current = manager.sessions.get("pending-close")!;
    current.status = "error";
    await manager.queueThreadFollowUp({
      threadId: current.threadId,
      prompt: "queued scope",
      config: current.config,
    });
    current.ignoreExit = true;
    current.status = "idle";
    current.structuredSession = undefined;
    current.structuredRetired = true;
    vi.mocked(provider.createStructuredSession!).mockResolvedValueOnce(replacement);
    await manager.resumeThreadFollowUps(current.threadId);
    await vi.waitFor(() => expect(replacement.startTurn).toHaveBeenCalledTimes(1));
    expect(
      vi.mocked(provider.createStructuredSession!).mock.calls[1]![0].additionalDirectories,
    ).toEqual(input.workspaceScope!.additionalDirectories);
    expect(manager.sessions.get(current.threadId)!.workspaceScope).toEqual(input.workspaceScope);
    expect(manager.getThreadFollowUpQueue(current.threadId)).toBeNull();
    expect(spawn).not.toHaveBeenCalled();
  });

  it("guards the final assembly before any PTY or runtime publication", () => {
    const provider = adapter("fixture", handle());
    const pipeline = new SpawnPipeline({} as SpawnPipelineContext);
    const input = scopedPayload();
    expect(() =>
      pipeline.spawnThread({
        threadId: "t",
        agentKind: "fixture",
        adapter: provider,
        projectLocation: input.projectLocation,
        config: input.config,
        initialSize: input.initialSize,
        launchPrompt: "",
        presentationMode: "gui",
        workspaceScope: input.workspaceScope!,
        executionWorkspaceScope: input.workspaceScope!,
        command: { command: "fixture", args: [] },
        structuredSession: handle(),
        mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
      }),
    ).toThrow("PTY");
    expect(spawn).not.toHaveBeenCalled();
  });
});
