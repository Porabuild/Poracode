import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, StartThreadPayload, ThreadPresentationMode } from "@/shared/contracts";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import {
  HostResourceAdmissionOwner,
  isHostResourceBusyError,
  type HostResourceAdmissionPolicy,
  type HostResourceBusyError,
} from "./hostResourceAdmission";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";
import { isUnsupportedThreadPresentationError } from "./threadSession/presentationSupport";
import { STRUCTURED_INTERRUPT_FORCE_STOP_MS } from "./threadSession/userInterrupt";

interface FakePty {
  pid: number;
  killed: boolean;
  exitEmitted: boolean;
  dataHandlers: Array<(data: string) => void>;
  exitHandlers: Array<(event: { exitCode: number | null }) => void>;
  onData(handler: (data: string) => void): void;
  onExit(handler: (event: { exitCode: number | null }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
  emitExit(exitCode?: number | null): void;
}

const ptyState = vi.hoisted(() => ({
  autoExitOnKill: true,
  spawned: [] as FakePty[],
}));

function createFakePty(): FakePty {
  const pty: FakePty = {
    pid: process.pid,
    killed: false,
    exitEmitted: false,
    dataHandlers: [],
    exitHandlers: [],
    onData: (handler) => {
      pty.dataHandlers.push(handler);
    },
    onExit: (handler) => {
      pty.exitHandlers.push(handler);
    },
    write: () => undefined,
    resize: () => undefined,
    kill: () => {
      pty.killed = true;
      if (ptyState.autoExitOnKill) pty.emitExit(0);
    },
    emitExit: (exitCode = 0) => {
      pty.exitEmitted = true;
      for (const handler of [...pty.exitHandlers]) handler({ exitCode });
    },
  };
  ptyState.spawned.push(pty);
  return pty;
}

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => FakePty>(() => createFakePty()),
}));

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    getRefreshedWindowsPath: vi.fn<() => string | undefined>(() => undefined),
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

// Synchronize races with explicit gates; the production settle pause adds no
// behavioral coverage to these cases.
vi.mock("node:timers/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: vi.fn<(delay?: number) => Promise<void>>(async () => undefined),
  };
});

import { ThreadSessionManager } from "./threadSessionManager";

const THREAD_AGENT: AgentKind = "host-adm";
const tempDirs: string[] = [];
const managers: ThreadSessionManager[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-host-adm-"));
  tempDirs.push(dir);
  return dir;
}

function deferred<T>(): {
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

type DisposeBehavior = () => Promise<void>;

function createHandle(
  overrides: {
    activate?: () => Promise<void>;
    dispose?: DisposeBehavior;
    interruptTurn?: () => Promise<void>;
    resolveServerRequest?: (requestId: unknown, response: unknown) => Promise<void>;
    startTurn?: () => Promise<void>;
  } = {},
): StructuredSessionHandle & {
  listener: StructuredSessionListener | undefined;
  disposeCalls: number;
  interruptCalls: number;
} {
  const state = {
    listener: undefined as StructuredSessionListener | undefined,
    disposeCalls: 0,
    interruptCalls: 0,
  };
  return {
    launchOptions: {},
    get listener() {
      return state.listener;
    },
    get disposeCalls() {
      return state.disposeCalls;
    },
    get interruptCalls() {
      return state.interruptCalls;
    },
    setListener: vi.fn<StructuredSessionHandle["setListener"]>((listener) => {
      state.listener = listener;
    }),
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(
      overrides.activate ?? (async () => undefined),
    ),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "ses_host_adm",
    ),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => {
      state.disposeCalls += 1;
      await overrides.dispose?.();
    }),
    ...(overrides.interruptTurn
      ? {
          interruptTurn: vi.fn<NonNullable<StructuredSessionHandle["interruptTurn"]>>(() => {
            state.interruptCalls += 1;
            return overrides.interruptTurn!();
          }),
        }
      : {}),
    ...(overrides.resolveServerRequest
      ? {
          resolveServerRequest: vi.fn<NonNullable<StructuredSessionHandle["resolveServerRequest"]>>(
            overrides.resolveServerRequest,
          ),
        }
      : {}),
    ...(overrides.startTurn
      ? { startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(overrides.startTurn) }
      : {}),
  };
}

