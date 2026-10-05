import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, PromptSegment, StartThreadPayload } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type { AgentAdapter, StructuredSessionHandle } from "../agents/base";

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

vi.mock("node:timers/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: vi.fn<(delay?: number) => Promise<void>>(async () => undefined),
  };
});

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
 * A client that finds a thread's host session gone (supervisor restart,
 * unloaded thread) relaunches it with `startThread({ sessionRef, prompt })` —
 * the renderer composer's `resumeLaunch` and the `send_to_thread` MCP tool both
 * do. The resumed session must deliver that prompt as its first turn, exactly
 * once; a prompt-less reopen must still start nothing.
 */

const AGENT_KIND: AgentKind = "fixture-agent";
const MODEL = `${AGENT_KIND}/model`;
const SESSION_REF = {
  providerSessionId: "ses_existing",
  discoveredAt: "2026-10-01T00:00:00.000Z",
};

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

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function createStructuredSession(activation: Promise<void> = Promise.resolve()) {
  const startTurn = vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(async () => undefined);
  const steerTurn = vi.fn<NonNullable<StructuredSessionHandle["steerTurn"]>>(async () => undefined);
  const openThread = vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
    async () => SESSION_REF.providerSessionId,
  );
  const handle: StructuredSessionHandle = {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(() => activation),
    openThread,
    startTurn,
    steerTurn,
    setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
  };
  return { handle, startTurn, steerTurn, openThread };
}

function createAdapter(structuredSession: StructuredSessionHandle): AgentAdapter {
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
      liveInputMode: "terminal",
      presentationMode: "terminal",
      presentationModes: ["terminal", "gui"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(() => ({
      binary: AGENT_KIND,
      args: [],
    })),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(() => ({
      binary: AGENT_KIND,
      args: [],
    })),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    createStructuredSession: vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
      async (input) => (input.presentationMode === "gui" ? structuredSession : undefined),
    ),
  };
}

function createManager(adapter: AgentAdapter, events: SupervisorEvent[]): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-resume-launch-prompt-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit: (event) => events.push(event),
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, adapter]]),
    resolveWindowsShell: () => ({
      shell: "powershell.exe",
      kind: "powershell",
      args: ["-NoLogo"],
    }),
  });
  managersToDispose.push(manager);
  return manager;
}

function resumePayload(
  threadId: string,
  overrides: Partial<StartThreadPayload> = {},
): StartThreadPayload {
  return {
    threadId,
    projectLocation: { kind: "windows", path: "C:\\repo" },
    agentKind: AGENT_KIND,
    config: { model: MODEL },
    prompt: "",
    initialSize: { cols: 80, rows: 24 },
    sessionRef: SESSION_REF,
    presentationMode: "gui",
    ...overrides,
  };
}

function userMessageStarts(events: SupervisorEvent[]): string[] {
  return events.flatMap((event) =>
    event.type === "thread-runtime-event" &&
    event.event.type === "item.started" &&
    event.event.itemType === "user_message"
      ? [event.event.itemId]
      : [],
  );
}

