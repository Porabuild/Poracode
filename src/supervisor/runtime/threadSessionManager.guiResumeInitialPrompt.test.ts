import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, PromptSegment, SessionRef } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import type {
  AgentAdapter,
  StructuredSessionHandle,
  StructuredSessionListener,
} from "../agents/base";
import type { SessionRuntime } from "./sessionTypes";

// These tests synchronize lifecycle races with explicit deferred promises;
// the production-only 150ms process-settle pause adds no behavioral coverage.
vi.mock("node:timers/promises", async (importActual) => {
  const actual = await importActual<typeof import("node:timers/promises")>();
  return {
    ...actual,
    setTimeout: vi.fn<(delay?: number) => Promise<void>>(async () => undefined),
  };
});

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeProjectShellEnv: vi.fn<(cwd: string) => Promise<Record<string, string> | undefined>>(() =>
      Promise.resolve(undefined),
    ),
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

import { ThreadSessionManager, type ThreadSessionManagerOptions } from "./threadSessionManager";

/**
 * GUI resume prompt admission, through the real start pipeline.
 *
 * A GUI launch whose payload carries an explicit prompt must admit that prompt
 * exactly once after a successful open — whether the open is fresh or a resume
 * of an owned provider reference. `openThread` cannot carry a prompt, so the
 * optimistic user emission at the top of the pipeline paired with the initial
 * startTurn after open is the only delivery path; skipping either for a
 * resumed open silently drops the user's message (the host opens idle, the
 * renderer keeps only its local optimistic copy, and no canonical row exists).
 * An empty-prompt reopen stays load-only.
 */

const AGENT_KIND: AgentKind = "fixture-agent";
const THREAD_ID = "thread-gui-resume-prompt";
const PROJECT_LOCATION = { kind: "posix", path: "/fixture-resume" } as const;
const OWNED_REF: SessionRef = {
  providerSessionId: "owned-resume-target",
  discoveredAt: "2026-10-08T00:00:00.000Z",
};
const INITIAL_SIZE = { cols: 80, rows: 24 } as const;

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

/** The router batches runtime events behind a short flush timer. */
const flushRuntimeEvents = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

type StartTurnCall = {
  prompt: string;
  config: unknown;
  segments: PromptSegment[] | undefined;
  options: { userMessageItemId?: string; inlineInstructions?: string } | undefined;
};

function createStructuredSession() {
  const startTurnCalls: StartTurnCall[] = [];
  let listener: StructuredSessionListener | undefined;
  return {
    launchOptions: {},
    activate: vi.fn<NonNullable<StructuredSessionHandle["activate"]>>(async () => undefined),
    openThread: vi.fn<NonNullable<StructuredSessionHandle["openThread"]>>(
      async () => "opened-provider-thread",
    ),
    startTurn: vi.fn<NonNullable<StructuredSessionHandle["startTurn"]>>(
      async (prompt, config, segments, options) => {
        startTurnCalls.push({
          prompt,
          config,
          segments,
          options: options as StartTurnCall["options"],
        });
        listener?.onUpdate({ status: "working", attention: "working" });
        return undefined;
      },
    ),
    setListener: vi.fn<StructuredSessionHandle["setListener"]>((next) => {
      listener = next;
    }),
    dispose: vi.fn<StructuredSessionHandle["dispose"]>(async () => undefined),
    startTurnCalls,
  };
}

function createAdapter(structured: StructuredSessionHandle): {
  adapter: AgentAdapter;
  createStructuredSession: ReturnType<
    typeof vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>
  >;
} {
  const structuredFactory = vi.fn<NonNullable<AgentAdapter["createStructuredSession"]>>(
    async () => structured,
  );
  const adapter = {
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
    createStructuredSession: structuredFactory,
  } as unknown as AgentAdapter;
  return { adapter, createStructuredSession: structuredFactory };
}

function createManager(
  adapter: AgentAdapter,
  emit: (event: SupervisorEvent) => void,
  preparation: Pick<ThreadSessionManagerOptions, "resolvePluginLaunchContributions"> = {},
): ThreadSessionManager {
  const tempDir = mkdtempSync(join(tmpdir(), "poracode-gui-resume-prompt-"));
  tempDirs.push(tempDir);
  const manager = new ThreadSessionManager({
    emit,
    isDev: false,
    logsDir: join(tempDir, "logs"),
    settingsPath: join(tempDir, "settings.json"),
    readDisableCliHookPlugin: () => false,
    adapters: new Map([[AGENT_KIND, adapter]]),
    ...preparation,
    resolveWindowsShell: () => ({
      shell: "powershell.exe",
      kind: "powershell" as const,
      args: ["-NoLogo"],
    }),
  });
  managersToDispose.push(manager);
  return manager;
}

function runtimeEvents(events: SupervisorEvent[]): unknown[] {
  return events.flatMap((event) =>
    event.type === "thread-runtime-event"
      ? [event.event]
      : event.type === "thread-runtime-events"
        ? event.events
        : event.type === "thread-runtime-events-multi"
          ? event.batches.flatMap((batch) => batch.events)
          : [],
  );
}