function createAdapter(input: {
  presentationMode: "gui" | "terminal";
  presentationModes?: ThreadPresentationMode[];
  structured?: StructuredSessionHandle;
  createStructuredSession?: () => Promise<StructuredSessionHandle | undefined>;
}): AgentAdapter {
  return {
    kind: THREAD_AGENT,
    label: THREAD_AGENT,
    binary: THREAD_AGENT,
    capabilities: {
      models: [],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: input.presentationMode === "gui" ? "server" : "terminal",
      presentationMode: input.presentationMode,
      presentationModes: input.presentationModes ?? ["terminal", "gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: THREAD_AGENT,
      args: [],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: THREAD_AGENT,
      args: [],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    ...(input.createStructuredSession
      ? {
          createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
            input.createStructuredSession,
          ),
        }
      : input.structured
        ? {
            createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
              async () => input.structured!,
            ),
          }
        : {}),
  } as unknown as AgentAdapter;
}

function policy(overrides: Partial<HostResourceAdmissionPolicy> = {}): HostResourceAdmissionPolicy {
  return {
    maxActiveAgentSessions: 0,
    maxActiveTerminalShells: 0,
    maxActiveGenerationHelpers: 0,
    overloadRetryAfterMs: 1_000,
    ...overrides,
  };
}

function createManager(
  adapter: AgentAdapter,
  admissionPolicy: HostResourceAdmissionPolicy,
  extraOptions: Partial<ThreadSessionManagerOptions> = {},
): ThreadSessionManager {
  const dir = tempDir();
  const manager = new ThreadSessionManager({
    emit: vi.fn<(event: unknown) => void>(),
    isDev: false,
    logsDir: join(dir, "logs"),
    settingsPath: join(dir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[THREAD_AGENT, adapter]]),
    resolveWindowsShell: () => ({ shell: "", kind: "cmd" as const, args: [] }),
    admission: new HostResourceAdmissionOwner(() => admissionPolicy),
    ...extraOptions,
  });
  managers.push(manager);
  return manager;
}

function guiPayload(threadId: string, prompt = ""): StartThreadPayload {
  return {
    threadId,
    projectLocation: { kind: "posix", path: tempDir() },
    agentKind: THREAD_AGENT,
    config: { model: "host-adm/model" },
    prompt,
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "gui",
  };
}

function terminalPayload(threadId: string): StartThreadPayload {
  return {
    threadId,
    projectLocation: { kind: "posix", path: tempDir() },
    agentKind: THREAD_AGENT,
    config: { model: "host-adm/model" },
    prompt: "",
    initialSize: { cols: 80, rows: 24 },
    presentationMode: "terminal",
  };
}

async function expectBusy(promise: Promise<unknown>): Promise<HostResourceBusyError> {
  try {
    await promise;
  } catch (error) {
    if (isHostResourceBusyError(error)) return error;
    throw error;
  }
  throw new Error("expected a host_resource_busy refusal");
}

function seedInactiveSession(input: {
  manager: ThreadSessionManager;
  adapter: AgentAdapter;
  threadId: string;
  handle: StructuredSessionHandle;
  lease?: ReturnType<HostResourceAdmissionOwner["tryAcquire"]>;
}): SessionRuntime {
  const session = {
    instanceId: `old-${input.threadId}`,
    threadId: input.threadId,
    agentKind: THREAD_AGENT,
    adapter: input.adapter,
    projectLocation: { kind: "posix", path: "/repo" },
    config: { model: "host-adm/model" },
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    sessionRef: { providerSessionId: "ses_existing", discoveredAt: "2026-09-20T00:00:00.000Z" },
    status: "inactive",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    structuredSession: input.handle,
    ...(input.lease ? { resourceLease: input.lease } : {}),
  } as unknown as SessionRuntime;
  input.manager.sessions.set(input.threadId, session);
  return session;
}

