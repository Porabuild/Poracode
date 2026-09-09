import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation } from "@/shared/contracts";
import type { AgentAdapter, CommandSpec } from "./agents/base";
import { probeAcpCapabilities, authenticateAcpAgent, logoutAcpAgent } from "./agents/acp/probe";
import { spawnMuseServeHost } from "./agents/muse/msp/client";
import { runOneShotChild } from "./crossagentMcp/oneShotChild";
import {
  MOCK_AGENTS_ENV,
  MockAgentLaunchBlockedError,
  assertAgentLaunchAllowed,
  isMockAgentLaunchEnforced,
} from "./agentLaunchGuard";
import { spawnAgent, spawnAgentPty } from "./oneShotSpawn";
import { SpawnPipeline, type SpawnPipelineContext } from "./runtime/threadSession/spawnPipeline";

/**
 * Sentinel proof for the mock-QA launch guard: the fixture is a real local
 * executable that appends a marker to a file the moment it runs. If any
 * guarded funnel still spawned it under `PORACODE_MOCK_AGENTS=1`, the marker
 * would appear — its absence is the evidence the process was never created.
 */

const sentinelDir = join(tmpdir(), "poracode-mock-guard-");
let workDir: string;
let sentinelFile: string;
let fixtureCommand: string;

beforeEach(() => {
  workDir = mkdtempSync(sentinelDir);
  sentinelFile = join(workDir, "sentinel.log");
  fixtureCommand = join(workDir, "fixture-agent.sh");
  writeFileSync(
    fixtureCommand,
    [
      "#!/bin/sh",
      'printf "ran:%s\\n" "$SENTINEL_VALUE" >> "$SENTINEL_FILE"',
      'echo "ran:$SENTINEL_VALUE"',
      "",
    ].join("\n"),
  );
  chmodSync(fixtureCommand, 0o755);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(workDir, { recursive: true, force: true });
});

/** Flip the process into an enforced mock QA session for the code under test. */
function mockSessionEnv(): void {
  vi.stubEnv(MOCK_AGENTS_ENV, "1");
  vi.stubEnv("PORACODE_IS_DEV", "1");
}

function realModeEnv(): void {
  vi.stubEnv(MOCK_AGENTS_ENV, "");
}

function fixtureSpec(): CommandSpec {
  return {
    command: fixtureCommand,
    args: [],
    cwd: workDir,
    env: fixtureEnv(),
  };
}

function fixtureEnv(): Record<string, string> {
  return { SENTINEL_FILE: sentinelFile, SENTINEL_VALUE: "bypass" };
}

function sentinelRan(): string | undefined {
  return existsSync(sentinelFile) ? readFileSync(sentinelFile, "utf8") : undefined;
}

function posixLocation(): ProjectLocation {
  return { kind: "posix", path: workDir };
}

function stubPipeline(): { pipeline: SpawnPipeline; attach: ReturnType<typeof vi.fn> } {
  const attach = vi.fn<() => void>();
  const ctx = {
    options: {
      emit: vi.fn<(event: unknown) => void>(),
      readDisableCliHookPlugin: () => false,
      adapters: new Map(),
    },
    sessions: new Map(),
    pendingStartInterrupts: new Set<string>(),
    pendingStartAborts: new Set<string>(),
    ptyLifecycle: {},
    outputPipeline: {},
    runtimeEventRouter: {},
    sessionRuntimeLifecycle: { attach },
    cliHookPlugin: {},
    closeThread: vi.fn<() => Promise<void>>(),
    failStructuredSession: vi.fn<() => void>(),
    isCurrentSession: () => true,
    resolveAgentSettings: () => ({}),
    emitOptimisticUserMessage: vi.fn<() => string>(),
    emitProviderHandoff: vi.fn<() => string>(),
  } as unknown as SpawnPipelineContext;
  return { pipeline: new SpawnPipeline(ctx), attach };
}

describe("isMockAgentLaunchEnforced", () => {
  it("enforces only when the flag is set in a dev session", () => {
    expect(isMockAgentLaunchEnforced({ requested: "1", isDevSession: true })).toBe(true);
    expect(isMockAgentLaunchEnforced({ requested: "1", isDevSession: false })).toBe(false);
    expect(isMockAgentLaunchEnforced({ requested: undefined, isDevSession: true })).toBe(false);
    expect(isMockAgentLaunchEnforced({ requested: "0", isDevSession: true })).toBe(false);
  });

  it("refuses to enforce from the flag alone outside a dev session", () => {
    vi.stubEnv(MOCK_AGENTS_ENV, "1");
    vi.stubEnv("PORACODE_IS_DEV", "0");
    vi.stubEnv("VITE_DEV_SERVER_URL", "");
    expect(isMockAgentLaunchEnforced()).toBe(false);
  });
});

describe("assertAgentLaunchAllowed", () => {
  it("throws a classified refusal without command arguments", () => {
    mockSessionEnv();
    const attempt = () => assertAgentLaunchAllowed("thread-pty");
    expect(attempt).toThrow(MockAgentLaunchBlockedError);
    expect(attempt).toThrow(new RegExp(MOCK_AGENTS_ENV));
    expect(attempt).toThrow(/thread-pty/);
    expect(attempt).not.toThrow(/\/bin\/fixture|--flag/);
  });

  it("is a no-op without the flag, preserving real-mode launches", () => {
    realModeEnv();
    expect(() => assertAgentLaunchAllowed("thread-pty")).not.toThrow();
  });
});

