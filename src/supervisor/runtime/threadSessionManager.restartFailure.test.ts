import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "../agents/base";
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
 * Covers the restart-failure settle path: when a sessionRef restart fails
 * (e.g. a provider-side `sessionInUse` lock error after an orphaned host
 * survived teardown), the submitted turn must settle with a visible error —
 * an error item plus an errored thread state — instead of stranding the
 * thread "working" forever with the send lost.
 */

const AGENT_KIND: AgentKind = "claude";
const THREAD_ID = "thread-restart-failure";

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
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-restart-failure-"));
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
    instanceId: "instance-restart-failure",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${AGENT_KIND}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    sessionRef: { providerSessionId: "provider-session-1" },
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
  } as unknown as SessionRuntime;
}

describe("ThreadSessionManager restart failure settle", () => {
  it("settles the turn with an error item and errored state when the restart fails", async () => {
    const events: SupervisorEvent[] = [];
    const manager = createManager((event) => events.push(event));
    const adapter = createAdapter();
    const session = createSession(adapter);
    manager.sessions.set(THREAD_ID, session);

    const restartError = new Error("session provider-session-1 is already in use");
    vi.spyOn(
      (manager as unknown as { spawnPipeline: { restartThread: () => Promise<void> } })
        .spawnPipeline,
      "restartThread",
    ).mockRejectedValue(restartError);

    await expect(
      manager.sendThreadInput({
        threadId: THREAD_ID,
        prompt: "follow-up marker",
        config: { model: `${AGENT_KIND}/model` },
      }),
    ).rejects.toThrow(/already in use/);

    const stateEvent = events.find(
      (event) =>
        event.type === "thread-state" &&
        event.status === "error" &&
        event.errorMessage?.includes("already in use"),
    );
    expect(stateEvent).toBeDefined();

    // The router buffers runtime events behind a 16ms flush timer — wait it
    // out, then prove the visible error ITEM (not just the state's
    // errorMessage) reached the renderer.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const errorItem = events.find(
      (event) => event.type === "thread-runtime-event" && event.event.type === "error",
    );
    if (errorItem?.type !== "thread-runtime-event" || errorItem.event.type !== "error") {
      throw new Error("expected a thread-runtime-event carrying an error event");
    }
    expect(errorItem.event.message).toContain("already in use");
  });
});
