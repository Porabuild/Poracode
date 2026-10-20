import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentKind, PromptSegment, SessionRef } from "@/shared/contracts";
import { decodeThreadIdentity } from "@/shared/browserMcpThread";
import * as browserMcp from "../agents/browserMcp";
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
  executionIdentity: "opaque-owner-scope",
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
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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
  preparation: Pick<
    ThreadSessionManagerOptions,
    | "resolvePluginLaunchContributions"
    | "filterPluginSkillSegments"
    | "buildSkillTurnInjection"
    | "crossagentMcp"
  > = {},
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

describe("native plugin metadata demand", () => {
  it.each([false, true])(
    "retains per-thread tool choices on launch, follow-up and live refresh (resume: %s)",
    async (resume) => {
      const structured = createStructuredSession();
      const { adapter, createStructuredSession: factory } = createAdapter(structured);
      const contributions = vi.fn<
        NonNullable<ThreadSessionManagerOptions["resolvePluginLaunchContributions"]>
      >(async () => ({
        mcpServers: [],
        builtInMcpServerIds: ["browser"],
        nativePlugins: [],
      }));
      const policy = vi.fn<NonNullable<ThreadSessionManagerOptions["filterPluginSkillSegments"]>>(
        async ({ segments }) => segments,
      );
      const manager = createManager(adapter, () => {}, {
        resolvePluginLaunchContributions: contributions,
        filterPluginSkillSegments: policy,
      });
      const config = {
        model: "fixture-model",
        pluginOverrides: { github: true },
        mcpServerOverrides: { custom: true },
      };
      const segments: PromptSegment[] = [
        {
          kind: "skill",
          name: "fixture",
          path: "/fixture/SKILL.md",
          invocation: "$fixture",
          provider: "fixture",
          scope: "global",
        },
      ];
      await manager.startThread({
        threadId: THREAD_ID,
        projectLocation: PROJECT_LOCATION,
        agentKind: AGENT_KIND,
        config,
        prompt: "$fixture",
        segments,
        initialSize: INITIAL_SIZE,
        presentationMode: "gui",
        disabledBuiltInMcpServerIds: ["browser"],
        ...(resume ? { sessionRef: { ...OWNED_REF } } : {}),
      });
      expect(contributions).toHaveBeenCalledWith(PROJECT_LOCATION, AGENT_KIND, {
        includeExternalServers: true,
        pluginOverrides: config.pluginOverrides,
      });
      expect(policy).toHaveBeenCalledWith(
        expect.objectContaining({ pluginOverrides: config.pluginOverrides }),
      );
      manager.sessions.get(THREAD_ID)!.status = "idle";
      await manager.sendThreadInput({
        threadId: THREAD_ID,
        prompt: "$fixture again",
        segments,
        config: { model: "fixture-model" },
      });
      await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledTimes(2));
      const retained = manager.sessions.get(THREAD_ID)!.config;
      expect(retained).toMatchObject(config);
      const resolve = factory.mock.calls[0]![0].resolveMcpServersForTurn!;
      const servers = await resolve(retained, () => true);
      expect(contributions).toHaveBeenLastCalledWith(PROJECT_LOCATION, AGENT_KIND, {
        includeExternalServers: false,
        pluginOverrides: config.pluginOverrides,
      });
      expect(servers.some((server) => server.id === "browser")).toBe(false);
    },
  );
  it("starts and submits plain text without waiting for native plugin inventory", async () => {
    const structured = createStructuredSession();
    const { adapter } = createAdapter(structured);
    const inventory = vi.fn<NonNullable<AgentAdapter["listNativePlugins"]>>(
      () => new Promise(() => {}),
    );
    adapter.listNativePlugins = inventory;
    const contributions = vi.fn<
      NonNullable<ThreadSessionManagerOptions["resolvePluginLaunchContributions"]>
    >(async (_location, _kind, selection) => ({
      mcpServers: [],
      builtInMcpServerIds: [],
      nativePlugins: selection?.nativePluginAdapter
        ? [...(await selection.nativePluginAdapter.listNativePlugins!({ envKind: "posix" }))]
        : [],
    }));
    const manager = createManager(adapter, () => {}, {
      resolvePluginLaunchContributions: contributions,
    });
    await manager.startThread({
      threadId: THREAD_ID,
      projectLocation: PROJECT_LOCATION,
      agentKind: AGENT_KIND,
      config: { model: "fixture-model" },
      prompt: "Reply OK",
      initialSize: INITIAL_SIZE,
      presentationMode: "gui",
    });
    expect(structured.startTurn).toHaveBeenCalledOnce();
    manager.sessions.get(THREAD_ID)!.status = "idle";
    await manager.sendThreadInput({
      threadId: THREAD_ID,
      prompt: "Reply OK again",
      config: { model: "fixture-model" },
    });
    await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledTimes(2));
    expect(contributions).toHaveBeenCalledWith(PROJECT_LOCATION, AGENT_KIND, {
      includeExternalServers: true,
    });
    expect(inventory).not.toHaveBeenCalled();
  });

  it.each(["start", "followup", "restart"] as const)(
    "provides native plugin metadata for an explicit plugin skill on %s",
    async (phase) => {
      const structured = createStructuredSession();
      const { adapter, createStructuredSession: factory } = createAdapter(structured);
      const nativePlugins = [{ name: "fixture-plugin", root: "/profile/plugins/fixture-plugin" }];
      const inventory = vi.fn<NonNullable<AgentAdapter["listNativePlugins"]>>(
        async () => nativePlugins,
      );
      adapter.listNativePlugins = inventory;
      const replacementInventory = vi.fn<NonNullable<AgentAdapter["listNativePlugins"]>>(
        async () => [{ name: "fixture-plugin", root: "/other-profile/plugins/fixture-plugin" }],
      );
      const replacementAdapter = {
        ...adapter,
        listNativePlugins: replacementInventory,
      };
      const contributions = vi.fn<
        NonNullable<ThreadSessionManagerOptions["resolvePluginLaunchContributions"]>
      >(async (_location, _kind, selection) => ({
        mcpServers: [],
        builtInMcpServerIds: [],
        nativePlugins: selection?.nativePluginAdapter
          ? [...(await selection.nativePluginAdapter.listNativePlugins!({ envKind: "posix" }))]
          : [],
      }));
      const policy = vi.fn<NonNullable<ThreadSessionManagerOptions["filterPluginSkillSegments"]>>(
        async ({ segments }) => segments,
      );
      const injection = vi.fn<NonNullable<ThreadSessionManagerOptions["buildSkillTurnInjection"]>>(
        async () => undefined,
      );
      const manager = createManager(adapter, () => {}, {
        resolvePluginLaunchContributions: contributions,
        filterPluginSkillSegments: policy,
        buildSkillTurnInjection: injection,
      });
      const segments: PromptSegment[] = [
        {
          kind: "skill",
          name: "fixture-skill",
          path: "/fixture-plugin/skills/fixture-skill/SKILL.md",
          invocation: "$fixture-skill",
          provider: "fixture",
          scope: "global",
          pluginId: "fixture-plugin",
        },
      ];
      if (phase === "start") {
        await startResumedThread(manager, { prompt: "$fixture-skill", segments });
      } else {
        await startResumedThread(manager, { prompt: "" });
        (manager as unknown as { options: ThreadSessionManagerOptions }).options.adapters.set(
          AGENT_KIND,
          replacementAdapter,
        );
        if (phase === "restart") manager.sessions.get(THREAD_ID)!.status = "inactive";
        await manager.sendThreadInput({
          threadId: THREAD_ID,
          prompt: "$fixture-skill",
          segments,
          config: { model: "fixture-model" },
        });
      }
      await vi.waitFor(() => expect(structured.startTurn).toHaveBeenCalledOnce());
      expect(contributions).toHaveBeenLastCalledWith(PROJECT_LOCATION, AGENT_KIND, {
        includeExternalServers: phase === "start",
        nativePluginAdapter: adapter,
      });
      expect(policy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentKind: AGENT_KIND,
          projectLocation: PROJECT_LOCATION,
          nativePlugins,
          segments,
        }),
      );
      expect(injection).toHaveBeenCalledWith(expect.objectContaining({ nativePlugins, segments }));
      expect(manager.sessions.get(THREAD_ID)?.nativePlugins).toEqual(nativePlugins);
      expect(inventory).toHaveBeenCalledOnce();
      expect(replacementInventory).not.toHaveBeenCalled();
      expect(factory).toHaveBeenCalledTimes(phase === "restart" ? 2 : 1);
    },
  );
});

