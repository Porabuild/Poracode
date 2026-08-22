// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter, StructuredSessionHandle } from "../../agents/base";
import type { SessionRuntime } from "../sessionTypes";
import {
  InvalidSessionRecoveryCoordinator,
  type InvalidSessionRecoveryContext,
} from "./invalidSessionRecovery";

const THREAD_ID = "thread-recover";
const PROJECT_LOCATION = { kind: "posix", path: "/repo" } as const;
const CONFIG: ThreadConfig = { model: "recover-test/model" };

function createHarness() {
  const events: string[] = [];
  const buildLaunchArgv = vi.fn<AgentAdapter["buildLaunchArgv"]>(() => {
    events.push("build");
    return { binary: "recover-test", args: ["--fresh"] };
  });
  const adapter = {
    kind: "recover-test",
    label: "Recovery Test",
    binary: "recover-test",
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
      presentationModes: ["terminal"],
      settingDefs: [],
    },
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv,
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
  } as unknown as AgentAdapter;
  const dispose = vi.fn<StructuredSessionHandle["dispose"]>(async () => {
    events.push("dispose");
  });
  const session = {
    instanceId: "instance-recover",
    threadId: THREAD_ID,
    agentKind: adapter.kind,
    adapter,
    projectLocation: PROJECT_LOCATION,
    config: CONFIG,
    mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
    terminalSize: { cols: 100, rows: 30 },
    launchPrompt: "",
    sessionRef: {
      providerSessionId: "ses_existing",
      discoveredAt: "2026-01-01T00:00:00.000Z",
    },
    status: "launching",
    attention: "none",
    canResumeWithConfig: true,
    outputLength: 0,
    prevChunk: "",
    lastStrippedPtyChunk: "",
    ptyOscCarry: "",
    structuredSession: {
      launchOptions: {},
      setListener: vi.fn<StructuredSessionHandle["setListener"]>(),
      dispose,
    },
  } as SessionRuntime;

  let currentSession: SessionRuntime | undefined = session;
  const spawnThread = vi.fn<
    (
      input: Parameters<InvalidSessionRecoveryContext["spawnPipeline"]["spawnThread"]>[0],
    ) => SessionRuntime
  >((_input) => {
    events.push("spawn");
    return {} as SessionRuntime;
  });
  const resolveMcpServersForLaunch = vi.fn<
    InvalidSessionRecoveryContext["spawnPipeline"]["resolveMcpServersForLaunch"]
  >(async () => {
    events.push("mcp");
    return [];
  });
  const resolveMcpLaunchConfig = vi.fn<
    InvalidSessionRecoveryContext["spawnPipeline"]["resolveMcpLaunchConfig"]
  >((config) => config);
  const composeLaunchOptions = vi.fn<
    InvalidSessionRecoveryContext["spawnPipeline"]["composeLaunchOptions"]
  >(() => {
    events.push("compose");
    return { agentSettings: {} };
  });
  const resolveCliHookPluginExtras = vi.fn<
    InvalidSessionRecoveryContext["cliHookPlugin"]["resolveCliHookPluginExtras"]
  >(async () => {
    events.push("hooks");
    return {
      env: { PORACODE_HOOK_URL: "http://127.0.0.1/hook" },
      extraArgs: [],
    };
  });
  const clearSessionTimers = vi.fn<
    InvalidSessionRecoveryContext["outputPipeline"]["clearSessionTimers"]
  >(() => {
    events.push("clear");
  });
  const kill = vi.fn<InvalidSessionRecoveryContext["ptyLifecycle"]["kill"]>(() => {
    events.push("kill");
  });
  const failStructuredSession = vi.fn<InvalidSessionRecoveryContext["failStructuredSession"]>();
  const settleAfterStructuredDispose = vi.fn<
    InvalidSessionRecoveryContext["settleAfterStructuredDispose"]
  >(async () => {
    events.push("settle");
  });
  const primeProjectShellEnv = vi.fn<InvalidSessionRecoveryContext["primeProjectShellEnv"]>(
    async () => {
      events.push("prime");
    },
  );
  const resolveLaunchSpec = vi.fn<InvalidSessionRecoveryContext["resolveLaunchSpec"]>(
    (_location, argv) => {
      events.push("resolve");
      return { command: argv.binary, args: argv.args };
    },
  );

  const context: InvalidSessionRecoveryContext = {
    spawnPipeline: {
      resolveMcpLaunchConfig,
      resolveMcpServersForLaunch,
      composeLaunchOptions,
      spawnThread,
    } as unknown as InvalidSessionRecoveryContext["spawnPipeline"],
    cliHookPlugin: {
      resolveCliHookPluginExtras,
    } as unknown as InvalidSessionRecoveryContext["cliHookPlugin"],
    outputPipeline: { clearSessionTimers },
    ptyLifecycle: { kill },
    isCurrentSession: (candidate) => currentSession?.instanceId === candidate.instanceId,
    failStructuredSession,
    settleAfterStructuredDispose,
    primeProjectShellEnv,
    resolveLaunchSpec,
  };

  return {
    coordinator: new InvalidSessionRecoveryCoordinator(context),
    session,
    events,
    buildLaunchArgv,
    dispose,
    spawnThread,
    resolveMcpServersForLaunch,
    resolveCliHookPluginExtras,
    settleAfterStructuredDispose,
    primeProjectShellEnv,
    kill,
    failStructuredSession,
    setCurrentSession(next: SessionRuntime | undefined) {
      currentSession = next;
    },
  };
}

