import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, SessionConfigOptions } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "../agents/base";
import type { WindowsShellPreference } from "../shellPreference";
import type { SessionRuntime } from "./sessionTypes";

const captureSupervisorException = vi.hoisted(() =>
  vi.fn<(error: unknown, tags?: Record<string, string>) => void>(),
);

vi.mock("../diagnostics/sentry", async (importActual) => {
  const actual = await importActual<typeof import("../diagnostics/sentry")>();
  return { ...actual, captureSupervisorException };
});

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    getRefreshedWindowsPath: vi.fn<() => string | undefined>(() => undefined),
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
  };
});

vi.mock("node-pty", () => ({
  spawn: vi.fn<() => never>(() => {
    throw new Error("no PTY expected in snapshot tests");
  }),
}));

import { ThreadSessionManager } from "./threadSessionManager";

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

function createManager(agentKind: AgentKind, adapter: AgentAdapter): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-snapshot-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: vi.fn<(event: SupervisorEvent) => void>(),
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[agentKind, adapter]]),
    resolveWindowsShell: (): WindowsShellPreference => ({
      shell: "powershell.exe",
      kind: "powershell" as const,
      args: ["-NoLogo"],
    }),
  });
  managersToDispose.push(manager);
  return manager;
}

function createAdapter(agentKind: AgentKind): AgentAdapter {
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
  } as unknown as AgentAdapter;
}

function createRuntime(
  agentKind: AgentKind,
  threadId: string,
  sessionConfigOptions: SessionRuntime["sessionConfigOptions"],
): SessionRuntime {
  return {
    instanceId: `instance-${threadId}`,
    threadId,
    agentKind,
    adapter: createAdapter(agentKind),
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${agentKind}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status: "idle",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: "gui",
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
    ...(sessionConfigOptions !== undefined ? { sessionConfigOptions } : {}),
  } as unknown as SessionRuntime;
}

describe("ThreadSessionManager snapshots / session config options", () => {
  it("carries negotiated inventories and explicit null retirements, and omits never-stated ones", () => {
    const agentKind = "gemini" as AgentKind;
    const manager = createManager(agentKind, createAdapter(agentKind));
    const inventory: SessionConfigOptions = [
      {
        type: "select",
        id: "thought_level",
        category: "thought_level",
        role: "effort",
        currentValue: "low",
        values: [
          { value: "low", name: "Low" },
          { value: "high", name: "High" },
        ],
        groups: [],
      },
    ];
    manager.sessions.set("thread-live", createRuntime(agentKind, "thread-live", inventory));
    manager.sessions.set("thread-retired", createRuntime(agentKind, "thread-retired", null));
    manager.sessions.set("thread-fresh", createRuntime(agentKind, "thread-fresh", undefined));

    const snapshots = manager.getThreadSnapshots();
    expect(snapshots.every((entry) => entry.agentKind === agentKind)).toBe(true);

    expect(
      snapshots.find((entry) => entry.threadId === "thread-live")?.sessionConfigOptions,
    ).toEqual(inventory);
    // A retirement must survive the pulled snapshot — not be collapsed into
    // absence, which older-host semantics would ignore.
    expect(
      snapshots.find((entry) => entry.threadId === "thread-retired")?.sessionConfigOptions,
    ).toBeNull();
    expect(
      snapshots.find((entry) => entry.threadId === "thread-fresh")?.sessionConfigOptions,
    ).toBeUndefined();
  });
});