describe.skipIf(process.platform === "win32")("sentinel proof at the launch funnels", () => {
  describe("one-shot child_process lane (spawnAgent)", () => {
    it("refuses the launch and never executes the fixture", async () => {
      mockSessionEnv();
      const privatePrompt = "Private user message carried in argv";
      const outcome = await spawnAgent(
        { ...fixtureSpec(), args: [privatePrompt] },
        "prompt",
        5_000,
      ).then(
        () => "resolved",
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(outcome).toMatchObject({ lane: "one-shot" });
      expect(String(outcome)).not.toContain(privatePrompt);
      expect(String(outcome)).not.toContain(fixtureCommand);
      expect(sentinelRan()).toBeUndefined();
    });

    it("executes the fixture and returns its output without the flag (real-mode parity)", async () => {
      realModeEnv();
      const output = await spawnAgent(fixtureSpec(), "prompt", 10_000);
      expect(output).toContain("ran:bypass");
      expect(sentinelRan()).toBe("ran:bypass\n");
    });
  });

  describe("one-shot PTY lane (spawnAgentPty)", () => {
    it("refuses the launch and never executes the fixture", async () => {
      mockSessionEnv();
      const outcome = await spawnAgentPty(fixtureSpec(), "prompt", 5_000).then(
        () => "resolved",
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(sentinelRan()).toBeUndefined();
    });

    it("executes the fixture through a real PTY without the flag", async () => {
      realModeEnv();
      const output = await spawnAgentPty(fixtureSpec(), "prompt", 10_000);
      expect(output).toContain("ran:bypass");
      expect(sentinelRan()).toBe("ran:bypass\n");
    });
  });

  describe("thread PTY funnel (SpawnPipeline.spawnThread)", () => {
    it("refuses the launch before node-pty creates a process", () => {
      mockSessionEnv();
      const { pipeline, attach } = stubPipeline();
      expect(() =>
        pipeline.spawnThread({
          threadId: "thread-1",
          agentKind: "fixture" as never,
          adapter: { capabilities: {} } as AgentAdapter,
          projectLocation: posixLocation(),
          config: { model: "fixture-model" },
          initialSize: { cols: 80, rows: 24 },
          launchPrompt: "",
          command: fixtureSpec(),
          mcpLaunchSnapshot: { mcpServers: [], disabledBuiltInMcpServerIds: [] },
        }),
      ).toThrow(MockAgentLaunchBlockedError);
      expect(attach).not.toHaveBeenCalled();
      expect(sentinelRan()).toBeUndefined();
    });
  });

  describe("thread structured funnel (createStructuredSession)", () => {
    it("refuses before the adapter can create its session", async () => {
      mockSessionEnv();
      const { pipeline } = stubPipeline();
      const createSession = vi.fn<() => never>();
      const adapter = { createStructuredSession: createSession } as unknown as AgentAdapter;
      await expect(
        (
          pipeline as unknown as {
            createStructuredSession: (...args: unknown[]) => Promise<unknown>;
          }
        ).createStructuredSession(
          adapter,
          "thread-1",
          "fixture",
          posixLocation(),
          {},
          [],
          undefined,
          undefined,
          "gui",
        ),
      ).rejects.toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(createSession).not.toHaveBeenCalled();
    });
  });

  describe("one-shot subagent child (runOneShotChild)", () => {
    it("settles the attempt as failed without executing the fixture", async () => {
      mockSessionEnv();
      const onSettle =
        vi.fn<(result: { status: "completed" | "failed"; errorMessage?: string }) => void>();
      const deltas: string[] = [];
      runOneShotChild({
        adapter: {
          label: "Fixture",
          buildSubagentOneShotCommand: () => ({
            command: fixtureCommand,
            args: [],
            stdin: "prompt",
            env: fixtureEnv(),
          }),
        } as unknown as AgentAdapter,
        projectLocation: posixLocation(),
        model: "fixture-model",
        effort: undefined,
        prompt: "prompt",
        onTextDelta: (delta: string) => deltas.push(delta),
        onSettle,
      });
      await vi.waitFor(() => expect(onSettle).toHaveBeenCalled());
      expect(onSettle.mock.calls[0]?.[0]).toMatchObject({ status: "failed" });
      expect(String(onSettle.mock.calls[0]?.[0]?.errorMessage)).toContain(MOCK_AGENTS_ENV);
      expect(deltas).toEqual([]);
      expect(sentinelRan()).toBeUndefined();
    });
  });

  describe("session host funnel (spawnMuseServeHost)", () => {
    it("refuses the host spawn without executing the fixture", async () => {
      mockSessionEnv();
      await expect(
        spawnMuseServeHost(posixLocation(), { serveArgs: [], extraEnv: fixtureEnv() }),
      ).rejects.toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(sentinelRan()).toBeUndefined();
    });
  });

  describe("ACP probe and auth funnels", () => {
    it("capability probe fails closed without executing the fixture", async () => {
      mockSessionEnv();
      await expect(
        probeAcpCapabilities(fixtureCommand, [], workDir, {
          env: fixtureEnv(),
          timeoutMs: 5_000,
        }),
      ).resolves.toBeUndefined();
      expect(sentinelRan()).toBeUndefined();
    });

    it("sign-in flow is refused outright", async () => {
      mockSessionEnv();
      await expect(
        authenticateAcpAgent(fixtureCommand, [], "cached_token", {
          env: fixtureEnv(),
          timeoutMs: 5_000,
        }),
      ).rejects.toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(sentinelRan()).toBeUndefined();
    });

    it("logout flow is refused outright", async () => {
      mockSessionEnv();
      await expect(
        logoutAcpAgent(fixtureCommand, [], {
          env: fixtureEnv(),
          timeoutMs: 5_000,
        }),
      ).rejects.toBeInstanceOf(MockAgentLaunchBlockedError);
      expect(sentinelRan()).toBeUndefined();
    });
  });
});