describe("InvalidSessionRecoveryCoordinator", () => {
  it("disposes, settles, kills, and respawns without the stale session ref", async () => {
    const harness = createHarness();

    await harness.coordinator.recover(harness.session);

    expect(harness.events).toEqual([
      "clear",
      "dispose",
      "settle",
      "kill",
      "mcp",
      "hooks",
      "compose",
      "build",
      "prime",
      "resolve",
      "spawn",
    ]);
    expect(harness.spawnThread).toHaveBeenCalledTimes(1);
    const spawnInput = harness.spawnThread.mock.calls[0]![0];
    expect(spawnInput).not.toHaveProperty("sessionRef");
    expect(spawnInput.mcpLaunchSnapshot).toBe(harness.session.mcpLaunchSnapshot);
    expect(spawnInput.launchConfig).toEqual(CONFIG);
    expect(spawnInput).toMatchObject({
      threadId: THREAD_ID,
      launchPrompt: "",
      extraEnv: { PORACODE_HOOK_URL: "http://127.0.0.1/hook" },
    });
  });

  it("returns the same in-flight recovery when the banner repeats", async () => {
    const harness = createHarness();
    let finishSettle: (() => void) | undefined;
    harness.settleAfterStructuredDispose.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishSettle = resolve;
        }),
    );

    const first = harness.coordinator.recover(harness.session);
    const second = harness.coordinator.recover(harness.session);

    expect(second).toBe(first);
    await Promise.resolve();
    expect(finishSettle).toBeTypeOf("function");
    finishSettle?.();
    await first;
    expect(harness.spawnThread).toHaveBeenCalledTimes(1);
  });

  it("aborts before teardown when the session was already replaced", async () => {
    const harness = createHarness();
    harness.setCurrentSession(undefined);

    await harness.coordinator.recover(harness.session);

    expect(harness.dispose).not.toHaveBeenCalled();
    expect(harness.spawnThread).not.toHaveBeenCalled();
  });

  it("aborts after teardown when dispose replaced the session", async () => {
    const harness = createHarness();
    harness.dispose.mockImplementation(async () => {
      harness.events.push("dispose");
      harness.setCurrentSession(undefined);
    });

    await harness.coordinator.recover(harness.session);

    expect(harness.kill).toHaveBeenCalledTimes(1);
    expect(harness.resolveMcpServersForLaunch).not.toHaveBeenCalled();
    expect(harness.spawnThread).not.toHaveBeenCalled();
  });

  it("aborts before argv construction when hook resolution replaced the session", async () => {
    const harness = createHarness();
    harness.resolveCliHookPluginExtras.mockImplementation(async () => {
      harness.setCurrentSession(undefined);
      return { env: {}, extraArgs: [] };
    });

    await harness.coordinator.recover(harness.session);

    expect(harness.buildLaunchArgv).not.toHaveBeenCalled();
    expect(harness.spawnThread).not.toHaveBeenCalled();
  });

  it("aborts before spawn when pre-spawn priming replaced the session", async () => {
    const harness = createHarness();
    harness.primeProjectShellEnv.mockImplementation(async () => {
      harness.setCurrentSession(undefined);
    });

    await harness.coordinator.recover(harness.session);

    expect(harness.buildLaunchArgv).toHaveBeenCalledTimes(1);
    expect(harness.spawnThread).not.toHaveBeenCalled();
  });

  it("exposes launch failures through the awaitable recovery", async () => {
    const harness = createHarness();
    harness.resolveMcpServersForLaunch.mockRejectedValue(new Error("browser MCP unavailable"));

    await expect(harness.coordinator.recover(harness.session)).rejects.toThrow(
      "browser MCP unavailable",
    );
    expect(harness.spawnThread).not.toHaveBeenCalled();
  });

  it("reports a shared recovery failure only once when the banner repeats", async () => {
    const harness = createHarness();
    const error = new Error("browser MCP unavailable");
    harness.resolveMcpServersForLaunch.mockRejectedValue(error);

    const first = harness.coordinator.recover(harness.session);
    const second = harness.coordinator.recover(harness.session);

    expect(second).toBe(first);
    await expect(first).rejects.toBe(error);
    await expect(second).rejects.toBe(error);
    expect(harness.failStructuredSession).toHaveBeenCalledExactlyOnceWith(harness.session, error);
  });
});
