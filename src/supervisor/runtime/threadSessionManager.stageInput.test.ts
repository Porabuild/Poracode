import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentCapability, AgentKind, ThreadStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter } from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";
import type { ThreadSessionManagerOptions } from "./threadSession/managerOptions";

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
 * Covers `stageThreadInput`: typing a browser element-picker selection into a
 * terminal-native thread's PTY input line WITHOUT submitting it. The result
 * must be a single line (no newline that would submit early) and must reference
 * the screenshot as an `@path`, and the call must reject for non-terminal
 * threads / threads that aren't ready.
 */

const AGENT_KIND: AgentKind = "claude";
const THREAD_ID = "thread-stage";

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

function createAdapter(
  liveInputMode: "terminal" | "server",
  capsOverride?: Partial<AgentCapability>,
): AgentAdapter {
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
      liveInputMode,
      presentationMode: liveInputMode === "server" ? "gui" : "terminal",
      presentationModes: liveInputMode === "server" ? ["gui"] : ["terminal"],
      settingDefs: [],
      ...capsOverride,
    },
  } as unknown as AgentAdapter;
}

function createManager(
  adapter: AgentAdapter,
  extraOptions: Partial<ThreadSessionManagerOptions> = {},
): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-stage-input-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: (_event: SupervisorEvent) => {},
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, adapter]]),
    windowsShell: { shell: "powershell.exe", kind: "powershell", args: ["-NoLogo"] },
    ...extraOptions,
  });
  managersToDispose.push(manager);
  return manager;
}

function createSession(
  adapter: AgentAdapter,
  write: (data: string) => void,
  status: ThreadStatus = "idle",
): SessionRuntime {
  return {
    instanceId: "instance-stage",
    threadId: THREAD_ID,
    agentKind: AGENT_KIND,
    adapter,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    config: { model: `${AGENT_KIND}/model` },
    runtimeLaunchConfig: { model: `${AGENT_KIND}/model` },
    terminalSize: { cols: 80, rows: 24 },
    launchPrompt: "",
    status,
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    presentationMode: adapter.capabilities.presentationMode,
    pty: { write } as SessionRuntime["pty"],
  } as unknown as SessionRuntime;
}

describe("ThreadSessionManager.stageThreadInput", () => {
  it("types a single-line selection with an @path screenshot into the PTY (no submit)", async () => {
    const adapter = createAdapter("terminal");
    const manager = createManager(adapter);
    const write = vi.fn<(data: string) => void>();
    manager.sessions.set(THREAD_ID, createSession(adapter, write));

    await manager.stageThreadInput({
      threadId: THREAD_ID,
      prompt: "Selected element `button.cta` from https://x.test",
      segments: [
        { kind: "attachment", path: "/var/tmp/lc/shot.png", mimeType: "image/png" },
        {
          kind: "text",
          content: "\n\nSelected element `button.cta` from https://x.test\n",
        },
      ],
    });

    expect(write).toHaveBeenCalledTimes(1);
    const written = write.mock.calls[0]![0];
    // No newline — a bare \n would submit the line in most shells/TUIs.
    expect(written).not.toContain("\n");
    expect(written).toContain("Selected element `button.cta` from https://x.test");
    expect(written).toContain("@/var/tmp/lc/shot.png");
  });

  it("rejects for a structured (GUI / server) thread", async () => {
    const adapter = createAdapter("server");
    const manager = createManager(adapter);
    const write = vi.fn<(data: string) => void>();
    manager.sessions.set(THREAD_ID, createSession(adapter, write));

    await expect(manager.stageThreadInput({ threadId: THREAD_ID, prompt: "x" })).rejects.toThrow(
      /terminal-native/,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("rejects when the thread is not ready (launching/inactive)", async () => {
    const adapter = createAdapter("terminal");
    const manager = createManager(adapter);
    const write = vi.fn<(data: string) => void>();
    manager.sessions.set(THREAD_ID, createSession(adapter, write, "launching"));

    await expect(manager.stageThreadInput({ threadId: THREAD_ID, prompt: "x" })).rejects.toThrow(
      /not ready/,
    );
    expect(write).not.toHaveBeenCalled();
  });

  it("copies out-of-workspace attachments into the project for sandboxed agents", async () => {
    const projectDir = mkdtempSync(join(tmpdir(), "poracode-stage-project-"));
    tempDirs.push(projectDir);
    const outsideDir = mkdtempSync(join(tmpdir(), "poracode-stage-outside-"));
    tempDirs.push(outsideDir);
    const shot = join(outsideDir, "shot.png");
    writeFileSync(shot, "png");

    const adapter = createAdapter("terminal", { requiresWorkspaceLocalAttachments: true });
    const manager = createManager(adapter);
    const write = vi.fn<(data: string) => void>();
    const session = createSession(adapter, write);
    session.projectLocation = { kind: "posix", path: projectDir };
    manager.sessions.set(THREAD_ID, session);

    await manager.stageThreadInput({
      threadId: THREAD_ID,
      prompt: "x",
      segments: [{ kind: "attachment", path: shot, mimeType: "image/png" }],
    });

    expect(existsSync(join(projectDir, ".poracode", "attachments", "shot.png"))).toBe(true);
    const written = write.mock.calls[0]![0];
    expect(written).toContain("shot.png");
    // The pick references the in-project copy, not the original outside path.
    expect(written).not.toContain(outsideDir);
  });

  it("does not stage the raw prompt when plugin policy filters every segment", async () => {
    const adapter = createAdapter("terminal");
    const filterPluginSkillSegments = vi.fn<
      NonNullable<ThreadSessionManagerOptions["filterPluginSkillSegments"]>
    >(() => []);
    const manager = createManager(adapter, { filterPluginSkillSegments });
    const write = vi.fn<(data: string) => void>();
    manager.sessions.set(THREAD_ID, createSession(adapter, write));

    await manager.stageThreadInput({
      threadId: THREAD_ID,
      prompt: "/browser-control",
      segments: [
        {
          kind: "skill",
          name: "browser-control",
          path: "C:\\plugins\\browser-control\\SKILL.md",
          invocation: "/browser-control",
          provider: "Browser Tools",
          scope: "global",
        },
      ],
    });

    expect(filterPluginSkillSegments).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });
});