afterEach(async () => {
  for (const manager of managers.splice(0)) {
    await manager.dispose();
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  ptyState.spawned.splice(0);
  ptyState.autoExitOnKill = true;
});

describe("ThreadSessionManager host resource admission", () => {
  it("counts held starts as pending and refuses the next one promptly", async () => {
    const firstGate = deferred<StructuredSessionHandle>();
    const secondGate = deferred<StructuredSessionHandle>();
    const gates = [firstGate, secondGate];
    let creations = 0;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => {
        creations += 1;
        return gates.shift()?.promise ?? Promise.resolve(createHandle());
      },
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 2 }));

    const first = manager.startThread(guiPayload("held-a"));
    const second = manager.startThread(guiPayload("held-b"));
    await vi.waitFor(() => expect(creations).toBe(2));
    expect(manager.hostResourceAdmission.usage().agentSessions).toEqual({
      active: 0,
      pending: 2,
      retiring: 0,
    });

    const refusal = await expectBusy(manager.startThread(guiPayload("held-c")));
    expect(refusal.code).toBe("host_resource_busy");
    expect(refusal.details).toMatchObject({
      resourceClass: "agent-session",
      limit: 2,
      active: 0,
      pending: 2,
    });
    expect(creations).toBe(2);

    firstGate.resolve(createHandle());
    secondGate.resolve(createHandle());
    await expect(Promise.all([first, second])).resolves.toEqual([
      { threadId: "held-a" },
      { threadId: "held-b" },
    ]);
    expect(manager.hostResourceAdmission.usage().agentSessions).toEqual({
      active: 2,
      pending: 0,
      retiring: 0,
    });

    await manager.closeThread({ threadId: "held-b" });
    expect(manager.hostResourceAdmission.usage().agentSessions).toEqual({
      active: 1,
      pending: 0,
      retiring: 0,
    });
    await expect(manager.startThread(guiPayload("held-c"))).resolves.toEqual({
      threadId: "held-c",
    });
  });

  it("coalesces concurrent same-id starts into one reservation", async () => {
    const gate = deferred<StructuredSessionHandle>();
    let creations = 0;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => {
        creations += 1;
        return gate.promise;
      },
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));

    const first = manager.startThread(guiPayload("same-id"));
    const second = manager.startThread(guiPayload("same-id"));
    await expect(second).resolves.toEqual({ threadId: "same-id" });
    await vi.waitFor(() => expect(creations).toBe(1));
    expect(manager.hostResourceAdmission.usage().total).toBe(1);

    gate.resolve(createHandle());
    await expect(first).resolves.toEqual({ threadId: "same-id" });
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });

  it("returns the reservation when a held start is cancelled before its process effect", async () => {
    const gate = deferred<StructuredSessionHandle>();
    const handle = createHandle();
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => gate.promise,
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));

    const start = manager.startThread(guiPayload("cancelled-start"));
    await vi.waitFor(() => expect(adapter.createStructuredSession).toHaveBeenCalledOnce());
    const close = manager.closeThread({ threadId: "cancelled-start" });
    gate.resolve(handle);

    await expect(start).resolves.toEqual({ threadId: "cancelled-start" });
    await close;
    expect(handle.disposeCalls).toBe(1);
    expect(manager.sessions.has("cancelled-start")).toBe(false);
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("returns the reservation when structured creation fails without a process", async () => {
    const held = deferred<StructuredSessionHandle>();
    let creations = 0;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => {
        creations += 1;
        if (creations === 2) return Promise.reject(new Error("factory exploded"));
        return held.promise;
      },
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 2 }));

    const first = manager.startThread(guiPayload("partial-a"));
    await vi.waitFor(() => expect(creations).toBe(1));
    await expect(manager.startThread(guiPayload("partial-b"))).rejects.toThrow(
      "Structured runtime session creation failed",
    );
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { pending: 1 },
    });

    held.resolve(createHandle());
    await first;
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });

  it("retains the slot and still kills the PTY when structured dispose rejects", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    ptyState.autoExitOnKill = false;
    await manager.startThread(terminalPayload("thread-dispose-rejects"));
    const session = manager.sessions.get("thread-dispose-rejects")!;
    const pty = session.pty as unknown as FakePty;
    let disposeFails = true;
    session.structuredSession = createHandle({
      dispose: () =>
        disposeFails ? Promise.reject(new Error("unconfirmed-exit")) : Promise.resolve(),
    });

    await expect(manager.closeThread({ threadId: "thread-dispose-rejects" })).rejects.toThrow(
      "unconfirmed-exit",
    );

    // The correction: the PTY kill happened despite the rejected dispose, and
    // the unconfirmed exit keeps the slot counted.
    expect(pty.killed).toBe(true);
    expect(manager.hostResourceAdmission.usage().agentSessions).toEqual({
      active: 0,
      pending: 0,
      retiring: 1,
    });

    // This session owns two effects (PTY + structured): the observed PTY exit
    // alone must not free capacity while the structured disposal is
    // unconfirmed.
    pty.emitExit(0);
    expect(manager.hostResourceAdmission.usage().total).toBe(1);

    // A later close retry joins the retained session, retries the one pending
    // disposal and releases exactly when both effects are confirmed.
    disposeFails = false;
    await manager.closeThread({ threadId: "thread-dispose-rejects" });
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("requires both owned effects before a mixed session frees capacity", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    ptyState.autoExitOnKill = true;
    await manager.startThread(terminalPayload("thread-dispose-rejects-exit"));
    const session = manager.sessions.get("thread-dispose-rejects-exit")!;
    let disposeFails = true;
    session.structuredSession = createHandle({
      dispose: () =>
        disposeFails ? Promise.reject(new Error("late-dispose-failure")) : Promise.resolve(),
    });

    await expect(manager.closeThread({ threadId: "thread-dispose-rejects-exit" })).rejects.toThrow(
      "late-dispose-failure",
    );
    // The PTY exited during retirement, but the structured side did not
    // confirm, so the slot stays counted.
    expect(manager.hostResourceAdmission.usage().total).toBe(1);

    disposeFails = false;
    await manager.closeThread({ threadId: "thread-dispose-rejects-exit" });
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("refuses new work at capacity before touching the live session; controls stay available", async () => {
    const handle = createHandle({
      interruptTurn: async () => undefined,
      resolveServerRequest: async () => undefined,
    });
    const adapter = createAdapter({ presentationMode: "gui", structured: handle });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    await manager.startThread(guiPayload("control-a"));

    await expectBusy(manager.startThread(guiPayload("control-b")));
    expect(handle.disposeCalls).toBe(0);
    expect(manager.sessions.has("control-a")).toBe(true);

    // Stop, permission resolution and close are not admission-gated.
    await manager.interruptThread({ threadId: "control-a" });
    expect(handle.interruptCalls).toBe(1);
    await manager.resolveThreadServerRequest({
      threadId: "control-a",
      requestId: "req-1",
      method: "session/request_permission",
      response: { decision: "allow" },
    });
    await manager.closeThread({ threadId: "control-a" });
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
  });

  it("ignores a stale predecessor PTY exit after its thread successor started", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    await manager.startThread({
      ...terminalPayload("thread-stale-exit"),
      sessionRef: { providerSessionId: "ses_existing", discoveredAt: "2026-09-20T00:00:00.000Z" },
    });
    const first = manager.sessions.get("thread-stale-exit")!;
    const firstPty = first.pty as unknown as FakePty;
    first.status = "inactive";

    await manager.sendThreadInput({
      threadId: "thread-stale-exit",
      prompt: "resume",
      config: { model: "host-adm/model" },
    });
    const second = manager.sessions.get("thread-stale-exit")!;
    expect(second.instanceId).not.toBe(first.instanceId);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });

    // A duplicate exit from the retired generation cannot free the successor
    // slot nor evict the successor runtime.
    firstPty.emitExit(0);
    expect(manager.sessions.get("thread-stale-exit")).toBe(second);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });

  it("hands the single slot to a same-thread replacement at full capacity", async () => {
    const oldHandle = createHandle();
    const replacement = createHandle();
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: async () => replacement,
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    const owner = manager.hostResourceAdmission as HostResourceAdmissionOwner;
    const lease = owner.tryAcquire({ resourceClass: "agent-session", key: "replace-thread" });
    lease.activate();
    const session = seedInactiveSession({
      manager,
      adapter,
      threadId: "replace-thread",
      handle: oldHandle,
      lease,
    });

    await expectBusy(manager.startThread(guiPayload("other-thread")));
    await manager.sendThreadInput({
      threadId: "replace-thread",
      prompt: "resume",
      config: { model: "host-adm/model" },
    });

    const replacementRuntime = manager.sessions.get("replace-thread");
    expect(replacementRuntime).toBeDefined();
    expect(replacementRuntime?.instanceId).not.toBe(session.instanceId);
    expect(oldHandle.disposeCalls).toBe(1);
    expect(adapter.createStructuredSession).toHaveBeenCalledOnce();
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, pending: 0, retiring: 0 },
    });
    expect(lease.state).toBe("released");
  });

  it("does not start a successor while the predecessor's retirement is unconfirmed, then retries", async () => {
    let disposeFails = true;
    const oldHandle = createHandle({
      dispose: () =>
        disposeFails ? Promise.reject(new Error("provider still alive")) : Promise.resolve(),
    });
    const replacement = createHandle();
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: async () => replacement,
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    const owner = manager.hostResourceAdmission as HostResourceAdmissionOwner;
    const lease = owner.tryAcquire({ resourceClass: "agent-session", key: "unconfirmed" });
    lease.activate();
    const session = seedInactiveSession({
      manager,
      adapter,
      threadId: "unconfirmed",
      handle: oldHandle,
      lease,
    });

    await expect(
      manager.sendThreadInput({
        threadId: "unconfirmed",
        prompt: "resume",
        config: { model: "host-adm/model" },
      }),
    ).rejects.toThrow("predecessor retirement was not confirmed");
    expect(adapter.createStructuredSession).not.toHaveBeenCalled();
    expect(manager.sessions.get("unconfirmed")).toBe(session);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 0, pending: 0, retiring: 1 },
    });

    // A retry joins/retries disposal, then binds the successor generation.
    disposeFails = false;
    session.status = "inactive";
    await manager.sendThreadInput({
      threadId: "unconfirmed",
      prompt: "resume again",
      config: { model: "host-adm/model" },
    });
    expect(adapter.createStructuredSession).toHaveBeenCalledOnce();
    expect(manager.sessions.get("unconfirmed")?.instanceId).not.toBe(session.instanceId);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });

  it("retains a force-stopped handle across close/restart retries until disposal confirms", async () => {
    let disposeFails = true;
    const forceStopped = createHandle({
      interruptTurn: async () => undefined,
      dispose: () =>
        disposeFails ? Promise.reject(new Error("force-stop dispose rejected")) : Promise.resolve(),
    });
    const replacement = createHandle();
    let creation: () => Promise<StructuredSessionHandle | undefined> = async () => forceStopped;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => creation(),
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    await manager.startThread(guiPayload("force-stop-retry"));
    const session = manager.sessions.get("force-stop-retry")!;
    session.status = "working";
    session.attention = "working";

    vi.useFakeTimers();
    try {
      await manager.interruptThread({ threadId: "force-stop-retry" });
      await vi.advanceTimersByTimeAsync(STRUCTURED_INTERRUPT_FORCE_STOP_MS);
    } finally {
      vi.useRealTimers();
    }
    expect(forceStopped.disposeCalls).toBe(1);
    expect(session.structuredSession).toBeUndefined();
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { retiring: 1 },
    });

    // A close must not infer retirement from the cleared handle: it retries
    // the retained disposal, reports its failure, and the slot stays counted.
    await expect(manager.closeThread({ threadId: "force-stop-retry" })).rejects.toThrow(
      "force-stop dispose rejected",
    );
    expect(manager.hostResourceAdmission.usage().total).toBe(1);

    // A same-key start retry re-runs the one pending disposal; while it still
    // rejects, no successor process is created.
    creation = async () => replacement;
    session.status = "idle";
    await expect(manager.startThread(guiPayload("force-stop-retry"))).rejects.toThrow(
      "force-stop dispose rejected",
    );
    // The close retry and the start retry each re-ran the one retained
    // disposal; still no successor process was created.
    expect(forceStopped.disposeCalls).toBe(3);
    expect(adapter.createStructuredSession).toHaveBeenCalledOnce();

    // Once the disposal confirms, the same key starts again without a
    // supervisor restart, and a late close from the retired generation cannot
    // free the successor's slot.
    disposeFails = false;
    await manager.startThread(guiPayload("force-stop-retry"));
    expect(manager.sessions.get("force-stop-retry")?.structuredSession).toBe(replacement);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, retiring: 0 },
    });

    forceStopped.listener?.onClose();
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });

  it("retries an abandoned unpublished start's cleanup on the next start", async () => {
    const gate = deferred<StructuredSessionHandle>();
    let disposeCalls = 0;
    const abandoned = createHandle({
      dispose: () => {
        disposeCalls += 1;
        return disposeCalls === 1
          ? Promise.reject(new Error("cleanup rejected once"))
          : Promise.resolve();
      },
    });
    const replacement = createHandle();
    let creation: () => Promise<StructuredSessionHandle | undefined> = () => gate.promise;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => creation(),
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));

    const start = manager.startThread(guiPayload("abandoned-retry"));
    await vi.waitFor(() => expect(adapter.createStructuredSession).toHaveBeenCalledOnce());
    const close = manager.closeThread({ threadId: "abandoned-retry" });
    gate.resolve(abandoned);
    await expect(start).rejects.toThrow("cleanup rejected once");
    await close;
    expect(disposeCalls).toBe(1);
    expect(manager.sessions.has("abandoned-retry")).toBe(false);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { retiring: 1 },
    });

    // The retry joins the retained custody, re-runs the disposal and then
    // acquires a fresh reservation: no duplicate-key refusal, no restart.
    creation = async () => replacement;
    await manager.startThread(guiPayload("abandoned-retry"));
    expect(disposeCalls).toBe(2);
    expect(adapter.createStructuredSession).toHaveBeenCalledTimes(2);
    expect(manager.sessions.get("abandoned-retry")?.structuredSession).toBe(replacement);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, retiring: 0 },
    });
  });

  it("retains a discarded non-kept handle's failed disposal across starts", async () => {
    let disposeCalls = 0;
    const discarded = createHandle({
      dispose: () => {
        disposeCalls += 1;
        return disposeCalls === 1
          ? Promise.reject(new Error("discard cleanup rejected"))
          : Promise.resolve();
      },
    });
    const replacement = createHandle();
    let creation: () => Promise<StructuredSessionHandle | undefined> = async () => discarded;
    const adapter = createAdapter({
      presentationMode: "terminal",
      createStructuredSession: () => creation(),
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));

    await expect(manager.startThread(terminalPayload("discard-retry"))).rejects.toThrow(
      "discard cleanup rejected",
    );
    expect(disposeCalls).toBe(1);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { retiring: 1 },
    });

    creation = async () => replacement;
    await manager.startThread(terminalPayload("discard-retry"));
    expect(disposeCalls).toBe(2);
    expect(manager.sessions.has("discard-retry")).toBe(true);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, retiring: 0 },
    });
  });

  it("bounds a close while a structured disposal hangs and releases on its later completion", async () => {
    const disposal = deferred<void>();
    const handle = createHandle({ dispose: () => disposal.promise });
    const adapter = createAdapter({ presentationMode: "gui", structured: handle });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }), {
      structuredDisposalTimeoutMs: 25,
    });
    await manager.startThread(guiPayload("hanging-close"));

    const closeStartedAt = Date.now();
    await manager.closeThread({ threadId: "hanging-close" });
    expect(Date.now() - closeStartedAt).toBeLessThan(2_000);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { retiring: 1 },
    });

    // A same-key start joins the still-pending disposal and stays refused
    // while it is unconfirmed; capacity is still held.
    await expect(manager.startThread(guiPayload("hanging-close"))).rejects.toThrow(
      "retirement is still unconfirmed",
    );
    expect(manager.hostResourceAdmission.usage().total).toBe(1);

    // The operation was never cancelled: its real completion releases exactly
    // once and the same key starts again.
    disposal.resolve();
    await vi.waitFor(() => expect(manager.hostResourceAdmission.usage().total).toBe(0));
    await manager.startThread(guiPayload("hanging-close"));
    expect(manager.sessions.has("hanging-close")).toBe(true);
  });

  it("retries an abandoned handoff successor before acquiring the next reservation", async () => {
    let successorDisposeCalls = 0;
    const abandonedSuccessor = createHandle({
      activate: () => Promise.reject(new Error("successor activate failed")),
      dispose: () => {
        successorDisposeCalls += 1;
        return successorDisposeCalls === 1
          ? Promise.reject(new Error("successor cleanup rejected"))
          : Promise.resolve();
      },
    });
    const replacement = createHandle();
    let creation: () => Promise<StructuredSessionHandle | undefined> = async () =>
      abandonedSuccessor;
    const adapter = createAdapter({
      presentationMode: "gui",
      createStructuredSession: () => creation(),
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));
    const owner = manager.hostResourceAdmission as HostResourceAdmissionOwner;
    const predecessorLease = owner.tryAcquire({
      resourceClass: "agent-session",
      key: "handoff-abandon",
    });
    predecessorLease.activate();
    seedInactiveSession({
      manager,
      adapter,
      threadId: "handoff-abandon",
      handle: createHandle(),
      lease: predecessorLease,
    });

    // The failed activation's disposal also fails, so the abandonment reports
    // the cleanup failure and retains the successor custody.
    await expect(manager.startThread(guiPayload("handoff-abandon"))).rejects.toThrow(
      "successor cleanup rejected",
    );
    expect(predecessorLease.state).toBe("released");
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 0, pending: 0, retiring: 1 },
    });

    // The abandoned successor's retained cleanup is joined before a new
    // reservation; once it confirms, the same key starts fresh.
    creation = async () => replacement;
    await manager.startThread(guiPayload("handoff-abandon"));
    expect(successorDisposeCalls).toBe(2);
    expect(manager.sessions.get("handoff-abandon")?.structuredSession).toBe(replacement);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1, retiring: 0 },
    });
  });

  it("refuses an undeclared presentation before any process or teardown effect", async () => {
    const handle = createHandle();
    const adapter = createAdapter({
      presentationMode: "gui",
      presentationModes: ["gui"],
      structured: handle,
    });
    const manager = createManager(adapter, policy({ maxActiveAgentSessions: 1 }));

    let refusal: unknown;
    try {
      await manager.startThread(terminalPayload("undeclared-mode"));
    } catch (error) {
      refusal = error;
    }
    expect(isUnsupportedThreadPresentationError(refusal)).toBe(true);
    expect(adapter.createStructuredSession).not.toHaveBeenCalled();
    expect(handle.disposeCalls).toBe(0);
    expect(manager.hostResourceAdmission.usage().total).toBe(0);

    // A no-mode request keeps the adapter's declared default (compatibility).
    await manager.startThread(guiPayload("undeclared-mode"));
    expect(manager.sessions.get("undeclared-mode")?.presentationMode).toBe("gui");
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      agentSessions: { active: 1 },
    });
  });
});