describe("ThreadSessionManager resume launch with a pending prompt", () => {
  it("delivers the prompt exactly once as the resumed session's first turn", async () => {
    const events: SupervisorEvent[] = [];
    const structured = createStructuredSession();
    const manager = createManager(createAdapter(structured.handle), events);

    await manager.startThread(
      resumePayload("resume-with-prompt", {
        prompt: "message that found the session gone",
        userMessageItemId: "user-renderer-optimistic",
      }),
    );

    await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledOnce());
    expect(structured.openThread).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL }),
      SESSION_REF,
    );
    expect(structured.startTurn).toHaveBeenCalledWith(
      "message that found the session gone",
      expect.objectContaining({ model: MODEL }),
      undefined,
      { userMessageItemId: "user-renderer-optimistic" },
    );
    // The renderer already painted this id; the supervisor reuses it so every
    // consumer dedupes to one bubble instead of a second user message.
    expect(userMessageStarts(events)).toEqual(["user-renderer-optimistic"]);
    expect(manager.sessions.get("resume-with-prompt")?.status).toBe("working");
  });

  it("paints the message once when the resuming caller has no optimistic id", async () => {
    const events: SupervisorEvent[] = [];
    const structured = createStructuredSession();
    const manager = createManager(createAdapter(structured.handle), events);

    await manager.startThread(resumePayload("resume-from-tool", { prompt: "from a tool" }));

    await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledOnce());
    const painted = userMessageStarts(events);
    expect(painted).toHaveLength(1);
    expect(structured.startTurn).toHaveBeenCalledWith("from a tool", expect.anything(), undefined, {
      userMessageItemId: painted[0],
    });
  });

  it("starts no turn and paints nothing when reopening without a prompt", async () => {
    const events: SupervisorEvent[] = [];
    const structured = createStructuredSession();
    const manager = createManager(createAdapter(structured.handle), events);

    await manager.startThread(resumePayload("reopen-only"));

    expect(structured.openThread).toHaveBeenCalledOnce();
    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(userMessageStarts(events)).toEqual([]);
    expect(manager.sessions.get("reopen-only")?.status).toBe("idle");
  });

  it("keeps an image attachment on the delivered turn", async () => {
    const events: SupervisorEvent[] = [];
    const structured = createStructuredSession();
    const manager = createManager(createAdapter(structured.handle), events);
    const segments: PromptSegment[] = [
      { kind: "text", content: "what is in " },
      {
        kind: "attachment",
        path: "C:\\repo\\shot.png",
        mimeType: "image/png",
      },
    ];

    await manager.startThread(
      resumePayload("resume-with-attachment", {
        prompt: "what is in shot.png",
        segments,
        userMessageItemId: "user-with-attachment",
      }),
    );

    await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledOnce());
    const [, , turnSegments, options] = structured.startTurn.mock.calls[0]!;
    expect(turnSegments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "attachment", path: "C:\\repo\\shot.png" }),
      ]),
    );
    expect(options).toEqual({ userMessageItemId: "user-with-attachment" });
    expect(userMessageStarts(events)).toEqual(["user-with-attachment"]);
  });

  it("steers a second message sent during the relaunch onto the resumed turn", async () => {
    const events: SupervisorEvent[] = [];
    const activation = deferred();
    const structured = createStructuredSession(activation.promise);
    const manager = createManager(createAdapter(structured.handle), events);

    const start = manager.startThread(
      resumePayload("resume-then-steer", {
        prompt: "first message",
        userMessageItemId: "user-first",
      }),
    );
    await vi.waitFor(() => expect(structured.handle.activate).toHaveBeenCalledOnce());
    const second = manager.sendThreadInput({
      threadId: "resume-then-steer",
      prompt: "second message",
      config: { model: MODEL },
      userMessageItemId: "user-second",
    });
    activation.resolve();
    await start;
    await second;

    expect(structured.startTurn).toHaveBeenCalledExactlyOnceWith(
      "first message",
      expect.anything(),
      undefined,
      { userMessageItemId: "user-first" },
    );
    expect(structured.steerTurn).toHaveBeenCalledOnce();
    expect(structured.steerTurn.mock.calls[0]?.[0]).toBe("second message");
  });

  it("hands a terminal-presentation resume prompt to the PTY launch, not a structured turn", async () => {
    const events: SupervisorEvent[] = [];
    const structured = createStructuredSession();
    const adapter = createAdapter(structured.handle);
    const manager = createManager(adapter, events);

    await manager.startThread(
      resumePayload("terminal-resume", {
        prompt: "typed into the pty",
        presentationMode: "terminal",
      }),
    );

    expect(adapter.buildResumeArgv).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      "typed into the pty",
      SESSION_REF,
      expect.anything(),
    );
    expect(manager.sessions.get("terminal-resume")?.pty).toBeDefined();
    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(userMessageStarts(events)).toEqual([]);
  });
});