function userMessageItemIds(events: SupervisorEvent[]): string[] {
  return runtimeEvents(events)
    .filter(
      (event) =>
        (event as { type: string; itemType?: string }).type === "item.started" &&
        (event as { itemType?: string }).itemType === "user_message",
    )
    .map((event) => (event as { itemId: string }).itemId);
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function startResumedThread(
  manager: ThreadSessionManager,
  input: {
    prompt: string;
    segments?: PromptSegment[];
    userMessageItemId?: string;
  },
): Promise<unknown> {
  return manager.startThread({
    threadId: THREAD_ID,
    projectLocation: PROJECT_LOCATION,
    agentKind: AGENT_KIND,
    config: { model: `${AGENT_KIND}/model` },
    prompt: input.prompt,
    ...(input.segments ? { segments: input.segments } : {}),
    sessionRef: { ...OWNED_REF },
    initialSize: INITIAL_SIZE,
    presentationMode: "gui",
    ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
  });
}

describe("GUI resume initial prompt admission", () => {
  it("admits an explicit resume prompt exactly once against the exact owned reference", async () => {
    const structured = createStructuredSession();
    const { adapter, createStructuredSession: structuredFactory } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    const segments: PromptSegment[] = [{ kind: "text", content: "resumed prompt payload" }];
    await startResumedThread(manager, {
      prompt: "ignored while segments are present",
      segments,
      userMessageItemId: "user-renderer-optimistic",
    });
    await flushRuntimeEvents();

    // The factory receives the exact owned reference so the open resumes it.
    expect(structuredFactory).toHaveBeenCalledOnce();
    expect(structuredFactory.mock.calls[0]?.[0].sessionRef).toEqual(OWNED_REF);
    expect(structured.openThread).toHaveBeenCalledOnce();
    expect(structured.openThread.mock.calls[0]?.[1]).toEqual(OWNED_REF);

    // The initial turn is admitted exactly once, with the segment-derived
    // prompt, the effective segments, and the renderer's optimistic item id
    // so the canonical admission binds to the row the chat pane painted.
    expect(structured.startTurnCalls).toHaveLength(1);
    expect(structured.startTurnCalls[0]).toMatchObject({
      prompt: "resumed prompt payload",
      segments,
      options: { userMessageItemId: "user-renderer-optimistic" },
    });

    // Canonical user admission with the renderer's id: exactly one
    // turn.started and exactly one user_message row, deduped against the
    // renderer's optimistic copy by the shared id.
    expect(
      runtimeEvents(events).filter((event) => (event as { type: string }).type === "turn.started"),
    ).toHaveLength(1);
    expect(userMessageItemIds(events)).toEqual(["user-renderer-optimistic"]);

    // The runtime is published working with the owned reference intact.
    const session = manager.sessions.get(THREAD_ID);
    expect(session?.structuredSession).toBe(structured);
    expect(session?.sessionRef).toEqual(OWNED_REF);
    expect(session?.status).toBe("working");
    expect(
      events.some(
        (event) =>
          event.type === "thread-state" &&
          event.threadId === THREAD_ID &&
          event.status === "working",
      ),
    ).toBe(true);
  });

  it("keeps a fresh first prompt distinct: open without a reference and one admitted turn", async () => {
    const structured = createStructuredSession();
    const { adapter, createStructuredSession: structuredFactory } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    await manager.startThread({
      threadId: THREAD_ID,
      projectLocation: PROJECT_LOCATION,
      agentKind: AGENT_KIND,
      config: { model: `${AGENT_KIND}/model` },
      prompt: "first fresh prompt",
      initialSize: INITIAL_SIZE,
      presentationMode: "gui",
      userMessageItemId: "user-fresh-optimistic",
    });
    await flushRuntimeEvents();

    // Fresh open: no reference reaches the factory or the open call.
    expect(structuredFactory.mock.calls[0]?.[0].sessionRef).toBeUndefined();
    expect(structured.openThread.mock.calls[0]?.[1]).toBeUndefined();
    expect(structured.startTurnCalls).toHaveLength(1);
    expect(structured.startTurnCalls[0]).toMatchObject({
      prompt: "first fresh prompt",
      options: { userMessageItemId: "user-fresh-optimistic" },
    });
    expect(userMessageItemIds(events)).toEqual(["user-fresh-optimistic"]);
  });

  it("keeps an empty-prompt resume load-only: no optimistic user row and no turn", async () => {
    const structured = createStructuredSession();
    const { adapter } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    await startResumedThread(manager, { prompt: "   " });
    await flushRuntimeEvents();

    expect(structured.openThread).toHaveBeenCalledOnce();
    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(userMessageItemIds(events)).toEqual([]);
    // Load-only reopen still publishes an idle runtime holding the reference.
    const session = manager.sessions.get(THREAD_ID);
    expect(session?.sessionRef).toEqual(OWNED_REF);
    expect(session?.status).toBe("idle");
  });

  it("starts nothing when the resumed open fails before publication", async () => {
    const structured = createStructuredSession();
    structured.openThread.mockImplementation(async () => {
      throw new Error("The resumed session could not be loaded");
    });
    const { adapter } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    await expect(
      startResumedThread(manager, {
        prompt: "prompt that must not be delivered",
        userMessageItemId: "user-doomed-resume",
      }),
    ).rejects.toThrow("The resumed session could not be loaded");

    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(structured.dispose).toHaveBeenCalledOnce();
    expect(manager.sessions.has(THREAD_ID)).toBe(false);
    // The optimistic admission paired with the (never reached) startTurn is
    // still published with the renderer's id — the same shape a fresh failed
    // open leaves behind. This manager rejects the start for its caller to
    // report; it does not publish a runtime for an unsuccessful open.
    await flushRuntimeEvents();
    expect(userMessageItemIds(events)).toEqual(["user-doomed-resume"]);
  });

  it("interrupts a pending resumed open without starting a turn or replacing the owned reference", async () => {
    const structured = createStructuredSession();
    const openStarted = deferred();
    const openRelease = deferred();
    structured.openThread.mockImplementation(async () => {
      openStarted.resolve();
      await openRelease.promise;
      return "opened-provider-thread";
    });
    const { adapter } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    const startPromise = startResumedThread(manager, {
      prompt: "prompt sent during an interrupted resume",
      userMessageItemId: "user-interrupted-resume",
    });
    await openStarted.promise;
    await manager.interruptThread({ threadId: THREAD_ID });
    openRelease.resolve();
    await startPromise;
    await flushRuntimeEvents();

    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(structured.dispose).toHaveBeenCalledOnce();
    expect(manager.sessions.has(THREAD_ID)).toBe(false);
    // No publication ever replaced the owned reference with a new identity.
    expect(
      events.some((event) => event.type === "thread-state" && event.sessionRef !== undefined),
    ).toBe(false);
  });

  it("does not admit a resumed prompt after interruption during launch preparation", async () => {
    const structured = createStructuredSession();
    const preparationStarted = deferred();
    const preparationRelease = deferred();
    const { adapter, createStructuredSession: createSession } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event), {
      resolvePluginLaunchContributions: async () => {
        preparationStarted.resolve();
        await preparationRelease.promise;
        return { mcpServers: [], builtInMcpServerIds: [], nativePlugins: [] };
      },
    });

    const startPromise = startResumedThread(manager, {
      prompt: "prompt cancelled before admission",
      userMessageItemId: "user-cancelled-preparation",
    });
    await preparationStarted.promise;
    await manager.interruptThread({ threadId: THREAD_ID });
    preparationRelease.resolve();
    await startPromise;
    await flushRuntimeEvents();

    expect(createSession).not.toHaveBeenCalled();
    expect(structured.openThread).not.toHaveBeenCalled();
    expect(structured.startTurn).not.toHaveBeenCalled();
    expect(manager.sessions.has(THREAD_ID)).toBe(false);
    expect(userMessageItemIds(events)).toEqual([]);
    expect(
      runtimeEvents(events).some((event) => (event as { type: string }).type === "turn.started"),
    ).toBe(false);
    const states = events.filter((event) => event.type === "thread-state");
    expect(states.some((event) => event.status === "working")).toBe(false);
    expect(states.at(-1)?.status).toBe("idle");
  });

  it("settles a failed resumed initial turn on its own session instance", async () => {
    const structured = createStructuredSession();
    structured.startTurn.mockImplementation(async () => {
      throw new Error("resumed initial turn rejected");
    });
    const { adapter } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    await startResumedThread(manager, {
      prompt: "prompt whose turn fails",
      userMessageItemId: "user-failing-resume",
    });

    const session = manager.sessions.get(THREAD_ID);
    expect(session).toBeDefined();
    await waitFor(() => manager.sessions.get(THREAD_ID)?.status === "error", "error settle");
    expect(manager.sessions.get(THREAD_ID)?.instanceId).toBe(session?.instanceId);
    await flushRuntimeEvents();
    const errorItem = runtimeEvents(events).find(
      (event) => (event as { type: string }).type === "error",
    );
    expect((errorItem as { message?: string } | undefined)?.message).toBe(
      "resumed initial turn rejected",
    );
  });

  it("fences a late resumed-turn failure away from a newer published session", async () => {
    const structured = createStructuredSession();
    const newerSession = {
      instanceId: "instance-newer",
      threadId: THREAD_ID,
      status: "idle",
      attention: "none",
    } as unknown as SessionRuntime;
    structured.startTurn.mockImplementation(async () => {
      manager.sessions.set(THREAD_ID, newerSession);
      throw new Error("stale resumed turn rejection");
    });
    const { adapter } = createAdapter(structured);
    const events: SupervisorEvent[] = [];
    const manager = createManager(adapter, (event) => events.push(event));

    await startResumedThread(manager, {
      prompt: "prompt racing a replacement",
      userMessageItemId: "user-racing-resume",
    });

    await waitFor(() => manager.sessions.get(THREAD_ID) === newerSession, "replacement observed");
    await flushRuntimeEvents();
    expect(newerSession.status).toBe("idle");
    expect(
      runtimeEvents(events).some((event) => (event as { type: string }).type === "error"),
    ).toBe(false);
  });
});
