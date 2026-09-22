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

describe("ThreadSessionManager structured transport close", () => {
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

    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "after crash",
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
        "after crash",
        expect.anything(),
        undefined,
        expect.anything(),
      );
    });
    expect(manager.sessions.get(THREAD_ID)?.structuredSession).toBe(replacement);
  });
});
