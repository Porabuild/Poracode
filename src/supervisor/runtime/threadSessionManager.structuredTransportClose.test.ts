import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => unknown>(() => ({
    pid: 123,
    kill: vi.fn<() => void>(),
    onData: vi.fn<() => void>(),
    onExit: vi.fn<() => void>(),
    write: vi.fn<() => void>(),
  })),
}));

import { ThreadSessionManager } from "./threadSessionManager";

/**
 * A structured runtime whose backing process dies reports onError then
 * onClose. The thread must stay recoverable: the next submit relaunches the
 * provider and resumes the known session instead of writing into the dead
 * transport of the retired handle.
 */

const AGENT_KIND: AgentKind = "fixture-agent";
const THREAD_ID = "thread-transport-close";
const PROVIDER_SESSION_ID = "provider-session-1";

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

function createAdapter(): AgentAdapter {
  return {
    kind: AGENT_KIND,
    label: AGENT_KIND,
    binary: AGENT_KIND,
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
  } as unknown as AgentAdapter;
}

function createManager(emit: (event: SupervisorEvent) => void): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-transport-close-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, createAdapter()]]),
    resolveWindowsShell: () => ({
      shell: "powershell.exe",
      kind: "powershell",
      args: ["-NoLogo"],
    }),
  });
  managersToDispose.push(manager);
  return manager;
}

function createStructuredSession(
  startTurn: NonNullable<StructuredSessionHandle["startTurn"]>,
): StructuredSessionHandle & { listener(): StructuredSessionListener | undefined } {
  let listener: StructuredSessionListener | undefined;
  return {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => PROVIDER_SESSION_ID,
    ),
    startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(startTurn),
    forceCompleteTurn: vi.fn<() => void>(),
    setListener: vi.fn<(next: StructuredSessionListener) => void>((next) => {
      listener = next;
    }),
    dispose: vi.fn<() => Promise<void>>(async () => undefined),
    listener: () => listener,
  };
}