describe("ThreadSessionManager shell admission", () => {
  it("requires a same-id shell's exit and holds one slot across the handoff", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(
      adapter,
      policy({ maxActiveTerminalShells: 1, maxActiveAgentSessions: 0 }),
    );
    const location = { kind: "posix" as const, path: tempDir() };
    await manager.startShell({ shellId: "shell:one", projectLocation: location });
    const first = manager.shellSessions.get("shell:one")!;
    expect(manager.hostResourceAdmission.usage().terminalShells.active).toBe(1);

    await manager.startShell({ shellId: "shell:one", projectLocation: location });
    const second = manager.shellSessions.get("shell:one")!;
    expect(second.instanceId).not.toBe(first.instanceId);
    expect((first.pty as unknown as FakePty).killed).toBe(true);
    expect((first.pty as unknown as FakePty).exitEmitted).toBe(true);
    expect(manager.hostResourceAdmission.usage()).toMatchObject({
      total: 1,
      terminalShells: { active: 1, retiring: 0 },
    });

    // A stale duplicate exit from the predecessor cannot free or evict the
    // successor generation.
    (first.pty as unknown as FakePty).emitExit(0);
    expect(manager.shellSessions.get("shell:one")).toBe(second);
    expect(manager.hostResourceAdmission.usage().total).toBe(1);
  });

  it("refuses a shell replacement while the predecessor's exit is unconfirmed", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(
      adapter,
      policy({ maxActiveTerminalShells: 1, maxActiveAgentSessions: 0 }),
    );
    const location = { kind: "posix" as const, path: tempDir() };
    ptyState.autoExitOnKill = false;
    await manager.startShell({ shellId: "shell:stuck", projectLocation: location });
    const first = manager.shellSessions.get("shell:stuck")!;
    const spawnsBefore = ptyState.spawned.length;

    await expect(
      manager.startShell({ shellId: "shell:stuck", projectLocation: location }),
    ).rejects.toThrow("did not confirm exit");
    expect(ptyState.spawned.length).toBe(spawnsBefore);
    expect(manager.shellSessions.get("shell:stuck")).toBe(first);
    expect(manager.hostResourceAdmission.usage().terminalShells).toEqual({
      active: 0,
      pending: 0,
      retiring: 1,
    });

    // The retiring slot still blocks an unrelated shell of the same class.
    await expectBusy(manager.startShell({ shellId: "shell:other", projectLocation: location }));

    (first.pty as unknown as FakePty).emitExit(0);
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
    await manager.startShell({ shellId: "shell:other", projectLocation: location });
    expect(manager.shellSessions.has("shell:other")).toBe(true);
  });

  it("retains an unconfirmed closed shell and retries the kill on the next start", async () => {
    const adapter = createAdapter({ presentationMode: "terminal" });
    const manager = createManager(adapter, policy({ maxActiveTerminalShells: 1 }));
    const location = { kind: "posix" as const, path: tempDir() };
    ptyState.autoExitOnKill = false;
    await manager.startShell({ shellId: "shell:close-retry", projectLocation: location });
    const first = manager.shellSessions.get("shell:close-retry")!;
    const spawnsBefore = ptyState.spawned.length;

    await manager.closeThread({ threadId: "shell:close-retry" });
    expect(manager.shellSessions.has("shell:close-retry")).toBe(false);
    expect(manager.hostResourceAdmission.usage().terminalShells).toEqual({
      active: 0,
      pending: 0,
      retiring: 1,
    });

    // A same-id start joins the retained kill and refuses while unconfirmed.
    await expect(
      manager.startShell({ shellId: "shell:close-retry", projectLocation: location }),
    ).rejects.toThrow("did not confirm exit");
    expect(ptyState.spawned.length).toBe(spawnsBefore);

    // The real exit releases exactly once and the same id starts again.
    (first.pty as unknown as FakePty).emitExit(0);
    expect(manager.hostResourceAdmission.usage().total).toBe(0);
    await manager.startShell({ shellId: "shell:close-retry", projectLocation: location });
    expect(manager.shellSessions.has("shell:close-retry")).toBe(true);
    expect(manager.hostResourceAdmission.usage().terminalShells.active).toBe(1);
  });
});
