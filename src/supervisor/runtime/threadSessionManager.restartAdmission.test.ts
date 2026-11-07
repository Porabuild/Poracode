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

const AGENT_KIND: AgentKind = "fixture-agent";
const THREAD_ID = "thread-restart-admission";
const PROJECT_LOCATION = {
  kind: "wsl",
  distro: "fixture-distro",
  linuxPath: "/tmp/fixture-project",
  uncPath: "\\\\wsl.localhost\\fixture-distro\\tmp\\fixture-project",
} as const;

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
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-restart-admission-"));
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

function createSession(adapter: AgentAdapter): SessionRuntime {
  return {
    instanceId: "instance-restart-admission",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: PROJECT_LOCATION,
    config: { model: `${AGENT_KIND}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: "provider-session-1" },
    mcpLaunchSnapshot: {
      mcpServers: [],
      disabledBuiltInMcpServerIds: [],
    },
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
  } as unknown as SessionRuntime;
}

describe("ThreadSessionManager restart admission", () => {
  it("resolves a restarted direct submit once the provider accepts the prompt, before the turn completes", async () => {
    const turnDone = Promise.withResolvers<void>();
    let listener: StructuredSessionListener | undefined;
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async (_prompt, _config, _segments, options) => {
        listener?.onUpdate({ status: "working", attention: "working" });
        options?.onPromptSubmitted?.();
        await turnDone.promise;
      },
    );
    const replacement: StructuredSessionHandle = {
      launchOptions: {},
      activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
      openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
        async () => "provider-thread",
      ),
      startTurn,
      setListener: vi.fn<(next: StructuredSessionListener) => void>((next) => {
        listener = next;
      }),
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
    };
    const adapter = createAdapter();
    adapter.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => replacement,
    );
    const manager = createManager(() => undefined);
    const session = createSession(adapter);
    manager.sessions.set(THREAD_ID, session);

    let settled = false;
    const send = manager
      .sendThreadInput({
        threadId: THREAD_ID,
        prompt: "restart admission marker",
        config: { model: "fixture-model" },
      })
      .then(() => {
        settled = true;
      });

    await vi.waitFor(() => expect(settled).toBe(true));

    expect(startTurn).toHaveBeenCalledOnce();
    expect(startTurn.mock.calls[0]?.[0]).toBe("restart admission marker");
    const current = manager.sessions.get(THREAD_ID);
    expect(current?.structuredSession).toBe(replacement);
    expect(current).toMatchObject({ status: "working", attention: "working" });

    turnDone.resolve();
    await send;
  });

  it("settles a turn that fails after admission on the thread without rejecting the submit", async () => {
    const failTurn = Promise.withResolvers<void>();
    let listener: StructuredSessionListener | undefined;
    const turnError = new Error("turn failed after admission");
    const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async (_prompt, _config, _segments, options) => {
        listener?.onUpdate({ status: "working", attention: "working" });
        options?.onPromptSubmitted?.();
        await failTurn.promise;
        throw turnError;
      },
    );
    const replacement: StructuredSessionHandle = {
      launchOptions: {},
      activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
      openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
        async () => "provider-thread",
      ),
      startTurn,
      setListener: vi.fn<(next: StructuredSessionListener) => void>((next) => {
        listener = next;
      }),
      dispose: vi.fn<() => Promise<void>>(async () => undefined),
    };
    const adapter = createAdapter();
    adapter.createStructuredSession = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async () => replacement,
    );
    const events: SupervisorEvent[] = [];
    const manager = createManager((event) => events.push(event));
    const session = createSession(adapter);
    manager.sessions.set(THREAD_ID, session);

    const send = manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "restart admission failure marker",
      config: { model: "fixture-model" },
    });

    await expect(send).resolves.toBeUndefined();

    failTurn.resolve();
    await vi.waitFor(() => {
      expect(manager.sessions.get(THREAD_ID)).toMatchObject({
        status: "error",
        attention: "error",
      });
      expect(
        events.some(
          (event) =>
            event.type === "thread-runtime-event" &&
            event.event.type === "error" &&
            event.event.message === turnError.message,
        ),
      ).toBe(true);
    });
  });
});