function createSession(
  adapter: AgentAdapter,
  structuredSession: StructuredSessionHandle,
): SessionRuntime {
  return {
    instanceId: "instance-transport-close",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: { kind: "posix", path: tmpdir() },
    config: { model: `${AGENT_KIND}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: PROVIDER_SESSION_ID },
    mcpLaunchSnapshot: {
      mcpServers: [],
      disabledBuiltInMcpServerIds: [],
    },
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    structuredSession,
  } as unknown as SessionRuntime;
}

function attach(manager: ThreadSessionManager, session: SessionRuntime): void {
  (
    manager as unknown as {
      spawnPipeline: {
        ctx: { sessionRuntimeLifecycle: { attach(session: SessionRuntime): void } };
      };
    }
  ).spawnPipeline.ctx.sessionRuntimeLifecycle.attach(session);
}

async function expectResumedSubmit(
  manager: ThreadSessionManager,
  adapter: AgentAdapter,
  dead: StructuredSessionHandle,
  replacement: StructuredSessionHandle,
  prompt: string,
): Promise<void> {
  await manager.sendThreadInput({
    threadId: THREAD_ID,
    prompt,
    config: { model: `${AGENT_KIND}/model` },
  });

  expect(dead.startTurn).not.toHaveBeenCalled();
  expect(adapter.createStructuredSession).toHaveBeenCalledTimes(1);
  expect(replacement.openThread).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ providerSessionId: PROVIDER_SESSION_ID }),
  );
  await vi.waitFor(() => {
    expect(replacement.startTurn).toHaveBeenCalledWith(
      prompt,
      expect.anything(),
      undefined,
      expect.anything(),
    );
  });
  expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBe(replacement);
}

describe("ThreadSessionManager structured transport close", () => {
  it("does not resend delivered input after an identity-less structured transport closes", async () => {
    const dead = createStructuredSession(async () => undefined);
    const adapter = createAdapter();
    const manager = createManager(() => undefined);
    const session = createSession(adapter, dead);
    delete session.sessionRef;
    session.canResumeWithConfig = false;
    attach(manager, session);

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "original task",
      config: session.config,
    });
    expect(dead.startTurn).toHaveBeenCalledOnce();
    expect(dead.startTurn).toHaveBeenCalledWith("original task", session.config, undefined, {
      userMessageItemId: expect.stringMatching(/^user-/),
    });
    expect(session.sessionRef).toBeUndefined();

    dead.listener()?.onClose();
    expect(manager.sessions.get(THREAD_ID)?.status).toBe("inactive");
    expect(session.canResumeWithConfig).toBe(false);
    expect(session.sessionRef).toBeUndefined();
    await expect(
      manager.sendThreadInput({
        threadId: THREAD_ID,
        prompt: "follow up",
        config: session.config,
      }),
    ).rejects.toThrow("This thread exited before a resumable session id was discovered.");
    expect(dead.startTurn).toHaveBeenCalledOnce();
  });

  it("relaunches and resumes on the next submit after the runtime process died", async () => {
    const events: SupervisorEvent[] = [];
    const dead = createStructuredSession(async () => {
      throw new Error("server stdin is not writable.");
    });
    const replacement = createStructuredSession(async () => undefined);
    const adapter = createAdapter();
    adapter.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => replacement,
    );
    const manager = createManager((event) => events.push(event));
    const session = createSession(adapter, dead);
    attach(manager, session);

    dead.listener()?.onError("server exited unexpectedly (code 143).");
    dead.listener()?.onClose();
    expect(manager.sessions.get(THREAD_ID)?.status).toBe("error");
    expect(manager.getThreadSnapshots()).toContainEqual(
      expect.objectContaining({
        threadId: THREAD_ID,
        status: "error",
        errorMessage: "server exited unexpectedly (code 143).",
      }),
    );

    await expectResumedSubmit(manager, adapter, dead, replacement, "after crash");
    expect(
      manager.getThreadSnapshots().find((snapshot) => snapshot.threadId === THREAD_ID),
    ).not.toHaveProperty("errorMessage");
  });

  it("detaches the retired handle and resumes on next submit after canonical overflow without onClose", async () => {
    const events: SupervisorEvent[] = [];
    // Intentional dispose() on ACP sessions suppresses onClose(). A zombie
    // handle left attached after overflow retirement would route subsequent
    // submits straight into the disposed handle (causing bogus config rejection).
    const dead = createStructuredSession(async () => {
      throw new Error(
        "The session rejected the requested configuration. Review the selected settings and try again.",
      );
    });
    const replacement = createStructuredSession(async () => undefined);
    const adapter = createAdapter();
    adapter.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => replacement,
    );
    const manager = createManager((event) => events.push(event));
    const session = createSession(adapter, dead);
    session.status = "working";
    session.attention = "working";
    session.sessionConfigOptions = [
      {
        id: "model",
        category: "model",
        type: "select",
        currentValue: `${AGENT_KIND}/model`,
        values: [{ value: `${AGENT_KIND}/model`, name: "Model" }],
        groups: [],
      },
    ];
    attach(manager, session);

    manager.stopSessionForCanonicalOverflow(
      THREAD_ID,
      "supervisor IPC queue overflow while the host was not draining",
    );

    expect(dead.forceCompleteTurn).toHaveBeenCalledOnce();
    expect(dead.dispose).toHaveBeenCalledOnce();
    expect(session.structuredSession).toBeUndefined();
    expect(session.sessionConfigOptions).toBeNull();
    expect(session.ignoreExit).toBe(true);
    expect(manager.sessions.get(THREAD_ID)?.status).toBe("error");
    expect(
      events.findLast(
        (event): event is Extract<SupervisorEvent, { type: "thread-state" }> =>
          event.type === "thread-state" && event.threadId === THREAD_ID,
      ),
    ).toMatchObject({
      status: "error",
      attention: "error",
      sessionConfigOptions: null,
      errorMessage:
        "Agent output stopped: supervisor IPC queue overflow while the host was not draining.",
    });

    // Late provider callbacks during teardown must not overwrite the stop error.
    dead.listener()?.onUpdate({ status: "idle", attention: "none" });
    expect(manager.sessions.get(THREAD_ID)?.status).toBe("error");

    await expectResumedSubmit(manager, adapter, dead, replacement, "stuck or working?");
  });

  it("joins a failed overflow disposal before resuming on next submit", async () => {
    let disposeFails = true;
    const dead = createStructuredSession(async () => {
      throw new Error("must not call startTurn on retiring handle");
    });
    dead.dispose = vi.fn<() => Promise<void>>(() =>
      disposeFails ? Promise.reject(new Error("overflow dispose failed")) : Promise.resolve(),
    );
    const replacement = createStructuredSession(async () => undefined);
    const adapter = createAdapter();
    adapter.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => replacement,
    );
    const manager = createManager(() => undefined);
    const session = createSession(adapter, dead);
    session.status = "working";
    session.attention = "working";
    attach(manager, session);

    manager.stopSessionForCanonicalOverflow(THREAD_ID, "buffer cap reached");
    expect(session.structuredSession).toBeUndefined();
    expect(session.pendingStructuredDisposal).toBeDefined();

    // First submit retries the failed disposal and refuses to launch a
    // successor until the old process is confirmed retired.
    await expect(
      manager.sendThreadInput({
        threadId: THREAD_ID,
        prompt: "first retry",
        config: { model: `${AGENT_KIND}/model` },
      }),
    ).rejects.toThrow("predecessor retirement was not confirmed");
    expect(dead.startTurn).not.toHaveBeenCalled();
    expect(adapter.createStructuredSession).not.toHaveBeenCalled();

    // Once disposal confirms, the next submit resumes cleanly.
    disposeFails = false;
    await expectResumedSubmit(manager, adapter, dead, replacement, "second retry");
  });

  it("refuses sendThreadInput cleanly instead of crashing on a missing PTY when overflow stops before sessionRef discovery", async () => {
    const dead = createStructuredSession(async () => undefined);
    const adapter = createAdapter();
    const manager = createManager(() => undefined);
    const session = createSession(adapter, dead);
    delete session.sessionRef;
    session.canResumeWithConfig = false;
    session.status = "working";
    session.attention = "working";
    const originalConfig = session.config;
    attach(manager, session);

    manager.stopSessionForCanonicalOverflow(THREAD_ID, "buffer cap reached");

    await expect(
      manager.sendThreadInput({
        threadId: THREAD_ID,
        prompt: "follow up",
        config: { model: `${AGENT_KIND}/next-model` },
      }),
    ).rejects.toThrow("This thread exited before a resumable session id was discovered.");
    expect(session.config).toBe(originalConfig);
    expect(dead.startTurn).not.toHaveBeenCalled();
  });

  it("clears pending steers, unindexes sessionRef, and ignores late CLI hook states on canonical overflow", async () => {
    const events: SupervisorEvent[] = [];
    const dead = createStructuredSession(async () => undefined);
    dead.interruptTurn = vi.fn<() => Promise<void>>(async () => undefined);
    const adapter = createAdapter();
    const manager = createManager((event) => events.push(event));
    const session = createSession(adapter, dead);
    session.status = "working";
    session.attention = "working";
    attach(manager, session);

    await manager.setPendingSteer({
      threadId: THREAD_ID,
      prompt: "queued steer",
      config: { model: `${AGENT_KIND}/model` },
    });
    expect(session.pendingSteer).toBeDefined();
    expect(manager.findSessionForCliHookPlugin({ sessionId: PROVIDER_SESSION_ID })).toBe(session);

    manager.stopSessionForCanonicalOverflow(THREAD_ID, "buffer cap reached");

    expect(session.pendingSteer).toBeUndefined();
    expect(events).toContainEqual({
      type: "thread-pending-steer",
      threadId: THREAD_ID,
      pending: null,
    });
    expect(
      (
        manager as unknown as {
          sessionsBySessionId: Map<string, SessionRuntime>;
        }
      ).sessionsBySessionId.has(PROVIDER_SESSION_ID),
    ).toBe(false);

    manager.applyCliHookPluginState(session, { status: "idle", attention: "none" });
    expect(session.status).toBe("error");
  });
});