describe("live built-in MCP resolution", () => {
  it.each([true, false])(
    "does not mutate a replacement's Crossagents credentials after old browser preparation (%s)",
    async (oldCrossagentMcp) => {
      const policies = new Map<string, readonly string[]>();
      const register = vi.fn<NonNullable<ThreadSessionManagerOptions["crossagentMcp"]>["register"]>(
        (threadId, disabledTools = []) => {
          policies.set(threadId, disabledTools);
          return {
            url: "http://127.0.0.1:12346/mcp",
            token: "fixture-token",
            headers: { Authorization: "Bearer fixture-token" },
          };
        },
      );
      const unregister = vi.fn<(threadId: string) => void>((threadId) => {
        policies.delete(threadId);
      });
      const { adapter, createStructuredSession: factory } =
        createAdapter(createStructuredSession());
      const manager = createManager(adapter, () => {}, {
        crossagentMcp: {
          register,
          registerProviderSession: register,
          unregister,
          cancelForeground: vi.fn<(threadId: string) => void>(),
          cancelAll: vi.fn<(threadId: string) => void>(),
          resolveChildRequest: vi
            .fn<NonNullable<ThreadSessionManagerOptions["crossagentMcp"]>["resolveChildRequest"]>()
            .mockReturnValue(false),
        },
      });
      const launch = {
        threadId: THREAD_ID,
        projectLocation: PROJECT_LOCATION,
        agentKind: AGENT_KIND,
        prompt: "",
        initialSize: INITIAL_SIZE,
        presentationMode: "gui" as const,
      };
      await manager.startThread({
        ...launch,
        config: { model: "fixture-model", crossagentMcp: oldCrossagentMcp },
      });
      const old = manager.sessions.get(THREAD_ID);
      const resolve = factory.mock.calls[0]![0].resolveMcpServersForTurn!;
      const prepared = deferred<browserMcp.BrowserMcpHttpConfig | undefined>();
      const browser = vi
        .spyOn(browserMcp, "resolveBrowserMcpHttpConfigForLaunch")
        .mockImplementation(async (_location, enabled) => (enabled ? prepared.promise : undefined));
      const pending = resolve(
        { model: "fixture-model", browserMcp: true, crossagentMcp: oldCrossagentMcp },
        () => manager.sessions.get(THREAD_ID) === old,
      );
      await vi.waitFor(() => expect(browser).toHaveBeenCalledOnce());
      await manager.closeThread({ threadId: THREAD_ID });
      await manager.startThread({
        ...launch,
        config: { model: "fixture-model", crossagentMcp: true },
        disabledBuiltInMcpTools: { crossagents: ["spawn_thread"] },
      });
      expect(policies.get(THREAD_ID)).toEqual(["spawn_thread"]);
      prepared.resolve(undefined);
      await pending;
      expect(policies.get(THREAD_ID)).toEqual(["spawn_thread"]);
    },
  );

  it("refreshes plugin enablement on a resumed thread while retaining tool restrictions and identity", async () => {
    vi.stubEnv("PORACODE_BROWSER_MCP_URL", "http://127.0.0.1:12345");
    vi.stubEnv("PORACODE_BROWSER_MCP_TOKEN", "fixture-token");
    const { adapter, createStructuredSession: factory } = createAdapter(createStructuredSession());
    const contributions = vi
      .fn<NonNullable<ThreadSessionManagerOptions["resolvePluginLaunchContributions"]>>()
      .mockResolvedValue({
        mcpServers: [],
        builtInMcpServerIds: [],
        nativePlugins: [],
      });
    const manager = createManager(adapter, () => {}, {
      resolvePluginLaunchContributions: contributions,
    });
    await manager.startThread({
      threadId: THREAD_ID,
      projectLocation: PROJECT_LOCATION,
      agentKind: AGENT_KIND,
      config: { model: "fixture-model" },
      prompt: "",
      sessionRef: OWNED_REF,
      initialSize: INITIAL_SIZE,
      presentationMode: "gui",
      disabledBuiltInMcpTools: { browser: ["eval"] },
    });
    const resolve = factory.mock.calls[0]![0].resolveMcpServersForTurn!;
    expect(
      (await resolve({ model: "fixture-model" }, () => true)).some(
        (server) => server.id === "browser",
      ),
    ).toBe(false);
    contributions.mockResolvedValue({
      mcpServers: [],
      builtInMcpServerIds: ["browser"],
      nativePlugins: [],
    });
    const browser = (await resolve({ model: "fixture-model" }, () => true)).find(
      (server) => server.id === "browser",
    );
    expect(browser?.transport.type).toBe("http");
    if (browser?.transport.type !== "http") throw new Error("browser server missing");
    expect(decodeThreadIdentity(browser.transport.url)).toEqual({
      threadId: THREAD_ID,
      disabledTools: ["eval"],
    });
    expect(browser.transport.headers).toEqual({ Authorization: "Bearer fixture-token" });
    expect(factory).toHaveBeenCalledOnce();
  });

  it("keeps launch-time server disables authoritative after a plugin is enabled", async () => {
    vi.stubEnv("PORACODE_BROWSER_MCP_URL", "http://127.0.0.1:12345");
    vi.stubEnv("PORACODE_BROWSER_MCP_TOKEN", "fixture-token");
    const { adapter, createStructuredSession: factory } = createAdapter(createStructuredSession());
    const manager = createManager(adapter, () => {}, {
      resolvePluginLaunchContributions: async () => ({
        mcpServers: [],
        builtInMcpServerIds: ["browser"],
        nativePlugins: [],
      }),
    });
    await manager.startThread({
      threadId: THREAD_ID,
      projectLocation: PROJECT_LOCATION,
      agentKind: AGENT_KIND,
      config: { model: "fixture-model", browserMcp: true },
      prompt: "",
      initialSize: INITIAL_SIZE,
      presentationMode: "gui",
      disabledBuiltInMcpServerIds: ["browser"],
    });
    const resolve = factory.mock.calls[0]![0].resolveMcpServersForTurn!;
    const servers = await resolve({ model: "fixture-model", browserMcp: true }, () => true);
    expect(servers.some((server) => server.id === "browser")).toBe(false);
  });
});

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
    // open leaves behind — and the failure is visible.
    await waitFor(
      () => runtimeEvents(events).some((event) => (event as { type: string }).type === "error"),
      "error item",
    );
    expect(userMessageItemIds(events)).toEqual(["user-doomed-resume"]);
    expect(events.some((event) => event.type === "thread-state" && event.status === "error")).toBe(
      true,
    );
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
